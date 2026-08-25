const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');
const { enterBrowse } = require('./fixtures/nav.js');

// TASK-421 (story 3) — a music-video playlist row's per-track ＋ sheet must
// queue under the music-video media type, never music's — the two queues stay
// apart. Mirrors tests/playlist-detail-add.test.js (the song-playlist twin of
// this suite). TASK-505 moved that POST onto the unified engine, so it appends
// to the end of the queue and confirms "Added to Queue".

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      profile: 'kids', genreLabels: BROWSE.kids.genreLabels,
      content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS).concat(MUSIC_VIDEO_CARDS)
    })
  }));
  await page.goto('/app/homeview/profile.html');
});

async function openPlaylist(page) {
  await enterBrowse(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="music-videos"]').click();
  await page.locator('.film-tile[data-id="pl-mv"]').click();
  await expect(page).toHaveURL(/playlist-detail\.html/);
  await expect(page.locator('.detail-row').first()).toBeVisible();
}

test('queueing a music-video row POSTs queue-item under its own media type (person=)', async ({ page }) => {
  await page.route('**/api/queue/music-video/queue-item**', route => route.fulfill({ status: 204, body: '' }));
  await openPlaylist(page);
  await page.locator('.detail-row[data-id="mv-01"] .detail-add').click();
  await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Play Next');
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/queue-item') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-queue').click();
  const req = await queued;
  expect(req.url()).toContain('person=kids');
  expect(JSON.parse(req.postData())).toEqual({ item_id: 'mv-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to Queue');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('queueing a music-video row never lands in the music queue', async ({ page }) => {
  let musicQueued = false;
  await page.route('**/api/queue/music/queue-item**', route => { musicQueued = true; return route.fulfill({ status: 204, body: '' }); });
  await page.route('**/api/queue/music-video/queue-item**', route => route.fulfill({ status: 204, body: '' }));
  await openPlaylist(page);
  await page.locator('.detail-row[data-id="mv-01"] .detail-add').click();
  await page.locator('#add-sheet-list .add-queue').click();
  await expect(page.locator('#add-status')).toHaveText('Added to Queue');
  expect(musicQueued).toBe(false);
});
