const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-499 (FEAT-497) — companion mirror for home-movie mode: the companion
// shows the clip as what is playing (title/up-next/pill on-off ride the TV's
// own `context` push, mirroring the mv pattern in
// companion-video-music-video.test.js — this is its OWN small WS mock, not
// installQueuePlaybackBackend, whose snapshot_request answers with a full
// engine session instead of a bare context push), but its transport drives
// it over PLANE B — a direct POST to the unified queue engine
// (/api/queue/home-movie), never the video-playback engine (a home movie has
// no session there any more) and never the WS intent rail for prev/next/
// shuffle/repeat.

async function installHomeMovieBackend(page, opts) {
  var o = opts || {};
  var intents = [];
  var videoPlaybackPosts = [];
  var queuePlaybackPosts = [];
  await page.route('**/api/video-playback/**', function(route) {
    videoPlaybackPosts.push(route.request().url());
    route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/queue/home-movie/**', function(route) {
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
              homeMovie: true, homeMovieShuffle: !!o.shuffle, homeMovieRepeat: !!o.repeat,
              // TASK-524 — the TV resolves the transport off the ONE
              // transportState rule and pushes booleans; a home movie always
              // plays from a source, so all four are live unless a test says
              // otherwise (the end of a list, where ⏭ has nowhere to go).
              homeMovieTransport: [o.transport].filter(Boolean)
                .concat([{ previous: true, next: true, shuffle: true, repeat: true }])[0]
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

test('the companion shows the home movie clip as what is playing', async ({ page }) => {
  await installApi(page);
  await installHomeMovieBackend(page, { id: 'millie-walk', title: 'Millie Walk' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#ctx-label')).toHaveText('Now playing');
  await expect(page.locator('#now-title')).toHaveText('Millie Walk');
});

test('pause/resume stays on the WS intent rail; next/previous POST straight to the unified queue engine', async ({ page }) => {
  await installApi(page);
  const backend = await installHomeMovieBackend(page, { id: 'millie-walk', title: 'Millie Walk' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Millie Walk');
  await page.locator('#c-toggle').click();
  await page.locator('#c-next').click();
  await page.locator('#c-prev').click();
  const intentTypes = backend.intents.filter(function(m) { return m.type === 'intent'; }).map(function(m) { return m.payload.intent; });
  expect(intentTypes).toEqual(['toggle']); // next/prev never ride the intent rail
  expect(backend.videoPlaybackPosts).toEqual([]); // never the retired film/series session
  expect(backend.queuePlaybackPosts.some(function(u) { return u.includes('/next'); })).toBe(true);
  expect(backend.queuePlaybackPosts.some(function(u) { return u.includes('/previous'); })).toBe(true);
});

test('the queue link points at the home-movies Queue View', async ({ page }) => {
  await installApi(page);
  await installHomeMovieBackend(page, { id: 'millie-walk', title: 'Millie Walk' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Millie Walk');
  await expect(page.locator('#c-queue')).toBeVisible();
  await page.locator('#c-queue').click();
  await expect(page).toHaveURL(/home-movies-queue\.html/);
});

// QUEUE-UX-SHELL.md's Hero section: Shuffle/Repeat are ALWAYS shown for a
// home movie — never gated on item count the way a music video's own
// isMulti check hides them.
test('Shuffle/Repeat are always visible on the companion for a home movie', async ({ page }) => {
  await installApi(page);
  await installHomeMovieBackend(page, { id: 'millie-walk', title: 'Millie Walk' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Millie Walk');
  await expect(page.locator('#c-repeat')).toBeVisible();
  await expect(page.locator('#c-shuffle')).toBeVisible();
});

test('Shuffle/Repeat on/off state on the companion mirrors the TV context', async ({ page }) => {
  await installApi(page);
  await installHomeMovieBackend(page, { id: 'millie-walk', title: 'Millie Walk', shuffle: true, repeat: true });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Millie Walk');
  await expect(page.locator('#c-repeat')).toHaveClass(/on/);
  await expect(page.locator('#c-shuffle')).toHaveClass(/on/);
});

test('tapping Repeat/Shuffle on the companion POSTs straight to the unified queue engine', async ({ page }) => {
  await installApi(page);
  const backend = await installHomeMovieBackend(page, { id: 'millie-walk', title: 'Millie Walk' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Millie Walk');
  await page.locator('#c-repeat').click();
  await page.locator('#c-shuffle').click();
  const intentTypes = backend.intents.filter(function(m) { return m.type === 'intent'; }).map(function(m) { return m.payload.intent; });
  expect(intentTypes).toEqual([]); // never the intent rail
  expect(backend.videoPlaybackPosts).toEqual([]); // never the retired film/series session
  expect(backend.queuePlaybackPosts.some(function(u) { return u.includes('/toggle-repeat'); })).toBe(true);
  expect(backend.queuePlaybackPosts.some(function(u) { return u.includes('/toggle-shuffle'); })).toBe(true);
});

// Playing inside a list, everything ahead: all four controls live.
test('⏮/⏭ stay ungreyed on the companion mid-list', async ({ page }) => {
  await installApi(page);
  await installHomeMovieBackend(page, { id: 'millie-walk', title: 'Millie Walk' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Millie Walk');
  await expect(page.locator('#c-prev')).not.toHaveClass(/single/);
  await expect(page.locator('#c-next')).not.toHaveClass(/single/);
});

// ⛔ TASK-524 — this page used to un-hide a home movie's controls
// unconditionally and dim nothing, whatever the TV pushed: ⏭ read live on the
// last clip of a list with nothing behind it, while the home-movie Queue page
// one tap away dimmed it. It reads the resolved `homeMovieTransport` now, the
// same field a film and a music video already rode (TASK-517/505) — so the
// phone row, the TV row and both heroes finally agree.
test('⏭ dims on the companion at the end of a list, the rest staying live', async ({ page }) => {
  await installApi(page);
  await installHomeMovieBackend(page, {
    id: 'millie-walk', title: 'Millie Walk',
    transport: { previous: true, next: false, shuffle: true, repeat: true }
  });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Millie Walk');
  await expect(page.locator('#c-next')).toBeVisible();      // dimmed, never hidden
  await expect(page.locator('#c-next')).toHaveClass(/single/);
  await expect(page.locator('#c-prev')).not.toHaveClass(/single/);
  await expect(page.locator('#c-shuffle')).not.toHaveClass(/single/);
  await expect(page.locator('#c-repeat')).not.toHaveClass(/single/);
});
