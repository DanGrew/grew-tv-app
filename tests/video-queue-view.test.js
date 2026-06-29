const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');

// FEAT-040 (TASK-250) — the Video Queue View overlay. It hangs off the persistent
// video player (the <video> stays mounted) and draws the server `video_playback`
// snapshot: NOW PLAYING / PLAY NEXT (the editable override queue) / FROM SERIES
// (source items, play-to-jump). Row controls fire video-playback actions; the
// overlay repaints from the next snapshot the backend pushes. Distinct from the
// TASK-249 producer (video-queue.test.js): this is the editable VIEW, not the
// ＋ Queue button.

async function openPlayer(page) {
  await installApi(page);
  const backend = await installVideoPlaybackBackend(page);
  backend.seed('queue-video', { video_id: 'bluey-s1e03' });   // a durable Play-Next entry (entry_id e1)
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  // up-next prefers the queue front -> Hammerbarn (the page's last async signal).
  await expect(page.locator('#video-upnext')).toHaveText('Up next: Hammerbarn');
  return backend;
}

async function openQueue(page) {
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
}

test('Queue button opens the overlay with the durable Play Next queue', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.q-row.queued')).toHaveCount(1);
  await expect(page.locator('.q-row.queued .q-name')).toHaveText('Hammerbarn');
});

test('From Series lists the source items after the current one as play-to-jump rows', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.q-row .q-select[data-item="bluey-s1e02"]')).toBeVisible();
  await expect(page.locator('.q-row .q-select[data-item="bluey-s1e03"]')).toBeVisible();
});

test('removing a queued entry POSTs remove-queue-entry and the overlay repaints', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const removed = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/remove-queue-entry') && req.method() === 'POST');
  await page.locator('.q-row.queued .q-act.danger').click();
  expect(JSON.parse((await removed).postData())).toEqual({ entry_id: 'e1' });
  await expect(page.locator('.q-row.queued')).toHaveCount(0);
});

test('a source row plays-to-jump via play-item', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const jumped = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/play-item') && req.method() === 'POST');
  await page.locator('.q-row .q-select[data-item="bluey-s1e02"]').click();
  expect(JSON.parse((await jumped).postData())).toEqual({ item_id: 'bluey-s1e02' });
});

test('the Repeat pill toggles repeat and reflects the snapshot', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.np-pill')).toHaveClass(/on/);   // series defaults repeat ON
  const toggled = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/toggle-repeat') && req.method() === 'POST');
  await page.locator('.np-pill').click();
  await toggled;
  await expect(page.locator('.np-pill')).not.toHaveClass(/on/);
});

test('Back (Escape) closes the overlay back to the still-mounted player', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#queue-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
});

test('a standalone film has no Queue button (no engine source)', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/video.html?video=finding-nemo-main&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /finding-nemo-main/);
  await expect(page.locator('#btn-queue')).toBeHidden();
});
