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

// TASK-487 — a home movie is a short standalone clip with no meaningful
// resume, like a music video (video-music-video.test.js's own "no resume
// offered" case); loadProgress used to gate EVERY swap on a network round
// trip that bought nothing for this type, which read as a loading gap.
// Covers both stories: a queued auto-advance transition between clips, and a
// single tap-to-play start — both route through the same swapVideo.
function progressCalls(page) {
  var calls = [];
  page.on('request', function(req) {
    if (req.url().indexOf('/api/progress/') > -1) calls.push(req.url());
  });
  return calls;
}

test('a single home-movie pick starts at 0 with no watch-progress round trip', async ({ page }) => {
  const calls = progressCalls(page);
  await page.goto('/app/homeview/video.html?video=millie-walk&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
  expect(await page.evaluate(() => document.getElementById('video').currentTime)).toBe(0);
  expect(calls).toEqual([]);
});

test('the queued auto-advance transition between home-movie clips never touches watch-progress either', async ({ page }) => {
  const calls = progressCalls(page);
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /beach-day/);
  expect(await page.evaluate(() => document.getElementById('video').currentTime)).toBe(0);
  expect(calls).toEqual([]);
});

test('Play All fires play-source for home-movies-all, unshuffled, and plays the resolved item', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  const req = await playSource;
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movies-all' });
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
});

// TASK-422-style: no source page to link back to (mirrors mvAll — story 4 has
// no equivalent here) — Home > leaf only, like a standalone film.
test('breadcrumb degrades to Home > leaf — no source page', async ({ page }) => {
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Millie Walk');
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
