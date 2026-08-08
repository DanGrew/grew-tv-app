const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');
const { enterBrowse } = require('./fixtures/nav.js');

// TASK-378 follow-up bug (found in manual testing): the playlist-detail "Add to
// playlist" sheet (per-track ＋ AND header "Add all to playlist") ignored the
// currently-open playlist's own collectionType, so it always offered only song
// playlists — a music-video playlist's tracks could be routed at a song playlist
// (and the reverse silently "worked" only by the same accident). The sheet must
// gate on THIS playlist's collectionType both ways (screen-playlist-detail-page.js).

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

async function openPlaylist(page, tab, id) {
  await enterBrowse(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="' + tab + '"]').click();
  await page.locator('.film-tile[data-id="' + id + '"]').click();
  await expect(page).toHaveURL(/playlist-detail\.html/);
  await expect(page.locator('.detail-row').first()).toBeVisible();
}

// --- from a music-video playlist: never offer a song playlist ---------------

test('a music-video playlist\'s per-track ＋ offers only music-video playlists, never a song playlist', async ({ page }) => {
  await openPlaylist(page, 'music-videos', 'pl-mv');
  await page.locator('.detail-row[data-id="mv-01"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  // pl-mv is the only music-video playlist in the fixture set — offered (no
  // self-exclusion on the per-track sheet) — Road Trip / Empty Mix never appear.
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ QOTSA Videos']);
});

test('a music-video playlist\'s "Add all to playlist" offers only music-video playlists, never a song playlist', async ({ page }) => {
  await openPlaylist(page, 'music-videos', 'pl-mv');
  await page.locator('#btn-add-all').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  // pl-mv excludes itself (no self-add) and it's the only music-video playlist —
  // so the sheet has no playlist choices at all, never Road Trip / Empty Mix.
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveCount(0);
  await expect(page.locator('#btn-add-create')).toBeVisible();
});

test('New playlist from a music-video playlist\'s add sheet creates a matching music-video-playlist', async ({ page }) => {
  await openPlaylist(page, 'music-videos', 'pl-mv');
  await page.locator('.detail-row[data-id="mv-01"] .detail-add').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?.*addTrack=mv-01.*collectionType=music-video-playlist/);
});

// --- from a song playlist: never offer a music-video playlist ---------------

test('a song playlist\'s per-track ＋ never offers a music-video playlist', async ({ page }) => {
  await openPlaylist(page, 'music', 'pl-roadtrip');
  await page.locator('.detail-row[data-id="ootb-03"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
});

test('a song playlist\'s "Add all to playlist" never offers a music-video playlist', async ({ page }) => {
  await openPlaylist(page, 'music', 'pl-roadtrip');
  await page.locator('#btn-add-all').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  // pl-roadtrip excludes itself — only the other SONG playlist remains, QOTSA
  // Videos never appears.
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Empty Mix']);
});
