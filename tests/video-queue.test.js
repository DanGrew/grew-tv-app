const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-040 (TASK-249) — "＋ Queue" (Play Next) on video series-detail episode rows.
// Each available episode row carries a ＋ Queue control; tapping it POSTs
// queue-video per person to the SEPARATE video queue (/api/video-playback),
// distinct from the music queue. A transient toast confirms; the control never
// hijacks the row's play handler.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.route('**/api/video-playback/queue-video**',
    route => route.fulfill({ status: 204, body: '' }));
});

async function openSeries(page) {
  await page.goto('/app/homeview/detail.html?series=bluey&profile=kids');
  await expect(page.locator('.detail-row')).toHaveCount(3);   // settle signal
}

test('every available episode row carries a ＋ Queue control', async ({ page }) => {
  await openSeries(page);
  await expect(page.locator('.detail-row .detail-queue')).toHaveCount(3);
  await expect(page.locator('.detail-row[data-id="bluey-s1e01"] .detail-queue'))
    .toHaveText('＋ Queue');
});

test('＋ Queue POSTs queue-video for the episode and confirms with a toast', async ({ page }) => {
  await openSeries(page);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/queue-video') && req.method() === 'POST');
  await page.locator('.detail-row[data-id="bluey-s1e02"] .detail-queue').click();
  const req = await queued;
  expect(JSON.parse(req.postData())).toEqual({ video_id: 'bluey-s1e02' });
  await expect(page.locator('#queue-status')).toHaveText('Queued to Play Next');
});

test('＋ Queue does not hijack the row — the episode still plays', async ({ page }) => {
  await openSeries(page);
  await page.locator('.detail-row[data-id="bluey-s1e01"]').click();
  await expect(page).toHaveURL(/video\.html/);
});

test('＋ Queue is reachable from the row via Right (d-pad)', async ({ page }) => {
  await openSeries(page);
  await page.locator('.detail-row[data-id="bluey-s1e01"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.detail-row[data-id="bluey-s1e01"] .detail-queue'))
    .toBeFocused();
});
