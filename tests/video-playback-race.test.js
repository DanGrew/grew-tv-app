const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// BUG-439: video.html fires two independent async chains on load — the WS
// activate_person handshake (core/app-ws.js) and the play-video POST
// (screen-video-page.js startSingle/startSeries/startQueue). Over real
// latency the POST can land BEFORE the server has bound this person to a
// device, and ws_service.broadcast_video_playback silently no-ops for an
// unbound person — the engine state is mutated, but the push that would
// have told this page about it never arrives, so the player sits inert
// forever. This backend stub reproduces exactly that: the play-video POST
// updates server state but never pushes over the WS (the drop), and
// activate_person's ack is delayed (the race). The fix pulls the current
// snapshot (GET /api/video-playback) once activate_person confirms the
// bind, recovering the state the dropped push would have carried.
test('recovers a dropped play-video snapshot once activate_person confirms the bind', async ({ page }) => {
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
    // No push here on connect/action — the fixture never sends video_playback
    // over the socket at all, standing in for the real server's silent no-op
    // broadcast while this person isn't bound yet (the exact drop BUG-439
    // reported). Recovery has to come from the GET resync alone.
  });

  function snapshot() {
    return {
      person_id: 'kids',
      now_playing: [current].filter(Boolean).map(function(id) {
        return { item_id: id, title: 'Toy Story', poster: 'toy-story.jpg', duration: 4860, subtitles: 'toy-story-main.vtt', type: 'animation', ext: null };
      }).concat([null])[0],
      current_item_index: 0, items: [], override_queue: [], source_type: null, source_id: null, repeat: false, shuffle: false
    };
  }

  await page.route(/\/api\/video-playback\?/, function(route) {
    order.push('GET video-playback');
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot()) });
  });
  await page.route('**/api/video-playback/*', function(route) {
    var action = decodeURIComponent(route.request().url().split('/api/video-playback/')[1].split('?')[0]);
    order.push('POST ' + action);
    current = 'toy-story-main';
    route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/app/homeview/video.html?video=toy-story-main&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /toy-story-main/, { timeout: 8000 });

  expect(order.indexOf('POST play-video')).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('person_active')).toBeGreaterThan(order.indexOf('POST play-video'));
  expect(order.indexOf('GET video-playback')).toBeGreaterThan(order.indexOf('person_active'));
});
