const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-440 — the artist page's song rows gain the same single ＋ "Add to playlist"
// control the album-detail rows already have (TASK-206/253), ported from
// screen-album-detail-page's openAddSheet machinery. Play Next on top, then the
// active profile's playlists, then New playlist + Cancel — same sheet, same POSTs.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'music');
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

async function enterArtist(page) {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="artist:ELO"]').click();
  await expect(page).toHaveURL(/artist\.html/);
  await expect(page.locator('.detail-row').first()).toBeVisible();
}

test('every song row carries a single ＋ control, matching the album page', async ({ page }) => {
  await enterArtist(page);
  await expect(page.locator('.detail-row .detail-add')).toHaveCount(5);
  await expect(page.locator('.detail-row[data-id="ootb-01"] .detail-add')).toHaveText('＋');
});

test('the ＋ opens a sheet with Play Next on top, then the profile\'s playlists + New playlist', async ({ page }) => {
  await enterArtist(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet-list > *').first()).toHaveClass(/add-queue/);
  await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Add to Queue');
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
  await expect(page.locator('#btn-add-create')).toBeVisible();
  await expect(page.locator('#btn-add-cancel')).toBeVisible();
});

test('the queue option queues the track and confirms, then closes the sheet', async ({ page }) => {
  await enterArtist(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-add').click();
  const queue = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/queue-item') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-queue').click();
  expect(JSON.parse((await queue).postData())).toEqual({ item_id: 'ootb-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to Queue');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('picking an existing playlist adds the track and confirms, then closes the sheet', async ({ page }) => {
  await enterArtist(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-add').click();
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-track') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-roadtrip"]').click();
  expect(JSON.parse((await add).postData())).toEqual({ playlist_id: 'pl-roadtrip', track_id: 'ootb-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to Road Trip');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('the row still plays directly — the ＋ does not hijack it', async ({ page }) => {
  await enterArtist(page);
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page).toHaveURL(/audio\.html/);
});

test('Cancel closes the add sheet without adding, returning focus to the track row', async ({ page }) => {
  await enterArtist(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#btn-add-cancel').click();
  await expect(page.locator('#add-sheet')).toBeHidden();
  await expect(page.locator('.detail-row[data-id="ootb-01"]')).toBeFocused();
});

test('New playlist hands off to the create screen carrying the track id', async ({ page }) => {
  await enterArtist(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-add').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addTrack=ootb-01/);
});
