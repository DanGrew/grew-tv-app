const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, installVideoPlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

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
  await pickPerson(page, 'kids');
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

// BUG-061 — after the Bluetooth speaker naps and reconnects, macOS's default
// output flips back but the already-mounted <audio>/<video> element stays bound
// to whichever device was current when playback started (a Chromium/CoreAudio
// gap). Both players now listen for navigator.mediaDevices' devicechange and
// remount the element in place (same src, same position) to re-grab the current
// default. Real e2e can't power-cycle a physical speaker, so these fake the
// element's readyState/currentTime/load/play the same way the resume-seek test
// above fakes a seek, then dispatch a synthetic devicechange to prove the
// remount fires (and doesn't, while paused).
test('devicechange while playing remounts the audio element and resumes at the same position (BUG-061)', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');

  await page.locator('#audio').evaluate(a => {
    window.__loads = 0;
    window.__plays = 0;
    Object.defineProperty(a, 'readyState', { configurable: true, get: () => 1 });
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => (window.__pos === undefined ? 42 : window.__pos), set: v => { window.__pos = v; } });
    Object.defineProperty(a, 'paused', { configurable: true, get: () => false });
    a.load = () => { window.__loads += 1; };
    a.play = () => { window.__plays += 1; return Promise.resolve(); };
  });

  await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));

  expect(await page.evaluate(() => window.__loads)).toBe(1);
  expect(await page.evaluate(() => window.__plays)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__pos)).toBe(42);
});

test('devicechange while paused does not auto-resume playback (BUG-061)', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');

  await page.locator('#audio').evaluate(a => {
    window.__loads = 0;
    window.__plays = 0;
    Object.defineProperty(a, 'readyState', { configurable: true, get: () => 1 });
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => 42, set: () => {} });
    Object.defineProperty(a, 'paused', { configurable: true, get: () => true });
    a.load = () => { window.__loads += 1; };
    a.play = () => { window.__plays += 1; return Promise.resolve(); };
  });

  await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));

  expect(await page.evaluate(() => window.__loads)).toBe(0);
  expect(await page.evaluate(() => window.__plays)).toBe(0);
});

// BUG-423 — a stalled stream (bytes stop arriving mid-`Content Download`, no
// error, no close) wedges the player forever with nothing to notice or recover
// on its own. `waiting` now arms a stall timer that drives the same
// reload-in-place path as BUG-061 once the stall outlasts the threshold; a
// `canplay`/`playing` well inside the threshold (normal buffering) clears it
// with no reload. Fakes the element the same way the BUG-061 tests above do,
// and uses Playwright's clock so the threshold doesn't cost real test time.
test('a stall outlasting the threshold reloads the audio element at the same position (BUG-423)', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');

  await page.clock.install();
  await page.locator('#audio').evaluate(a => {
    window.__loads = 0;
    window.__plays = 0;
    Object.defineProperty(a, 'readyState', { configurable: true, get: () => 1 });
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => (window.__pos === undefined ? 42 : window.__pos), set: v => { window.__pos = v; } });
    Object.defineProperty(a, 'paused', { configurable: true, get: () => false });
    a.load = () => { window.__loads += 1; };
    a.play = () => { window.__plays += 1; return Promise.resolve(); };
    a.dispatchEvent(new Event('waiting'));
  });
  await page.clock.fastForward(6001);

  expect(await page.evaluate(() => window.__loads)).toBe(1);
  expect(await page.evaluate(() => window.__plays)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__pos)).toBe(42);
});

test('a stall clearing before the threshold does not reload (BUG-423)', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');

  await page.clock.install();
  await page.locator('#audio').evaluate(a => {
    window.__loads = 0;
    window.__plays = 0;
    Object.defineProperty(a, 'readyState', { configurable: true, get: () => 1 });
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => 42, set: () => {} });
    Object.defineProperty(a, 'paused', { configurable: true, get: () => false });
    a.load = () => { window.__loads += 1; };
    a.play = () => { window.__plays += 1; return Promise.resolve(); };
    a.dispatchEvent(new Event('waiting'));
  });
  await page.clock.fastForward(3000);
  await page.locator('#audio').evaluate(a => a.dispatchEvent(new Event('canplay')));
  await page.clock.fastForward(6001);

  expect(await page.evaluate(() => window.__loads)).toBe(0);
  expect(await page.evaluate(() => window.__plays)).toBe(0);
});

// Video twin (screen-video-player.js shares the same element-lifecycle fix —
// the same Bluetooth speaker sits in front of both screens).
test('devicechange while playing remounts the video element and resumes at the same position (video twin, BUG-061)', async ({ page }) => {
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();

  await page.locator('#video').evaluate(v => {
    window.__loads = 0;
    window.__plays = 0;
    Object.defineProperty(v, 'readyState', { configurable: true, get: () => 1 });
    Object.defineProperty(v, 'currentTime', { configurable: true, get: () => (window.__pos === undefined ? 77 : window.__pos), set: val => { window.__pos = val; } });
    Object.defineProperty(v, 'paused', { configurable: true, get: () => false });
    v.load = () => { window.__loads += 1; };
    v.play = () => { window.__plays += 1; return Promise.resolve(); };
  });

  await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));

  expect(await page.evaluate(() => window.__loads)).toBe(1);
  expect(await page.evaluate(() => window.__plays)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__pos)).toBe(77);
});
