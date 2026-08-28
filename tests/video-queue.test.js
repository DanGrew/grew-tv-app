const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-040 (TASK-249) — "＋ Queue" (Play Next) on video series-detail episode rows.
// Each available episode row carries a ＋ Queue control; tapping it POSTs
// queue-item per person to the TASK-498 unified queue engine, never the old
// /api/video-playback one (TASK-503). A transient toast confirms; the control
// never hijacks the row's play handler.
//
// TASK-542 — the engine it posts to is /api/queue/SERIES: an episode's own
// itemType names its Queue (core/queue-shell-config.js's ITEM_MEDIA_TYPE), and
// `episode` moved to the series media type. The rows themselves did not change
// — that one map entry moved every ＋ producer at once.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.route('**/api/queue/series/queue-item**',
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

test('＋ Queue POSTs queue-item to the series engine for the episode and confirms with a toast', async ({ page }) => {
  await openSeries(page);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/series/queue-item') && req.method() === 'POST');
  await page.locator('.detail-row[data-id="bluey-s1e02"] .detail-queue').click();
  const req = await queued;
  expect(JSON.parse(req.postData())).toEqual({ item_id: 'bluey-s1e02' });
  // BUG-530 — the last hand-written confirmation. It said "Play Next" while the
  // press appended, and read differently from the companion mirror's own toast
  // on the same list; both come from queue-shell-config now.
  await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
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
