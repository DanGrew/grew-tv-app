const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// BUG-439: video.html fires two independent async chains on load — the WS
// activate_person handshake (core/app-ws.js) and the play-standalone POST
// (screen-video-page.js startSingle/startSeries/startQueue — TASK-503:
// startSingle/startSeries now fire against the TASK-498 unified queue engine,
// /api/queue/film, not the old /api/video-playback). Over real latency the
// POST can land BEFORE the server has bound this person to a device, and
// ws_service's broadcast silently no-ops for an unbound person — the engine
// state is mutated, but the push that would have told this page about it
// never arrives, so the player sits inert forever. This backend stub
// reproduces exactly that: the play-standalone POST updates server state but
// never pushes over the WS (the drop), and activate_person's ack is delayed
// (the race). The fix pulls the current snapshot (GET /api/queue/film) once
// activate_person confirms the bind, recovering the state the dropped push
// would have carried.
test('recovers a dropped play-standalone snapshot once activate_person confirms the bind', async ({ page }) => {
  // Real navigation into video.html always carries a person set by the
  // profile picker earlier in the session (localStorage, not a URL param) —
  // seed it directly since this test skips the picker.
  await page.addInitScript(function() { localStorage.setItem('grew-tv-person', 'kids'); });
  await installApi(page);

  var order = [];
  var current = null;
  var ACTIVATE_DELAY_MS = 300;

  await page.routeWebSocket(/:8766/, function(ws) {
    ws.onMessage(function(raw) {
      var m = JSON.parse(raw);
      var REPLY = {
        activate_person: function() {
          [m.payload.person_id].filter(Boolean).forEach(function(pid) {
            setTimeout(function() {
              order.push('person_active');
              ws.send(JSON.stringify({ type: 'person_active', payload: { person_id: pid } }));
            }, ACTIVATE_DELAY_MS);
          });
        }
      };
      [REPLY[m.type]].filter(Boolean).forEach(function(fn) { fn(); });
    });
    // No push here on connect/action — the fixture never sends queue_playback
    // over the socket at all, standing in for the real server's silent no-op
    // broadcast while this person isn't bound yet (the exact drop BUG-439
    // reported). Recovery has to come from the GET resync alone.
  });

  function snapshot() {
    return {
      person_id: 'kids', media_type: 'film',
      now_playing: [current].filter(Boolean).map(function(id) {
        return { item_id: id, title: 'Toy Story', poster: 'toy-story.jpg', duration: 4860, subtitles: 'toy-story-main.vtt', type: 'animation', ext: null };
      }).concat([null])[0],
      queue: [], next: [], coming_up: [], source_type: null, source_id: null, repeat: false, shuffle: false
    };
  }

  await page.route(/\/api\/queue\/film\?/, function(route) {
    order.push('GET queue/film');
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot()) });
  });
  await page.route('**/api/queue/film/*', function(route) {
    var action = decodeURIComponent(route.request().url().split('/api/queue/film/')[1].split('?')[0]);
    order.push('POST ' + action);
    current = 'toy-story-main';
    route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/app/homeview/video.html?video=toy-story-main&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /toy-story-main/, { timeout: 8000 });

  expect(order.indexOf('POST play-standalone')).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('person_active')).toBeGreaterThan(order.indexOf('POST play-standalone'));
  expect(order.indexOf('GET queue/film')).toBeGreaterThan(order.indexOf('person_active'));
});

// BUG-518 (owner-reported during TASK-517 review: "sometimes when I select a
// film, it's playing the previous one I selected") — the OTHER ordering of the
// same two chains, which the recovery above cannot distinguish from a real one.
//
// The resync GET is issued as soon as activate_person confirms. When it goes
// out BEFORE the server has applied this page's play-standalone, it answers
// describing the PREVIOUS film. Nothing marked that answer as stale, so
// applyFmSnapshot took it, isSwap saw an item_id different from the one loaded,
// and the player swapped BACK — landing on the film the viewer had selected
// last time. Intermittent by nature: it needs the older question's answer to
// arrive after the newer one's.
//
// The fix is a pending-selection guard: entering with an explicit ?video=/
// series pick, the page ignores any snapshot naming a DIFFERENT item until one
// confirms the item it was opened for. It is dropped on that first confirming
// snapshot, so legitimate later moves (advance, a Queue pick, the companion
// driving) still apply normally — see core/queue-playback-router.isStaleSelection.
test('a late stale resync does not drag the player back to the previous film', async ({ page }) => {
  await page.addInitScript(function() { localStorage.setItem('grew-tv-person', 'kids'); });
  await installApi(page);

  var PREVIOUS = 'toy-story-main';      // what the engine is still playing
  var SELECTED = 'finding-nemo-main';   // what the viewer just picked

  function snapshotOf(id) {
    var TITLES = { 'toy-story-main': 'Toy Story', 'finding-nemo-main': 'Finding Nemo' };
    return {
      person_id: 'kids', media_type: 'film',
      now_playing: { item_id: id, title: TITLES[id], poster: id + '.jpg', duration: 4860, subtitles: null, type: 'animation', ext: null },
      queue: [], next: [], coming_up: [], source_type: null, source_id: null, repeat: false, shuffle: false
    };
  }

  var socket = null;
  await page.routeWebSocket(/:8766/, function(ws) {
    socket = ws;
    ws.onMessage(function(raw) {
      var m = JSON.parse(raw);
      // Ack the bind straight away — that is the ordering that bites, since it
      // sends the GET out while the play-standalone POST is still in flight.
      [m.type === 'activate_person' && m.payload.person_id].filter(Boolean).forEach(function(pid) {
        ws.send(JSON.stringify({ type: 'person_active', payload: { person_id: pid } }));
      });
    });
  });

  // ANSWERED late, describing the state as it was BEFORE the POST applied.
  await page.route(/\/api\/queue\/film\?/, function(route) {
    var stale = JSON.stringify(snapshotOf(PREVIOUS));
    setTimeout(function() {
      route.fulfill({ status: 200, contentType: 'application/json', body: stale });
    }, 400);
  });

  // The POST applies, and the server pushes the CORRECT snapshot straight away.
  await page.route('**/api/queue/film/*', function(route) {
    route.fulfill({ status: 204, body: '' });
    setTimeout(function() {
      [socket].filter(Boolean).forEach(function(ws) {
        ws.send(JSON.stringify({ type: 'queue_playback', payload: snapshotOf(SELECTED) }));
      });
    }, 50);
  });

  await page.goto('/app/homeview/video.html?video=' + SELECTED + '&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', new RegExp(SELECTED), { timeout: 8000 });

  // Let the stale answer (400ms) land, and settle well past it.
  await page.waitForTimeout(1500);
  await expect(page.locator('#video')).toHaveAttribute('src', new RegExp(SELECTED));
});
