const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');

// TASK-446 — Home Movies Play All / Shuffle All: SERVER-authoritative, like a
// series/boxset (video-playback.test.js), NOT the client-owned music-video
// playthrough (video-music-video.test.js) — the video engine's own
// `home-movies-all` source drives it, so it gets the persistent player's full
// snapshot-driven machinery (breadcrumb, up-next, series-mode transport) for
// free, the same way a series does.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
});

test('Play All fires play-source for home-movies-all, ordered, and plays the resolved item', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  const req = await playSource;
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movies-all', shuffle: false });
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
});

test('Shuffle All fires play-source with shuffle true', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&shuffle=1&from=browse');
  const req = await playSource;
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movies-all', shuffle: true });
});

// TASK-422-style: no source page to link back to (mirrors mvAll — story 4 has
// no equivalent here) — Home > leaf only, like a standalone film.
test('breadcrumb degrades to Home > leaf — no source page', async ({ page }) => {
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Millie Walk');
});
