const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-262 (FEAT-039) — per-track ＋ on the app playlist-detail screen, ported from
// album detail (TASK-206/253). Each track row carries a single ＋ that opens the add
// sheet: "☰ Play Next" on top (queue that ONE track), then the active profile's
// playlists (tap to add the track), then New playlist + Cancel. Play Next POSTs
// queue-track for the active person; picking a playlist POSTs add-track. The existing
// whole-list "Add all to playlist" header button stays (playlist-bulk-add.test.js).

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

// Reach the playlist via the profile → music → tile flow, then await a rendered row
// (init-complete signal — a click before buildDetailList wires the ＋ is a silent
// no-op, BUG-019). pl-roadtrip holds ootb-03 then ootb-01.
async function openPlaylist(page) {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
  await expect(page).toHaveURL(/playlist-detail\.html/);
  await expect(page.locator('.detail-row').first()).toBeVisible();
}

test('every playlist track row carries a single ＋ control, alongside its ↑ ↓ ✕', async ({ page }) => {
  await openPlaylist(page);
  await expect(page.locator('.detail-row .detail-add')).toHaveCount(2);
  await expect(page.locator('.detail-row[data-id="ootb-03"] .detail-add')).toHaveText('＋');
  // The per-track reorder/remove controls remain (TASK-211) — ＋ sits with them.
  await expect(page.locator('.detail-row[data-id="ootb-03"] .detail-remove')).toHaveCount(1);
});

test('the ＋ opens a sheet with Play Next on top, then the profile\'s playlists + New playlist', async ({ page }) => {
  await openPlaylist(page);
  await page.locator('.detail-row[data-id="ootb-03"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  // Play Next is the first sheet cell, distinct from the playlist choices.
  await expect(page.locator('#add-sheet-list > *').first()).toHaveClass(/add-queue/);
  await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Play Next');
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
  await expect(page.locator('#btn-add-create')).toBeVisible();
  await expect(page.locator('#btn-add-cancel')).toBeVisible();
});

test('Play Next queues the one track (queue-track POST carries person=)', async ({ page }) => {
  await openPlaylist(page);
  await page.locator('.detail-row[data-id="ootb-03"] .detail-add').click();
  const queue = page.waitForRequest(req =>
    req.url().includes('/api/playback/queue-track') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-queue').click();
  const req = await queue;
  expect(req.url()).toContain('person=kids');
  expect(JSON.parse(req.postData())).toEqual({ track_id: 'ootb-03' });
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('picking an existing playlist adds the track and confirms, then closes the sheet', async ({ page }) => {
  await openPlaylist(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-add').click();
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-track') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-empty"]').click();
  expect(JSON.parse((await add).postData())).toEqual({ playlist_id: 'pl-empty', track_id: 'ootb-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to Empty Mix');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('the track row still plays directly — the ＋ does not hijack the row', async ({ page }) => {
  await openPlaylist(page);
  await page.locator('.detail-row[data-id="ootb-03"]').click();
  await expect(page).toHaveURL(/audio\.html/);
});

test('Cancel closes the sheet without adding, returning focus to the track row', async ({ page }) => {
  await openPlaylist(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#btn-add-cancel').click();
  await expect(page.locator('#add-sheet')).toBeHidden();
  await expect(page.locator('.detail-row[data-id="ootb-01"]')).toBeFocused();
});

test('New playlist hands off to the create screen carrying the track id', async ({ page }) => {
  await openPlaylist(page);
  await page.locator('.detail-row[data-id="ootb-03"] .detail-add').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addTrack=ootb-03/);
});
