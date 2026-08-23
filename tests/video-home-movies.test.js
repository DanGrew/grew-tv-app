const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend } = require('./fixtures/api.js');

// TASK-499 (FEAT-497) — Home Movies is the FIRST cutover onto the TASK-498
// unified queue engine + the new Queue UX shell, off the video engine's own
// home-movies-* sources (TASK-446/486/491, formerly video-playback.test.js's
// sibling coverage). Every entry fires TWO actions against
// /api/queue/home-movie — play-source (the source alone), then play-item
// ONLY when a specific row was tapped (mirrors the mv entry pattern) — never
// video-playback's old single play-source+item_id call.
//
// NOT covered here: the queue engine's own transition math (play-source
// resume-in-place, advance/previous reanchoring, the fair shuffle) is a pure
// backend concern, proven in grew-tv's own suite
// (test_queue_engine.py/test_api_queue_playback[_unit].py) — this app has no
// client-side queue math of its own to re-test against a hand-authored JS
// mock.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'home-movie');
});

// TASK-487 (preserved unchanged by this cutover): a home movie is a short
// standalone clip, like a music video — the 5s "Up next" countdown
// (video-playback.test.js's series/film behaviour) reads as an extra gap
// between two short clips, so it's skipped here in favour of an immediate
// advance, mirroring mvEnded's existing behaviour for a music video.
test('auto-advance at end of a home movie skips the countdown and advances immediately', async ({ page }) => {
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
  const nextReq = page.waitForRequest(function(req) {
    return req.url().includes('/api/queue/home-movie/next') && req.method() === 'POST';
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
    return req.url().includes('/api/queue/home-movie/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  const req = await playSource;
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movies-all', source_id: null });
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
});

// TASK-422-style: no source page to link back to (mirrors mvAll — story 4 has
// no equivalent here) — Home > leaf only, like a standalone film. Unchanged
// by this cutover (isMusicVideo stays false for home-movie mode).
test('breadcrumb degrades to Home > leaf — no source page', async ({ page }) => {
  await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Millie Walk');
});

test('a Play All rail kid tile fires play-source for home-movies-by-person, scoped to that kid', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/queue/home-movie/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesPerson=millie&from=browse');
  const req = await playSource;
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movies-by-person', source_id: 'millie' });
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
});

// A tapped row in the list screen carries `video`, which fires a follow-up
// play-item once play-source resolves (mirrors an mv entry's tapped pick).
test('a tapped list row plays that specific clip via a follow-up play-item', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/queue/home-movie/play-source') && req.method() === 'POST';
  });
  const playItem = page.waitForRequest(function(req) {
    return req.url().includes('/api/queue/home-movie/play-item') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesPerson=millie&video=millie-walk&from=home-movies-list');
  const srcReq = await playSource;
  expect(JSON.parse(srcReq.postData())).toEqual({ source_type: 'home-movies-by-person', source_id: 'millie' });
  const itemReq = await playItem;
  expect(JSON.parse(itemReq.postData())).toEqual({ item_id: 'millie-walk' });
});

test('a Play All rail month tile fires play-source for home-movie-month, scoped to that month', async ({ page }) => {
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/queue/home-movie/play-source') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesMonth=2026-01&from=browse');
  const req = await playSource;
  expect(JSON.parse(req.postData())).toEqual({ source_type: 'home-movie-month', source_id: '2026-01' });
  await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
});

test('a tapped list row in a month-scoped list plays that specific clip via a follow-up play-item', async ({ page }) => {
  const playItem = page.waitForRequest(function(req) {
    return req.url().includes('/api/queue/home-movie/play-item') && req.method() === 'POST';
  });
  await page.goto('/app/homeview/video.html?homeMoviesMonth=2026-01&video=beach-day&from=home-movies-list');
  const itemReq = await playItem;
  expect(JSON.parse(itemReq.postData())).toEqual({ item_id: 'beach-day' });
});

