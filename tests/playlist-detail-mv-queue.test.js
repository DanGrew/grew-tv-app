const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');
const { enterBrowse } = require('./fixtures/nav.js');

// TASK-421 (story 3) — a music-video playlist row's per-track ＋ sheet ("☰ Play
// Next") must POST to the SEPARATE music-video engine (FEAT-418), never the
// audio engine's own queue-track — the two Play Next lists stay apart. Mirrors
// tests/playlist-detail-add.test.js (the song-playlist twin of this suite).

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

test('Play Next on a music-video row POSTs queue-video to the music-video engine (person=)', async ({ page }) => {
  await openPlaylist(page);
  await page.locator('.detail-row[data-id="mv-01"] .detail-add').click();
  await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Play Next');
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/queue-video') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-queue').click();
  const req = await queued;
  expect(req.url()).toContain('person=kids');
  expect(JSON.parse(req.postData())).toEqual({ video_id: 'mv-01' });
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('Play Next on a music-video row never POSTs to the audio engine\'s queue-track', async ({ page }) => {
  let audioQueued = false;
  await page.route('**/api/playback/queue-track**', route => { audioQueued = true; return route.fulfill({ status: 204, body: '' }); });
  await openPlaylist(page);
  await page.locator('.detail-row[data-id="mv-01"] .detail-add').click();
  await page.locator('#add-sheet-list .add-queue').click();
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
  expect(audioQueued).toBe(false);
});
