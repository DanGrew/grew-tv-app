const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

// TASK-501 (FEAT-497) — the PLAYER half of browse's per-type Continue buttons.
// Browse navigates to the type's player with ?continueType=<media type>; the
// page's continue entry fires ONE queue action and renders from the snapshot
// like every other entry.
//
// TASK-555 — that action is `continue`, not `next`. Coming back to something you
// stopped halfway now picks that item up again instead of consuming it and
// starting the one after; with nothing playing, Continue is exactly the old
// behaviour. Nothing in the app chooses between those — that is still why this
// is one POST and not queue maths on this side.
//
// Music's own continue entry lives in tests/music-queue.test.js (it plays in
// audio.html); browse's buttons themselves are in tests/browse-queue.test.js
// (TV) and tests/companion-play-queue.test.js (phone).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grew-tv-person', 'kids'));
});

// ── films ───────────────────────────────────────────────────────────────────

test('Continue Films resumes the film you stopped, not the one after', async ({ page }) => {
  // TASK-555 story 1. bluey-s1e01 is mid-source and playing; the old `next`
  // POST landed on s1e02 here, which is the whole bug.
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('play-source', { source_type: 'series', source_id: 'bluey' });
  const posted = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/continue') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?continueType=film&from=browse');
  const req = await posted;
  expect(req.url()).toContain('person=kids');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
});

test('Continue Films replays the queued item without consuming it', async ({ page }) => {
  // TASK-555 stories 6/7 made load-bearing: the durable head stays queued, so
  // finishing and skipping are the only ways an item leaves.
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('queue-item', { item_id: 'finding-nemo-main' });
  backend.seed('play-queue', {});
  await page.goto('/app/homeview/video.html?continueType=film&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /finding-nemo-main/);
  expect(backend.snapshot().now_playing.item_id).toBe('finding-nemo-main');
});

test('Continue Films plays the queue front when nothing is playing', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('queue-item', { item_id: 'finding-nemo-main' });
  const posted = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/continue') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?continueType=film&from=browse');
  const req = await posted;
  expect(req.url()).toContain('person=kids');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /finding-nemo-main/);
});

// ── home movies ─────────────────────────────────────────────────────────────

test('Continue Home Movies resumes its own engine, not the film one', async ({ page }) => {
  await installApi(page);
  let filmTouched = false;
  await page.route('**/api/queue/film/continue*', function(route) { filmTouched = true; return route.fulfill({ status: 204, body: '' }); });
  const backend = await installQueuePlaybackBackend(page, 'home-movie');
  backend.seed('play-source', { source_type: 'home-movies-all' });
  const posted = page.waitForRequest(req =>
    req.url().includes('/api/queue/home-movie/continue') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?continueType=home-movie&from=browse');
  await posted;
  await expect(page.locator('#screen-video')).toBeVisible();
  // home-movies-all is millie-walk then beach-day; resuming stays on the first.
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
  expect(filmTouched).toBe(false);
});

// ── music videos ────────────────────────────────────────────────────────────

test('Continue Music Videos replays its own queue front', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  backend.seed('queue-item', { item_id: 'mv-03' });
  backend.seed('play-queue', {});
  const posted = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/continue') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?continueType=music-video&from=browse');
  await posted;
  await expect(page.locator('#screen-video')).toBeVisible();
  // TASK-555 story 5: the same video plays again, from its start.
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-03/);
  // The mv shape's own ＋Playlist affordance is revealed, as it is on every
  // other music-video entry.
  await expect(page.locator('#btn-add-playlist')).toBeVisible();
});
