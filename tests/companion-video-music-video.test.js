const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-374 — companion mirror for a music video: the companion shows
// the music video as what is playing and its controls drive it — but NEVER
// through the video-playback engine (Plane B), since a music video has no
// engine session at all. This is its OWN small WS mock (not
// installVideoPlaybackBackend, whose snapshot_request answers with an ENGINE
// session) — it replies to the companion handshake with the `context`/
// `app_state` pair screen-video-page.js actually sends while a music video
// plays: `musicVideo` + `musicVideoMulti` ride the CONTEXT, app_state is
// untouched by music-video mode.

async function installMusicVideoBackend(page, opts) {
  var o = opts || {};
  var intents = [];
  var videoPlaybackPosts = [];
  await page.route('**/api/video-playback/**', function(route) {
    videoPlaybackPosts.push(route.request().url());
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
            payload: { context_id: 'video', version: 1, display: { id: o.id, title: o.title }, musicVideo: true, musicVideoMulti: !!o.multi }
          }));
          ws.send(JSON.stringify({ type: 'app_state', payload: { person: 'kids', profile: 'kids', screen: 'player' } }));
        }
      };
      [REPLY[m.type]].filter(Boolean).forEach(function(fn) { fn(); });
    });
  });
  return { intents: intents, videoPlaybackPosts: videoPlaybackPosts };
}

test('the companion shows the music video as what is playing', async ({ page }) => {
  await installApi(page);
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', multi: false });
  await page.goto('/companion/video.html');
  await expect(page.locator('#ctx-label')).toHaveText('Now playing');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
});

test('pause/resume and next/previous drive the TV over the WS intent rail, never the video-playback engine', async ({ page }) => {
  await installApi(page);
  const backend = await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', multi: true });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await page.locator('#c-toggle').click();
  await page.locator('#c-next').click();
  await page.locator('#c-prev').click();
  const intentTypes = backend.intents.filter(function(m) { return m.type === 'intent'; }).map(function(m) { return m.payload.intent; });
  expect(intentTypes).toEqual(expect.arrayContaining(['toggle', 'next', 'prev']));
  expect(backend.videoPlaybackPosts).toEqual([]);
});

test('a music video offers no repeat and no queue on the companion', async ({ page }) => {
  await installApi(page);
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', multi: true });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('#c-repeat')).toBeHidden();
  await expect(page.locator('#c-queue')).toBeHidden();
});

test('a lone music video pick greys ⏮/⏭ on the companion (single-item playthrough)', async ({ page }) => {
  await installApi(page);
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', multi: false });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('#c-prev')).toHaveClass(/single/);
  await expect(page.locator('#c-next')).toHaveClass(/single/);
});

// Music-video mode must not leak into ordinary video playback. This
// replays the companion messages in the order PRODUCTION sends them for a
// STANDALONE FILM: the engine's video_playback snapshot FIRST (the server
// broadcasts it the moment play-video lands), THEN the TV's own `context` push
// — which screen-video-page sends from onIntent('play') / onIntent('video'),
// and those only run once the player has swapped that snapshot in.
//
// installVideoPlaybackBackend replays context BEFORE the snapshot, the reverse
// of production, so the snapshot always got the last word there and this went
// unnoticed: applyMusicVideoMode's OFF branch cleared `single` from ⏮/⏭ and
// re-armed the transport on a one-item source.
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
