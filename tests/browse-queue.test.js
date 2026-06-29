const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');

// FEAT-040 (TV browse queue affordances): film tiles carry a ＋ badge (queue the
// film to Play Next); a "▶ Play Queue (N)" pill (the repurposed bottom-right
// settings button) appears when the video queue is non-empty and opens the player
// at the queue head (?playQueue). Backend (queue-video / GET snapshot / play-queue)
// already merged. The companion mirror shipped in #163/#164.

// The active person is the device's picked person (localStorage), not a URL param.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grew-tv-person', 'kids'));
});

async function openFilms(page) {
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await expect(page.locator('.film-tile[data-id="finding-nemo-main"]')).toBeVisible();
}

test('film tiles carry a ＋ Queue badge; series tiles do not', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await openFilms(page);
  await expect(page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue')).toHaveText('＋');
  await page.locator('.sidebar-tab[data-tab="series"]').click();
  await expect(page.locator('.film-tile[data-id="bluey"]')).toBeVisible();
  await expect(page.locator('.film-tile[data-id="bluey"] .tile-queue')).toHaveCount(0);
});

test('tapping ＋ queues the film (POST queue-video) without opening the player', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await openFilms(page);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/queue-video') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue').click();
  const req = await queued;
  expect(req.url()).toContain('person=kids');
  expect(JSON.parse(req.postData())).toEqual({ video_id: 'finding-nemo-main' });
  await expect(page.locator('#queue-status')).toHaveText('Queued to Play Next');
  await expect(page).toHaveURL(/browse\.html/);          // did NOT open the player
});

test('tapping the film tile body (not the ＋) opens the player', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await openFilms(page);
  await page.locator('.film-tile[data-id="finding-nemo-main"]').click();
  await expect(page).toHaveURL(/video\.html/);
});

test('Play Queue pill is hidden when the video queue is empty', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeVisible();   // settled
  await expect(page.locator('#btn-play-queue')).toBeHidden();
});

test('Play Queue pill shows the count and opens the player at the queue head', async ({ page }) => {
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('queue-video', { video_id: 'finding-nemo-main' });
  vb.seed('queue-video', { video_id: 'toy-story-main' });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#btn-play-queue')).toHaveText('▶ Play Queue (2)');
  await page.locator('#btn-play-queue').click();
  await expect(page).toHaveURL(/video\.html\?.*playQueue=1/);
});

test('rail-grid film tiles also carry the ＋ badge and queue', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/rail-grid.html?section=films&rail=genre:animation&profile=kids&person=kids');
  await expect(page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue')).toBeVisible();
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/queue-video') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue').click();
  expect(JSON.parse((await queued).postData())).toEqual({ video_id: 'finding-nemo-main' });
  await expect(page.locator('#queue-status')).toHaveText('Queued to Play Next');
});