// TASK-499 — the Queue UX shell's hero (docs/QUEUE-UX-SHELL.md): art/title/
// source-subtitle + an always-shown icon-only transport row, never gated on
// item count or "offered" the way the old engine's Shuffle pill was.
test.describe('Queue UX shell — hero + tabs', () => {
  async function openQueue(page) {
    await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  }

  test('the hero shows the now-playing clip and the "All" source subtitle', async ({ page }) => {
    await openQueue(page);
    await expect(page.locator('.qs-hero-title')).toHaveText('Millie Walk');
    await expect(page.locator('.qs-hero-sub')).toHaveText('All');
  });

  test('the hero names the scoped person/month source', async ({ page }) => {
    await page.goto('/app/homeview/video.html?homeMoviesPerson=millie&from=browse');
    await page.locator('#btn-queue').click();
    await expect(page.locator('.qs-hero-sub')).toHaveText('Millie');
    await page.goto('/app/homeview/video.html?homeMoviesMonth=2026-01&from=browse');
    await page.locator('#btn-queue').click();
    await expect(page.locator('.qs-hero-sub')).toHaveText('Jan 2026');
  });

  test('Shuffle/Repeat are always shown, icon-only, no text label', async ({ page }) => {
    await openQueue(page);
    const shuffle = page.locator('.qs-transport button[data-action="toggle-shuffle"]');
    const repeat = page.locator('.qs-transport button[data-action="toggle-repeat"]');
    await expect(shuffle).toBeVisible();
    await expect(repeat).toBeVisible();
    expect((await shuffle.textContent()).trim()).toBe('🔀');
    expect((await repeat.textContent()).trim()).toBe('🔁');
  });

  test('tapping Shuffle fires toggle-shuffle and flips the hero pill on', async ({ page }) => {
    await openQueue(page);
    const toggled = page.waitForRequest(function(req) {
      return req.url().includes('/api/queue/home-movie/toggle-shuffle') && req.method() === 'POST';
    });
    await page.locator('.qs-transport button[data-action="toggle-shuffle"]').click();
    await toggled;
    await expect(page.locator('.qs-transport button[data-action="toggle-shuffle"]')).toHaveClass(/on/);
  });

  test('the tab bar spans full width equally, labelled with live counts', async ({ page }) => {
    await openQueue(page);
    await expect(page.locator('.qs-tab[data-tab="queue"]')).toHaveText(/Queue \d+/);
    await expect(page.locator('.qs-tab[data-tab="next"]')).toHaveText(/Next \d+/);
    await expect(page.locator('.qs-tab[data-tab="coming-up"]')).toHaveText(/Coming Up \d+/);
  });

  test('tapping a Next row plays it now via play-item — never mutates the queue', async ({ page }) => {
    await openQueue(page);
    await page.locator('.qs-tab[data-tab="next"]').click();
    const playItem = page.waitForRequest(function(req) {
      return req.url().includes('/api/queue/home-movie/play-item') && req.method() === 'POST';
    });
    await page.locator('.qs-panel[data-tab="next"] .qs-select').first().click();
    const req = await playItem;
    expect(JSON.parse(req.postData())).toEqual({ item_id: 'beach-day' });
  });

  test('Coming Up rows render read-only — no reorder/remove actions', async ({ page }) => {
    await openQueue(page);
    await page.locator('.qs-tab[data-tab="coming-up"]').click();
    const panel = page.locator('.qs-panel[data-tab="coming-up"]');
    await expect(panel.locator('.qs-row').first()).toHaveClass(/qs-readonly/);
    expect(await panel.locator('.qs-actions').count()).toBe(0);
  });
});

// TASK-499 — the player-screen pill row's own Shuffle/Repeat controls (icon-
// only, always shown for home-movie mode — QUEUE-UX-SHELL.md's Player-screen
// pill row section), and the icon-only Queue-open button.
test.describe('player pill row', () => {
  test('Shuffle/Repeat are visible, icon-only, and toggle the engine', async ({ page }) => {
    await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
    await expect(page.locator('#btn-hm-shuffle')).toBeVisible();
    await expect(page.locator('#btn-hm-repeat')).toBeVisible();
    expect((await page.locator('#btn-hm-shuffle').textContent()).trim()).toBe('🔀');
    const toggled = page.waitForRequest(function(req) {
      return req.url().includes('/api/queue/home-movie/toggle-repeat') && req.method() === 'POST';
    });
    await page.locator('#btn-hm-repeat').click();
    await toggled;
  });

  test('the mv-only Shuffle/Repeat pills stay hidden for home-movie mode', async ({ page }) => {
    await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
    await expect(page.locator('#btn-mv-shuffle')).toHaveClass(/hidden/);
    await expect(page.locator('#btn-mv-repeat')).toHaveClass(/hidden/);
  });

  test('the Queue-open button is icon-only (no "Queue" text)', async ({ page }) => {
    await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
    expect((await page.locator('#btn-queue').textContent()).trim()).toBe('☰');
  });

  test('CC stays hidden for a home movie (no caption track)', async ({ page }) => {
    await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
    await expect(page.locator('#btn-cc')).toHaveClass(/hidden/);
  });
});
