const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');

// FEAT-037 (TASK-222): the PERSISTENT video player. A series episode plays in a
// single <video> that LIVES across advances — Next / Previous / auto-advance swap
// media in place, driven by the server `video_playback` snapshot (TASK-221), with
// NO per-item page reload (the old video.html-per-episode flow is gone).

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  // The up-next line is the page's last async signal (set after the first snapshot
  // swaps in the chosen member) — gate on it so the player is fully primed.
  await expect(page.locator('#video-upnext')).toHaveText('Up next: The Weekend');
});

test('plays the chosen series member from the snapshot, transport live', async ({ page }) => {
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
  await expect(page.locator('#btn-prev')).toBeVisible();
  await expect(page.locator('#btn-next')).toBeVisible();
});

test('Next advances in place — the document persists (no reload)', async ({ page }) => {
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
  // Tag the live document. A page reload (the old per-item flow) would wipe it;
  // the persistent player must keep it across the in-place advance.
  await page.evaluate(() => { window.__persist = 'kept'; });
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);
  expect(await page.evaluate(() => window.__persist)).toBe('kept');
});

test('Previous steps back in place (wraps under default repeat)', async ({ page }) => {
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);
  await page.locator('#btn-prev').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
});

test('auto-advance at end runs the Up next countdown then swaps in place', async ({ page }) => {
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#upnext-overlay')).toBeVisible();
  await expect(page.locator('#upnext-text')).toContainText('The Weekend');
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/, { timeout: 8000 });
});
