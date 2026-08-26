const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

// TASK-501 (FEAT-497) — the PLAYER half of browse's per-type Continue buttons.
// Browse navigates to the type's player with ?continueType=<media type>; the
// page's continue entry fires the unified queue engine's own advance (`next`)
// and renders from the snapshot like every other entry.
//
// The two stories that matter here are the engine's, not the app's: with things
// queued, the queue's front plays (story 1); with an empty queue and a source
// mid-play, the source's next item plays (story 2). Nothing in the app chooses
// between them — that is exactly why Continue is one `next` POST and not queue
// maths on this side.
//
// Music's own continue entry lives in tests/music-queue.test.js (it plays in
// audio.html); browse's buttons themselves are in tests/browse-queue.test.js
// (TV) and tests/companion-play-queue.test.js (phone).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grew-tv-person', 'kids'));
});

// ── films ───────────────────────────────────────────────────────────────────

test('Continue Films plays the queue front (film/next)', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('queue-item', { item_id: 'finding-nemo-main' });
  const posted = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/next') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?continueType=film&from=browse');
  const req = await posted;
  expect(req.url()).toContain('person=kids');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /finding-nemo-main/);
});

test('Continue Films advances the SOURCE when nothing is queued', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('play-source', { source_type: 'series', source_id: 'bluey', item_id: 'bluey-s1e01' });
  await page.goto('/app/homeview/video.html?continueType=film&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);
});

// ── home movies ─────────────────────────────────────────────────────────────

test('Continue Home Movies advances its own engine, not the film one', async ({ page }) => {
  await installApi(page);
  let filmAdvanced = false;
  await page.route('**/api/queue/film/next*', function(route) { filmAdvanced = true; return route.fulfill({ status: 204, body: '' }); });
  const backend = await installQueuePlaybackBackend(page, 'home-movie');
  backend.seed('play-source', { source_type: 'home-movies-all' });
  const posted = page.waitForRequest(req =>
    req.url().includes('/api/queue/home-movie/next') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?continueType=home-movie&from=browse');
  await posted;
  await expect(page.locator('#screen-video')).toBeVisible();
  // home-movies-all is millie-walk then beach-day; advancing lands on the second.
  await expect(page.locator('#video')).toHaveAttribute('src', /beach-day/);
  expect(filmAdvanced).toBe(false);
});

// ── music videos ────────────────────────────────────────────────────────────

test('Continue Music Videos plays its own queue front', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  backend.seed('queue-item', { item_id: 'mv-03' });
  const posted = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/next') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?continueType=music-video&from=browse');
  await posted;
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-03/);
  // The mv shape's own ＋Playlist affordance is revealed, as it is on every
  // other music-video entry.
  await expect(page.locator('#btn-add-playlist')).toBeVisible();
});
