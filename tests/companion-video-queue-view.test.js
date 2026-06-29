const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');

// FEAT-040 (TASK-250) — the companion Video Queue View mirror. The phone renders
// the SAME server `video_playback` snapshot the TV gets (per-person relay) into
// NOW PLAYING / PLAY NEXT / FROM SERIES, and DRIVES the queue by POSTing the
// video-playback actions to /api/video-playback (server-authoritative — the
// resolved snapshot comes back over the relay and repaints). We seed a playing
// series + one queued video, then assert the mirror and the edits round-trip.
// Distinct from the TASK-249 producer (companion-video-queue.test.js).

async function setup(page) {
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('play-source', { source_type: 'series', source_id: 'bluey', item_id: 'bluey-s1e01' });
  vb.seed('queue-video', { video_id: 'bluey-s1e03' });   // a durable Play-Next entry (entry_id e1)
  await page.goto('/companion/video-queue.html');
  await expect(page.locator('.ph-np .nm')).toHaveText('Daddy Putdown');   // settle signal
  return vb;
}

test('mirrors the sections from the server snapshot', async ({ page }) => {
  await setup(page);
  const playNext = page.locator('.ph-qrow.queued');
  await expect(playNext).toHaveCount(1);
  await expect(playNext.locator('.nm')).toContainText('Hammerbarn');
  await expect(page.locator('.ph-qname[data-item="bluey-s1e02"]')).toBeVisible();
  await expect(page.locator('.ph-qname[data-item="bluey-s1e03"]')).toBeVisible();
});

test('removing the queued row POSTs remove-queue-entry and repaints without it', async ({ page }) => {
  await setup(page);
  const removed = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/remove-queue-entry') && req.method() === 'POST');
  await page.locator('.ph-qrow.queued .ph-ract.x').click();
  expect((await removed).postData()).toEqual(JSON.stringify({ entry_id: 'e1' }));
  await expect(page.locator('.ph-qrow.queued')).toHaveCount(0);
});

test('tapping a source row POSTs play-item — now-playing advances to it', async ({ page }) => {
  await setup(page);
  await page.locator('.ph-qname[data-item="bluey-s1e02"]').click();
  await expect(page.locator('.ph-np .nm')).toHaveText('The Weekend');
});

test('toggling repeat POSTs the action and reflects the snapshot', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-tbtn[data-action="toggle-repeat"]')).toHaveClass(/on/);
  await page.locator('.ph-tbtn[data-action="toggle-repeat"]').click();
  await expect(page.locator('.ph-tbtn[data-action="toggle-repeat"]')).not.toHaveClass(/on/);
});

test('back returns to the companion video player', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-back').click();
  await expect(page).toHaveURL(/companion\/video\.html$/);
});
