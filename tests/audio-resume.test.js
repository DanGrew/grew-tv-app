const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// TASK-276 — the audio player no longer resumes mid-song. A track always loads at
// 0, even when the server snapshot carries a saved current_position (the live
// position of a paused/left track). Backend still stores current_position (drives
// the progress bar / queue math); the app simply stops seeking to it on load.

let pb;
test.beforeEach(async ({ page }) => {
  await installApi(page);
  pb = await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

// The fixture serves empty media, so <audio> never loads metadata on its own and
// currentTime can't be driven naturally — spy the seek instead: fake a ready
// element and record any currentTime write. On the OLD code swapTrack passed
// np.position (90) → a write of 90; on the NEW code it passes 0 → no write.
test('returning to a track left mid-song restarts it at 0 — no resume seek (TASK-276)', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await expect(page.locator('.detail-row')).toHaveCount(3);
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');

  await page.locator('#audio').evaluate(a => {
    window.__seek = null;
    Object.defineProperty(a, 'readyState', { configurable: true, get: () => 1 });
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => window.__seek || 0, set: v => { window.__seek = v; } });
  });

  // Server now-playing becomes a DIFFERENT track (ootb-02) left mid-song at 90s.
  // A broadcast (the no-op `previous` action) delivers that snapshot as a track
  // change — the load path swapTrack seeks on.
  pb.seed('play-track', { track_id: 'ootb-02' });
  pb.seed('position', { current_position: 90 });
  await page.evaluate(() => fetch('/api/playback/previous', { method: 'POST', body: '{}' }));
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');

  const seek = await page.locator('#audio').evaluate(() => window.__seek);
  expect(seek).toBe(null);
});
