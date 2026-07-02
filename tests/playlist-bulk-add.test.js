const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');

// FEAT-036 (TASK-212) — "Add all to playlist" bulk-add. The album-detail and
// playlist-detail headers each carry an "＋ Add all to playlist" button that opens
// the same add sheet, but each pick POSTs add-source (a whole-album / whole-playlist
// SNAPSHOT) instead of add-track. The playlist-detail sheet EXCLUDES the current
// playlist (a playlist can't be added into itself). "New playlist" hands off to the
// create screen carrying the bulk source so a brand-new playlist starts with it.

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
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await expect(page).toHaveURL(/album-detail\.html/);
  await expect(page.locator('.detail-row')).toHaveCount(3);
}

async function openPlaylist(page, id) {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="' + id + '"]').click();
  await expect(page).toHaveURL(/playlist-detail\.html/);
  // Wait for the rows to render before the test interacts — the page wires the
  // header buttons (#btn-add-all) during init, which finishes only once the async
  // playlist load resolves and buildDetailList paints. URL alone is too early: a
  // click on #btn-add-all before its listener attaches is a silent no-op and the
  // add-sheet never opens (BUG-019). A first visible row is that init-complete
  // signal (every openPlaylist target here has tracks).
  await expect(page.locator('.detail-row').first()).toBeVisible();
}

// --- album-detail: add the whole album --------------------------------------
test('album-detail header carries an Add all to playlist button', async ({ page }) => {
  await openAlbum(page);
  await expect(page.locator('#btn-add-all')).toHaveText('＋ Add all to playlist');
});

test('Add all opens a sheet listing the active profile\'s playlists + New playlist', async ({ page }) => {
  await openAlbum(page);
  await page.locator('#btn-add-all').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
  await expect(page.locator('#btn-add-create')).toBeVisible();
  await expect(page.locator('#btn-add-cancel')).toBeVisible();
});

test('picking a playlist POSTs add-source for the whole album, confirms, closes', async ({ page }) => {
  await openAlbum(page);
  await page.locator('#btn-add-all').click();
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-source') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-roadtrip"]').click();
  const body = JSON.parse((await add).postData());
  expect(body).toEqual({ playlist_id: 'pl-roadtrip', source_type: 'album', source_id: 'ootb' });
  await expect(page.locator('#add-status')).toHaveText('Added to Road Trip');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('Cancel closes the Add all sheet, returning focus to the header button', async ({ page }) => {
  await openAlbum(page);
  await page.locator('#btn-add-all').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#btn-add-cancel').click();
  await expect(page.locator('#add-sheet')).toBeHidden();
  await expect(page.locator('#btn-add-all')).toBeFocused();
});

test('New playlist hands off to the create screen carrying the album source', async ({ page }) => {
  await openAlbum(page);
  await page.locator('#btn-add-all').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addSourceType=album&addSourceId=ootb/);
});

test('creating a playlist from a whole album lands on the new playlist holding its tracks', async ({ page }) => {
  await openAlbum(page);
  await page.locator('#btn-add-all').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html/);
  for (const ch of 'MIX') {
    await page.locator('#pl-keys button').filter({ hasText: new RegExp('^' + ch + '$') }).click();
  }
  await page.locator('#btn-create').click();
  await expect(page).toHaveURL(/playlist-detail\.html\?playlist=pl-mix/);
  await expect(page.locator('.detail-row')).toHaveCount(3); // the album's 3 tracks
});

// --- playlist-detail: add this whole playlist into another ------------------
test('playlist-detail header carries an Add all to playlist button', async ({ page }) => {
  await openPlaylist(page, 'pl-roadtrip');
  await expect(page.locator('#btn-add-all')).toHaveText('＋ Add all to playlist');
});

test('the sheet excludes the current playlist (no self-add)', async ({ page }) => {
  await openPlaylist(page, 'pl-roadtrip');
  await page.locator('#btn-add-all').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  // pl-roadtrip itself is dropped; only the other playlist is offered.
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Empty Mix']);
});

test('picking a target POSTs add-source for this whole playlist (snapshot)', async ({ page }) => {
  await openPlaylist(page, 'pl-roadtrip');
  await page.locator('#btn-add-all').click();
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-source') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-empty"]').click();
  const body = JSON.parse((await add).postData());
  expect(body).toEqual({ playlist_id: 'pl-empty', source_type: 'playlist', source_id: 'pl-roadtrip' });
  await expect(page.locator('#add-status')).toHaveText('Added to Empty Mix');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('New playlist from a playlist hands off carrying the playlist source', async ({ page }) => {
  await openPlaylist(page, 'pl-roadtrip');
  await page.locator('#btn-add-all').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addSourceType=playlist&addSourceId=pl-roadtrip/);
});
