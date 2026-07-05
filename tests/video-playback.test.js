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

// TASK-288: controls read as two rows (matching the music player) — prev/play/next
// inline with a wide progress bar in #transport, the Jump/CC/Queue/Reset pills on a
// separate #pill-row underneath. Guard the grouping AND the vertical stacking.
test('controls are two rows: wide progress bar above, pills underneath', async ({ page }) => {
  await expect(page.locator('#transport #progress')).toBeVisible();
  await expect(page.locator('#pill-row #btn-jump')).toBeVisible();
  await expect(page.locator('#pill-row #btn-queue')).toBeVisible();
  await expect(page.locator('#pill-row #btn-reset')).toBeVisible();
  const bar = await page.locator('#progress').boundingBox();
  const pills = await page.locator('#pill-row').boundingBox();
  expect(pills.y).toBeGreaterThanOrEqual(bar.y + bar.height);
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

// TASK-224 — entry rewiring / nav-trail Back reconcile. The player is entered ONCE
// (the persistent player at video.html); in-player Back (Escape) returns to the
// page that launched it, keyed off `from`, NOT a hardcoded parent. The trail still
// governs browse↔browse separately (FEAT-032). After an in-place advance the Back
// target is still the original launcher (the document never reloaded).
test('in-player Back returns to the launching detail page', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/detail\.html\?.*series=bluey/);
});

test('in-player Back returns to browse when launched from browse', async ({ page }) => {
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/browse\.html/);
});

test('Back target survives an in-place advance (still the original launcher)', async ({ page }) => {
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/detail\.html\?.*series=bluey/);
});
