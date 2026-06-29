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

test('?playQueue entry starts the queue head (play-queue) and plays it', async ({ page }) => {
  // FEAT-040 Play Queue: enter the player with no video, just the queue.
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('queue-video', { video_id: 'bluey-s1e02' });
  vb.seed('queue-video', { video_id: 'bluey-s1e03' });
  const played = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/play-queue') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?playQueue=1&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await played;
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);   // front plays
});

test('Queue button opens the overlay with the durable Play Next queue', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.q-row.queued')).toHaveCount(1);
  await expect(page.locator('.q-row.queued .q-name')).toHaveText('Hammerbarn');
});

test('From Series lists the source items after the current one as play-to-jump rows', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.q-select[data-act="select"][data-item="bluey-s1e02"]')).toBeVisible();
  await expect(page.locator('.q-select[data-act="select"][data-item="bluey-s1e03"]')).toBeVisible();
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
  await page.locator('.q-select[data-act="select"][data-item="bluey-s1e02"]').click();
  expect(JSON.parse((await jumped).postData())).toEqual({ item_id: 'bluey-s1e02' });
});

test('tapping a queued row plays it now (play-video) AND drops it from the queue', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const removed = page.waitForRequest(req => req.url().includes('/api/video-playback/remove-queue-entry'));
  const played = page.waitForRequest(req => req.url().includes('/api/video-playback/play-video'));
  await page.locator('.q-row.queued .q-select[data-act="play-now"]').click();
  expect(JSON.parse((await removed).postData())).toEqual({ entry_id: 'e1' });
  expect(JSON.parse((await played).postData())).toEqual({ video_id: 'bluey-s1e03' });
  await expect(page.locator('.q-row.queued')).toHaveCount(0);   // consumed
});

test('reorder: the down arrow on a queued entry POSTs move-queue-entry', async ({ page }) => {
  // two queued entries so an edge arrow is enabled
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('play-source', { source_type: 'series', source_id: 'bluey', item_id: 'bluey-s1e01' });
  vb.seed('queue-video', { video_id: 'bluey-s1e02' });   // e1
  vb.seed('queue-video', { video_id: 'bluey-s1e03' });   // e2 (append)
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  await expect(page.locator('.q-row.queued')).toHaveCount(2);
  const moved = page.waitForRequest(req => req.url().includes('/api/video-playback/move-queue-entry'));
  // first queued row's down arrow (↑ is disabled at the top, so [0] is ↓)
  await page.locator('.q-row.queued').first().locator('.q-act:not([disabled])').first().click();
  expect(JSON.parse((await moved).postData())).toEqual({ entry_id: 'e1', direction: 'down' });
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

test('a standalone film plays THROUGH the engine (play-video) and keeps the Queue button', async ({ page }) => {
  // FEAT-040/TASK-251: films are engine-driven now (no off-engine divergence), so
  // they render from the snapshot and still expose the Queue (the durable queue
  // plays after the film).
  await installApi(page);
  await installVideoPlaybackBackend(page);
  const played = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/play-video') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?video=finding-nemo-main&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  expect(JSON.parse((await played).postData())).toEqual({ video_id: 'finding-nemo-main' });
  await expect(page.locator('#video')).toHaveAttribute('src', /finding-nemo-main/);
  await expect(page.locator('#btn-queue')).toBeVisible();
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  await expect(page.locator('.now-playing .np-title')).toHaveText('Finding Nemo');
});
