const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');

// FEAT-040 (TASK-248) — "＋ Queue" (Play Next) on album-detail track rows. Each
// available row carries a ＋ Queue control beside the existing ＋ Playlist; tapping
// it POSTs queue-track per person to /api/playback (no sheet — a direct add) and
// confirms with a transient toast. The override queue is durable (TASK-246), so a
// queued track survives opening another album. The control never hijacks the row's
// play handler.

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

test('every available album track row carries a ＋ Queue control beside ＋ Playlist', async ({ page }) => {
  await openAlbum(page);
  await expect(page.locator('.detail-row .detail-queue')).toHaveCount(3);
  await expect(page.locator('.detail-row[data-id="ootb-01"] .detail-queue')).toHaveText('＋ Queue');
  // Both per-track music controls live on the same row.
  await expect(page.locator('.detail-row[data-id="ootb-01"] .detail-add')).toHaveCount(1);
  await expect(page.locator('.detail-row[data-id="ootb-01"] .detail-queue')).toHaveCount(1);
});

test('＋ Queue POSTs queue-track for the track and confirms with a toast', async ({ page }) => {
  await openAlbum(page);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/playback/queue-track') && req.method() === 'POST');
  await page.locator('.detail-row[data-id="ootb-02"] .detail-queue').click();
  const req = await queued;
  expect(JSON.parse(req.postData())).toEqual({ track_id: 'ootb-02' });
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
});

test('＋ Queue does not hijack the row — the track still plays', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page).toHaveURL(/audio\.html/);
});

test('＋ Queue is reachable from the row via Right (d-pad)', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-01"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.detail-row[data-id="ootb-01"] .detail-queue')).toBeFocused();
});
