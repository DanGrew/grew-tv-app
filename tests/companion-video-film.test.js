const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-503 (FEAT-497) — companion mirror for film mode (series/single/boxset):
// the companion shows the item as what is playing (title/pill on-off ride
// the TV's own `context` push, mirroring the home-movie pattern in
// companion-video-home-movie.test.js — this is its OWN small WS mock, not
// installQueuePlaybackBackend, whose snapshot_request answers with a full
// engine session instead of a bare context push), but its transport drives
// it over PLANE B — a direct POST to the unified queue engine
// (/api/queue/film), never the OLD video-playback engine (series/single has
// no session there any more) and never the WS intent rail for prev/next/
// shuffle/repeat.

async function installFilmBackend(page, opts) {
  var o = opts || {};
  var intents = [];
  var videoPlaybackPosts = [];
  var queuePlaybackPosts = [];
  await page.route('**/api/video-playback/**', function(route) {
    videoPlaybackPosts.push(route.request().url());
    route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/queue/film/**', function(route) {
    queuePlaybackPosts.push(route.request().url());
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
              film: true, filmShuffle: !!o.shuffle, filmRepeat: o.repeat === undefined ? true : !!o.repeat,
              filmHasSource: o.hasSource === undefined ? true : !!o.hasSource
            }
          }));
          ws.send(JSON.stringify({ type: 'app_state', payload: { person: 'kids', profile: 'kids', screen: 'player' } }));
        }
      };
      [REPLY[m.type]].filter(Boolean).forEach(function(fn) { fn(); });
    });
  });
  return { intents: intents, videoPlaybackPosts: videoPlaybackPosts, queuePlaybackPosts: queuePlaybackPosts };
}

test('the companion shows the film as what is playing', async ({ page }) => {
  await installApi(page);
  await installFilmBackend(page, { id: 'bluey-s1e01', title: 'Daddy Putdown' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#ctx-label')).toHaveText('Now playing');
  await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
});

test('pause/resume stays on the WS intent rail; next/previous POST straight to the unified queue engine', async ({ page }) => {
  await installApi(page);
  const backend = await installFilmBackend(page, { id: 'bluey-s1e01', title: 'Daddy Putdown' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
  await page.locator('#c-toggle').click();
  await page.locator('#c-next').click();
  await page.locator('#c-prev').click();
  const intentTypes = backend.intents.filter(function(m) { return m.type === 'intent'; }).map(function(m) { return m.payload.intent; });
  expect(intentTypes).toEqual(['toggle']); // next/prev never ride the intent rail
  expect(backend.videoPlaybackPosts).toEqual([]); // never the retired series/single session
  expect(backend.queuePlaybackPosts.some(function(u) { return u.includes('/next'); })).toBe(true);
  expect(backend.queuePlaybackPosts.some(function(u) { return u.includes('/previous'); })).toBe(true);
});

test('the queue link points at the film Queue View', async ({ page }) => {
  await installApi(page);
  await installFilmBackend(page, { id: 'bluey-s1e01', title: 'Daddy Putdown' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
  await expect(page.locator('#c-queue')).toBeVisible();
  await page.locator('#c-queue').click();
  await expect(page).toHaveURL(/film-queue\.html/);
});

// QUEUE-UX-SHELL.md's Hero section: Shuffle/Repeat are ALWAYS shown for a
// film (never hidden the way a lone music-video pick hides them).
test('Shuffle/Repeat are always visible on the companion for a film', async ({ page }) => {
  await installApi(page);
  await installFilmBackend(page, { id: 'bluey-s1e01', title: 'Daddy Putdown' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
  await expect(page.locator('#c-repeat')).toBeVisible();
  await expect(page.locator('#c-shuffle')).toBeVisible();
});

test('Shuffle/Repeat on/off state on the companion mirrors the TV context', async ({ page }) => {
  await installApi(page);
  await installFilmBackend(page, { id: 'bluey-s1e01', title: 'Daddy Putdown', shuffle: true, repeat: true });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
  await expect(page.locator('#c-repeat')).toHaveClass(/on/);
  await expect(page.locator('#c-shuffle')).toHaveClass(/on/);
});

test('tapping Repeat/Shuffle on the companion POSTs straight to the unified queue engine', async ({ page }) => {
  await installApi(page);
  const backend = await installFilmBackend(page, { id: 'bluey-s1e01', title: 'Daddy Putdown' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
  await page.locator('#c-repeat').click();
  await page.locator('#c-shuffle').click();
  const intentTypes = backend.intents.filter(function(m) { return m.type === 'intent'; }).map(function(m) { return m.payload.intent; });
  expect(intentTypes).toEqual([]); // never the intent rail
  expect(backend.videoPlaybackPosts).toEqual([]); // never the retired series/single session
  expect(backend.queuePlaybackPosts.some(function(u) { return u.includes('/toggle-repeat'); })).toBe(true);
  expect(backend.queuePlaybackPosts.some(function(u) { return u.includes('/toggle-shuffle'); })).toBe(true);
});

// ⏮/⏭ stay live for a series/boxset (a source), unlike a standalone film with
// nothing to skip to.
test('⏮/⏭ stay ungreyed on the companion when the film has a source', async ({ page }) => {
  await installApi(page);
  await installFilmBackend(page, { id: 'bluey-s1e01', title: 'Daddy Putdown' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
  await expect(page.locator('#c-prev')).not.toHaveClass(/single/);
  await expect(page.locator('#c-next')).not.toHaveClass(/single/);
});

// TASK-493 row 21 (the Films-hides-Shuffle finding) / TASK-503 — a standalone
// film has NOTHING to shuffle/repeat (play-standalone clears source_type):
// the pills stay VISIBLE but disabled-but-visible, matching the TV hero's own
// `.is-disabled` treatment (here, the companion's existing `.single` opacity
// look — applyFilmMode reuses it rather than inventing a second "disabled"
// class). ⏮/⏭ grey out on the SAME signal.
test('Shuffle/Repeat and ⏮/⏭ render disabled-but-visible for a standalone film (nothing to shuffle/repeat)', async ({ page }) => {
  await installApi(page);
  await installFilmBackend(page, { id: 'toy-story-main', title: 'Toy Story', hasSource: false });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Toy Story');
  await expect(page.locator('#c-repeat')).toBeVisible();
  await expect(page.locator('#c-shuffle')).toBeVisible();
  await expect(page.locator('#c-repeat')).toHaveClass(/single/);
  await expect(page.locator('#c-shuffle')).toHaveClass(/single/);
  await expect(page.locator('#c-prev')).toHaveClass(/single/);
  await expect(page.locator('#c-next')).toHaveClass(/single/);
});
