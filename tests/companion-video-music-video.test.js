const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-374, TASK-505 — companion mirror for a music video: the companion shows
// the music video as what is playing (title/up-next/control state still ride
// the TV's own `context` push, unchanged plumbing — this is its OWN small WS
// mock, not installQueuePlaybackBackend, whose snapshot_request answers with a
// full engine session instead of a bare context push), and its transport
// drives it over PLANE B — a direct POST to the TASK-498 unified engine under
// media_type 'music-video', the SAME mechanism films and home movies already
// use, never the video-playback engine (a music video has no session there)
// and never the WS intent rail.
//
// TASK-505 also replaced the raw `musicVideoMulti` flag this page used to
// re-derive a show/hide from with the RESOLVED `musicVideoTransport` — the one
// transportState rule both surfaces read (core/queue-shell-view.js), pushed as
// booleans, exactly as TASK-517 did for films. `o.transport` below is that
// push; absent means "nothing to act on", which is a lone pick.

// A source-backed playthrough: everything live. A lone pick pushes nothing,
// so every control dims.
var WITH_SOURCE = { previous: true, next: true, shuffle: true, repeat: true };

async function installMusicVideoBackend(page, opts) {
  var o = opts || {};
  var intents = [];
  var videoPlaybackPosts = [];
  var queuePosts = [];
  await page.route('**/api/video-playback/**', function(route) {
    videoPlaybackPosts.push(route.request().url());
    route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/queue/music-video/**', function(route) {
    queuePosts.push(route.request().url());
    route.fulfill({ status: 204, body: '' });
  });
  await page.routeWebSocket(/:8766/, function(ws) {
    ws.onMessage(function(raw) {
      var m = JSON.parse(raw);
      intents.push(m);
      var REPLY = {
        list_devices: function() {
          ws.send(JSON.stringify({ type: 'devices', payload: { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] } }));
        },
        register_companion: function() {},
        snapshot_request: function() {
          ws.send(JSON.stringify({
            type: 'context',
            payload: {
              context_id: 'video', version: 1, display: { id: o.id, title: o.title },
              musicVideo: true, musicVideoTransport: o.transport,
              musicVideoShuffle: !!o.shuffle, musicVideoRepeat: !!o.repeat
            }
          }));
          ws.send(JSON.stringify({ type: 'app_state', payload: { person: 'kids', profile: 'kids', screen: 'player' } }));
        }
      };
      [REPLY[m.type]].filter(Boolean).forEach(function(fn) { fn(); });
    });
  });
  return { intents: intents, videoPlaybackPosts: videoPlaybackPosts, queuePosts: queuePosts };
}

test('the companion shows the music video as what is playing', async ({ page }) => {
  await installApi(page);
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#ctx-label')).toHaveText('Now playing');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
});

test('pause/resume stays on the WS intent rail; next/previous POST straight to the unified engine', async ({ page }) => {
  await installApi(page);
  const backend = await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', transport: WITH_SOURCE });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await page.locator('#c-toggle').click();
  await page.locator('#c-next').click();
  await page.locator('#c-prev').click();
  const intentTypes = backend.intents.filter(function(m) { return m.type === 'intent'; }).map(function(m) { return m.payload.intent; });
  expect(intentTypes).toEqual(['toggle']); // next/prev do not ride the intent rail
  expect(backend.videoPlaybackPosts).toEqual([]); // never the film/series engine
  expect(backend.queuePosts.some(function(u) { return u.includes('/next'); })).toBe(true);
  expect(backend.queuePosts.some(function(u) { return u.includes('/previous'); })).toBe(true);
});

// FEAT-418 (TASK-420): the queue link stays visible for a music video and
// repoints to its own Queue page instead of hiding.
test('a music video\'s queue link stays visible and points at the music-video Queue page', async ({ page }) => {
  await installApi(page);
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', transport: WITH_SOURCE });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('#c-queue')).toBeVisible();
  await page.locator('#c-queue').click();
  await expect(page).toHaveURL(/music-video-queue\.html/);
});

// Story 4 on the phone — a lone pick used to LOSE Shuffle/Repeat outright
// here, and grey ⏮/⏭. Every control stays, dimmed, exactly as the TV row and
// the Queue hero now render it.
test('a lone music video pick dims Shuffle/Repeat on the companion rather than hiding them', async ({ page }) => {
  await installApi(page);
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('#c-repeat')).toBeVisible();
  await expect(page.locator('#c-shuffle')).toBeVisible();
  await expect(page.locator('#c-repeat')).toHaveClass(/single/);
  await expect(page.locator('#c-shuffle')).toHaveClass(/single/);
});

test('a source-backed playthrough lights Shuffle + Repeat on the companion, mirroring the TV', async ({ page }) => {
  await installApi(page);
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', transport: WITH_SOURCE });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('#c-repeat')).toBeVisible();
  await expect(page.locator('#c-shuffle')).toBeVisible();
  await expect(page.locator('#c-repeat')).not.toHaveClass(/single/);
  await expect(page.locator('#c-shuffle')).not.toHaveClass(/single/);
});

test('Shuffle/Repeat on/off state on the companion mirrors the TV context', async ({ page }) => {
  await installApi(page);
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', transport: WITH_SOURCE, shuffle: true, repeat: true });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('#c-repeat')).toHaveClass(/on/);
  await expect(page.locator('#c-shuffle')).toHaveClass(/on/);
});

test('tapping Repeat/Shuffle on the companion POSTs straight to the unified engine', async ({ page }) => {
  await installApi(page);
  const backend = await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', transport: WITH_SOURCE });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await page.locator('#c-repeat').click();
  await page.locator('#c-shuffle').click();
  const intentTypes = backend.intents.filter(function(m) { return m.type === 'intent'; }).map(function(m) { return m.payload.intent; });
  expect(intentTypes).toEqual([]); // no longer ride the intent rail
  expect(backend.videoPlaybackPosts).toEqual([]); // never the film/series engine
  expect(backend.queuePosts.some(function(u) { return u.includes('/toggle-repeat'); })).toBe(true);
  expect(backend.queuePosts.some(function(u) { return u.includes('/toggle-shuffle'); })).toBe(true);
});

test('a lone music video pick greys ⏮/⏭ on the companion, still visible', async ({ page }) => {
  await installApi(page);
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('#c-prev')).toBeVisible();
  await expect(page.locator('#c-prev')).toHaveClass(/single/);
  await expect(page.locator('#c-next')).toHaveClass(/single/);
});

// A queued video revives ⏭ even for a lone pick — the shared rule's own
// "anything ahead" clause, which no multi-item flag could express.
test('a queued music video lights ⏭ on the companion behind a lone pick', async ({ page }) => {
  await installApi(page);
  await installMusicVideoBackend(page, {
    id: 'mv-01', title: 'Head Like a Haunted House',
    transport: { previous: false, next: true, shuffle: false, repeat: false }
  });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('#c-next')).not.toHaveClass(/single/);
  await expect(page.locator('#c-prev')).toHaveClass(/single/);
});

// Music-video mode must not leak into ordinary video playback. This
// replays the companion messages in the order PRODUCTION sends them for a
// STANDALONE FILM: the engine's video_playback snapshot FIRST (the server
// broadcasts it the moment play-video lands), THEN the TV's own `context` push
// — which screen-video-page sends from onIntent('play') / onIntent('video'),
// and those only run once the player has swapped that snapshot in.
//
// installVideoPlaybackBackend replays context BEFORE the snapshot, the reverse
// of production, so the snapshot always got the last word there and the
// original defect went unnoticed: applyMusicVideoMode's OFF branch cleared
// `single` from ⏮/⏭ and re-armed the transport on a one-item source. TASK-505
// removed that branch outright — a mode that is off now touches nothing, so
// the video snapshot's own applySeriesMode is the sole owner here.
async function installSingleFilmBackend(page) {
  var item = { item_id: 'moana', title: 'Moana', duration: 6000 };
  await page.routeWebSocket(/:8766/, function(ws) {
    function reply(type, payload) { ws.send(JSON.stringify({ type: type, payload: payload })); }
    ws.onMessage(function(raw) {
      var m = JSON.parse(raw);
      var REPLY = {
        list_devices: function() { reply('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }); },
        register_companion: function() {},
        snapshot_request: function() {
          reply('video_playback', {
            person_id: 'kids', now_playing: item, current_item_index: 0, items: [item],
            override_queue: [], source_type: 'video', source_id: 'moana', repeat: false, shuffle: false
          });
          reply('app_state', { person: 'kids', profile: 'kids', screen: 'player' });
          reply('context', { context_id: 'video', version: 1, display: { id: 'moana', title: 'Moana' } });
        }
      };
      [REPLY[m.type]].filter(Boolean).forEach(function(fn) { fn(); });
    });
  });
}

test('a standalone film keeps its greyed transport when the TV context push follows the snapshot', async ({ page }) => {
  await installApi(page);
  await installSingleFilmBackend(page);
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Moana');
  // one-item source -> seriesMode false -> the whole row greys, as before TASK-374.
  await expect(page.locator('#c-repeat')).toHaveClass(/single/);
  await expect(page.locator('#c-prev')).toHaveClass(/single/);
  await expect(page.locator('#c-next')).toHaveClass(/single/);
  // and the film keeps its repeat pill and queue link — those hide only for a music video.
  await expect(page.locator('#c-repeat')).toBeVisible();
  await expect(page.locator('#c-queue')).toBeVisible();
});
