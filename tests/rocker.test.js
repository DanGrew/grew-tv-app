const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, MUSIC_CARDS, MUSIC_VIDEO_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-602 (FEAT-526) — the handset's − and + (`-` and `=`) press the ⏮ and ⏭
// drawn on the video player, the music player and the Queue overlay. The press
// IS the drawn control, so what it steps to, and whether it does anything at
// all, is whatever that control does. The channel player's flip on the same
// keys is tests/channel-player.test.js, unchanged by this row (story 6).

// Every POST of a queue engine action, so a test can say a press sent nothing.
function actionPosts(page, action) {
  const posts = [];
  page.on('request', req => {
    if (req.method() === 'POST' && req.url().includes('/' + action + '?')) posts.push(req.url());
  });
  return posts;
}

// A press that must do nothing has no event to wait on; this is long enough for
// a click's POST to have left the page.
async function settle(page) {
  await page.waitForTimeout(500);
}

test.describe('the video player', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await installQueuePlaybackBackend(page, 'series');
    await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
    await expect(page.locator('#screen-video')).toBeVisible();
    await expect(page.locator('#video-upnext')).toHaveText('Up next: The Weekend');
  });

  // Story 3.
  test('+ plays the next episode, the same as ⏭', async ({ page }) => {
    await page.keyboard.press('=');
    await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);
  });

  test('− steps back, the same as ⏮', async ({ page }) => {
    await page.keyboard.press('=');
    await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);
    await page.keyboard.press('-');
    await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
  });

  // Story 5.
  test('with the Queue open, + presses the Queue\'s own ⏭ and the Queue stays open', async ({ page }) => {
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
    const next = page.waitForRequest(req => req.url().includes('/api/queue/series/next') && req.method() === 'POST');
    await page.keyboard.press('=');
    await next;
    await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  });

  test('with the Queue open, − presses the Queue\'s own ⏮', async ({ page }) => {
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
    const prev = page.waitForRequest(req => req.url().includes('/api/queue/series/previous') && req.method() === 'POST');
    await page.keyboard.press('-');
    await prev;
  });

  // Story 7.
  test('with the Jump grid open, + does nothing behind it', async ({ page }) => {
    const posts = actionPosts(page, 'next');
    await page.locator('#btn-jump').click();
    await expect(page.locator('.jump-popup')).toBeVisible();
    await page.keyboard.press('=');
    await settle(page);
    expect(posts).toEqual([]);
    await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
    await expect(page.locator('.jump-popup')).toBeVisible();
  });

  // The Up-next countdown covers the transport the same way, and a press there
  // would race the countdown's own advance into a double skip.
  test('during the Up next countdown, + does nothing', async ({ page }) => {
    const posts = actionPosts(page, 'next');
    await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
    await expect(page.locator('#upnext-overlay')).toBeVisible();
    await page.keyboard.press('=');
    await settle(page);
    expect(posts).toEqual([]);
  });
});

test.describe('a music video', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await installQueuePlaybackBackend(page, 'music-video');
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS).concat(PLAYLIST_CARDS) })
    }));
  });

  test('+ plays the next video in the playlist', async ({ page }) => {
    await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
    await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
    await page.keyboard.press('=');
    await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  });

  // Story 4 — a lone pick dims ⏮/⏭, and a press on a dimmed control is nothing.
  test('a lone pick with ⏮/⏭ dimmed ignores − and +', async ({ page }) => {
    const nexts = actionPosts(page, 'next');
    const prevs = actionPosts(page, 'previous');
    await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
    await expect(page.locator('#btn-next')).toHaveClass(/is-disabled/);
    await page.keyboard.press('=');
    await page.keyboard.press('-');
    await settle(page);
    expect(nexts).toEqual([]);
    expect(prevs).toEqual([]);
  });

  test('with the Queue open on a lone pick, the dimmed hero ⏭ ignores +', async ({ page }) => {
    const nexts = actionPosts(page, 'next');
    await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
    await expect(page.locator('#btn-next')).toHaveClass(/is-disabled/);
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
    await page.keyboard.press('=');
    await settle(page);
    expect(nexts).toEqual([]);
  });

  // Story 7.
  test('with the ＋ Playlist sheet open, + does nothing behind it', async ({ page }) => {
    const posts = actionPosts(page, 'next');
    await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
    await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
    await page.locator('#btn-add-playlist').click();
    await expect(page.locator('#add-sheet')).toBeVisible();
    await page.keyboard.press('=');
    await settle(page);
    expect(posts).toEqual([]);
    await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  });
});

test.describe('the music player', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await installQueuePlaybackBackend(page, 'music');
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
    }));
    await page.goto('/app/homeview/profile.html');
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
    await page.locator('.sidebar-tab[data-tab="music"]').click();
    await page.locator('.film-tile[data-id="ootb"]').click();
    await page.locator('.detail-row[data-id="ootb-01"]').click();
    await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  });

  // Story 1.
  test('+ starts the next track, the same as ⏭', async ({ page }) => {
    const next = page.waitForRequest(req => req.url().includes('/api/queue/music/next') && req.method() === 'POST');
    await page.keyboard.press('=');
    await next;
    await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
  });

  // Story 2.
  test('− does whatever ⏮ does', async ({ page }) => {
    await page.keyboard.press('=');
    await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
    const prev = page.waitForRequest(req => req.url().includes('/api/queue/music/previous') && req.method() === 'POST');
    await page.keyboard.press('-');
    await prev;
    await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  });

  // Story 5.
  test('with the Queue open, + presses the Queue\'s own ⏭', async ({ page }) => {
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
    await page.keyboard.press('=');
    await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  });

  // Story 7.
  test('with the Jump grid open, + does nothing behind it', async ({ page }) => {
    const posts = actionPosts(page, 'next');
    await page.locator('#btn-jump').click();
    await expect(page.locator('.jump-popup')).toBeVisible();
    await page.keyboard.press('=');
    await settle(page);
    expect(posts).toEqual([]);
    await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  });
});

// Story 8 — nothing off a player claims either key.
test('− and + on Browse do nothing', async ({ page }) => {
  await installApi(page);
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  const url = page.url();
  await page.keyboard.press('=');
  await page.keyboard.press('-');
  await settle(page);
  expect(page.url()).toBe(url);
});
