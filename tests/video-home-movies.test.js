const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');

// TASK-446 — Home Movies Play All: SERVER-authoritative, like a series/boxset
// (video-playback.test.js), NOT the client-owned music-video playthrough
// (video-music-video.test.js) — the video engine's own `home-movies-all`
// source drives it, so it gets the persistent player's full snapshot-driven
// machinery (breadcrumb, up-next, series-mode transport, Queue View) for
// free, the same way a series does. ONE entry point, always unshuffled —
// shuffle is a live Queue View toggle (owner correction from an earlier
// two-button design), tested below.
//
// NOT covered here: the dual-queue domain split (a queued film must never
// surface, or play, while Home Movies Play All plays, and vice versa) is a
// pure backend engine/API concern — this app has no client-side
// queue-vs-source/domain logic of its own to test (every advance is a plain
// server round-trip, reading one `override_queue` snapshot key with no
// domain awareness), so re-asserting it against a hand-authored JS mock would
// only prove the mock, not the app. It's covered thoroughly in grew-tv's own
// suite (test_video_playback_engine.py's DualQueueTests +
// HomeMoviesQueueDomainTests, test_api_video_playback[_unit].py, and the
// schema/state-sync round-trip tests).

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
});

// TASK-487: a home movie is a short standalone clip, like a music video — the
// 5s "Up next" countdown (video-playback.test.js's series/film behaviour)
// reads as an extra gap between two short clips, so it's skipped here in
// favour of an immediate advance, mirroring mvEnded's existing behaviour for
// a music video.
test('auto-advance at end of a home movie skips the countdown and advances immediately', async ({ page }) => {
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
  const nextReq = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/next') && req.method() === 'POST';
  }, { timeout: 2000 });
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  // Checked the instant the (synchronous) ended handler returns — the series/
  // film countdown would already have made this visible by now; a home movie
  // must never show it at all, not just "not any more" after it later clears.
  await expect(page.locator('#upnext-overlay')).toBeHidden({ timeout: 200 });
  await nextReq;
  await expect(page.locator('#video')).toHaveAttribute('src', /beach-day/);
});

test('Play All fires play-source for home-movies-all, unshuffled, and plays the resolved item', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  const req = await playSource;
  // item_id rides every entry now (TASK-486 revision: a list-row tap carries
  // `video`, mirroring a series episode row) — null here since no row was
  // tapped, matching startSeries' own always-present item_id.
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movies-all', item_id: null });
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
});

// TASK-422-style: no source page to link back to (mirrors mvAll — story 4 has
// no equivalent here) — Home > leaf only, like a standalone film.
test('breadcrumb degrades to Home > leaf — no source page', async ({ page }) => {
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Millie Walk');
});

// TASK-486 — the Play All rail's per-kid tile: SERVER-authoritative exactly
// like home-movies-all above, the video engine's own home-movies-by-person
// source, source_id the tapped tile's own `people` tag value.
test('a Play All rail kid tile fires play-source for home-movies-by-person, scoped to that kid', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesPerson=millie&from=browse');
  const req = await playSource;
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movies-by-person', source_id: 'millie', item_id: null });
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
});

// TASK-486 (revision) — a tapped row in the list screen carries `video`,
// which rides through as item_id so play-source jumps straight to it.
test('a tapped list row plays that specific clip via item_id', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesPerson=millie&video=millie-walk&from=home-movies-list');
  const req = await playSource;
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movies-by-person', source_id: 'millie', item_id: 'millie-walk' });
});

// TASK-491 — the Play All by month rail's tile: SERVER-authoritative exactly
// like home-movies-all/-by-person above, the video engine's own
// home-movie-month source, source_id the tapped tile's own 'YYYY-MM' value.
test('a Play All rail month tile fires play-source for home-movie-month, scoped to that month', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesMonth=2026-01&from=browse');
  const req = await playSource;
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movie-month', source_id: '2026-01', item_id: null });
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
});

// TASK-491 — a tapped row in the month-scoped list screen carries `video`
// through as item_id too, same as the person-scoped list above.
test('a tapped list row in a month-scoped list plays that specific clip via item_id', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesMonth=2026-01&video=beach-day&from=home-movies-list');
  const req = await playSource;
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movie-month', source_id: '2026-01', item_id: 'beach-day' });
});

// TASK-446 (owner correction) — Shuffle is a live Queue View toggle for Home
// Movies, matching every other media source's shuffle UX, not a second
// pre-entry "Shuffle All" button.
test.describe('Shuffle — a live Queue View toggle', () => {
  async function openQueue(page) {
    await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  }

  test('the Shuffle pill is offered for home-movies-all', async ({ page }) => {
    await openQueue(page);
    await expect(page.locator('.np-pill[data-action="toggle-shuffle"]')).toBeVisible();
  });

  // TASK-486 — the per-kid source shares the same shuffle gate as All.
  test('the Shuffle pill is offered for a home-movies-by-person entry too', async ({ page }) => {
    await page.goto('/app/homeview/video.html?homeMoviesPerson=millie&from=browse');
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
    await expect(page.locator('.np-pill[data-action="toggle-shuffle"]')).toBeVisible();
  });

  // TASK-491 — the month source shares the same shuffle gate as All/by-person.
  test('the Shuffle pill is offered for a home-movie-month entry too', async ({ page }) => {
    await page.goto('/app/homeview/video.html?homeMoviesMonth=2026-01&from=browse');
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
    await expect(page.locator('.np-pill[data-action="toggle-shuffle"]')).toBeVisible();
  });

  test('tapping Shuffle fires toggle-shuffle and flips the pill on', async ({ page }) => {
    await openQueue(page);
    const toggled = page.waitForRequest(function(req) {
      return req.url().includes('/api/video-playback/toggle-shuffle') && req.method() === 'POST';
    });
    await page.locator('.np-pill[data-action="toggle-shuffle"]').click();
    await toggled;
    await expect(page.locator('.np-pill[data-action="toggle-shuffle"]')).toHaveClass(/on/);
  });
});
