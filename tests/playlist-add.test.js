const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// FEAT-036 (TASK-206) — "+ Add to playlist" on a track context (album / artist
// album-track rows). Each available album-detail row carries a "＋ Playlist"
// control; it opens a sheet listing the active profile's playlists plus a
// "New playlist" choice. Picking an existing playlist POSTs add-track and confirms;
// "New playlist" hands off to the create screen carrying the track so a brand-new
// playlist starts with it. The picker offers only the active profile's playlists
// because /api/browse is already profile-filtered (core/playlist-pick).

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

async function openAlbum(page) {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await expect(page).toHaveURL(/album-detail\.html/);
  await expect(page.locator('.detail-row')).toHaveCount(3);
}

// TASK-253 — one consolidated "＋" per row (was "＋ Playlist"), opening the sheet.
test('every available album track row carries a single ＋ control', async ({ page }) => {
  await openAlbum(page);
  await expect(page.locator('.detail-row .detail-add')).toHaveCount(3);
  await expect(page.locator('.detail-row[data-id="ootb-01"] .detail-add')).toHaveText('＋');
  // The old standalone ＋ Queue is gone — queueing is now the sheet's top option.
  await expect(page.locator('.detail-row .detail-queue')).toHaveCount(0);
});

test('the ＋ control opens a sheet with Play Next on top, then the profile\'s playlists + New playlist', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  // Play Next is the first sheet cell (top of the list), distinct from the playlist choices.
  await expect(page.locator('#add-sheet-list > *').first()).toHaveClass(/add-queue/);
  await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Play Next');
  // Only the active (kids) profile's playlists are offered — both fixture playlists.
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
  await expect(page.locator('#btn-add-create')).toBeVisible();
  await expect(page.locator('#btn-add-cancel')).toBeVisible();
});

test('picking an existing playlist adds the track and confirms, then closes the sheet', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-add').click();
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-track') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-roadtrip"]').click();
  const body = JSON.parse((await add).postData());
  expect(body).toEqual({ playlist_id: 'pl-roadtrip', track_id: 'ootb-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to Road Trip');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('the track row is selectable directly while the row also offers ＋ Playlist (play not hijacked)', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page).toHaveURL(/audio\.html/);
});

test('Cancel closes the add sheet without adding, returning focus to the track row', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-02"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#btn-add-cancel').click();
  await expect(page.locator('#add-sheet')).toBeHidden();
  await expect(page.locator('.detail-row[data-id="ootb-02"]')).toBeFocused();
});

test('Escape closes the add sheet', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#add-sheet-list .add-choice[data-id="pl-roadtrip"]').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('New playlist hands off to the create screen carrying the track id', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-03"] .detail-add').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addTrack=ootb-03/);
});

test('creating a playlist from a track lands on the new playlist holding that track', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-03"] .detail-add').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html/);
  for (const ch of 'MIX') {
    await page.locator('#pl-keys button').filter({ hasText: new RegExp('^' + ch + '$') }).click();
  }
  await page.locator('#btn-create').click();
  await expect(page).toHaveURL(/playlist-detail\.html\?playlist=pl-mix/);
  await expect(page.locator('#detail-title')).toHaveText('MIX');
  await expect(page.locator('.detail-row[data-id="ootb-03"]')).toHaveCount(1);
});
