const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

// FEAT-040 (TV browse queue affordances): film tiles carry a ＋ badge (queue the
// film to Play Next). TASK-259 replaced the single "▶ Play Queue (N)" pill with TWO
// adjacent icon+count buttons bottom-right — 🎬 video → video.html?playQueue and
// 🎵 music → audio.html?playQueue — each shown only when ITS OWN override queue is
// non-empty (icon+`(N)` style matching the companion, TASK-258). Backend (queue-video
// / GET snapshots / play-queue) already merged. The companion mirror shipped in #163/#164.

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

test('video queue button is hidden when the video queue is empty', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeVisible();   // settled
  await expect(page.locator('#btn-play-queue')).toBeHidden();
});

test('video queue button 🎬 (N) shows the count and opens the video player at the queue head', async ({ page }) => {
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('queue-video', { video_id: 'finding-nemo-main' });
  vb.seed('queue-video', { video_id: 'toy-story-main' });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#btn-play-queue')).toHaveText('🎬 (2)');
  await page.locator('#btn-play-queue').click();
  await expect(page).toHaveURL(/video\.html\?.*playQueue=1/);
});

// TASK-259: the MUSIC twin beside the video button — shown only when the music
// override ("Play Next") queue is non-empty (count from GET /api/playback via
// playNextCount), tapping opens the TV audio page at the queue head
// (audio.html?playQueue). Stub GET /api/playback after installApi so it wins.
async function routeMusicQueue(page, playNext) {
  await page.route(/\/api\/playback\?/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ person_id: 'kids', play_next: playNext }) }));
}

test('music queue button is hidden when the music queue is empty', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeMusicQueue(page, []);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeVisible();   // settled
  await expect(page.locator('#btn-play-queue-music')).toBeHidden();
});

test('music queue button 🎵 (N) shows the count and opens the audio player at the queue head', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeMusicQueue(page, [{ track_id: 'a' }, { track_id: 'b' }]);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#btn-play-queue-music')).toHaveText('🎵 (2)');
  await page.locator('#btn-play-queue-music').click();
  await expect(page).toHaveURL(/audio\.html\?.*playQueue=1/);
});

test('the two queue buttons show independently — video queued, music empty', async ({ page }) => {
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('queue-video', { video_id: 'finding-nemo-main' });
  await routeMusicQueue(page, []);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#btn-play-queue')).toHaveText('🎬 (1)');
  await expect(page.locator('#btn-play-queue-music')).toBeHidden();
});

// TASK-374/377: a music video is never queued to the film Play Next engine
// (the owner ruled that engine out as its player entirely) — its tile must
// carry no ＋ badge, unlike a plain film/video tile.
test('a music-video tile carries no ＋ Queue badge', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="music-videos"]').click();
  await expect(page.locator('.film-tile[data-id="mv-01"]')).toBeVisible();
  await expect(page.locator('.film-tile[data-id="mv-01"] .tile-queue')).toHaveCount(0);
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
