const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');
const { enterBrowse } = require('./fixtures/nav.js');

// TASK-378 — the Music Videos "Playlists" rail heading carries the same ＋ create
// affordance Music's does (FEAT-039/TASK-235), creating a `music-video-playlist`
// instead of a plain one. The rail (mv-playlists) is guaranteed to exist even with
// zero music-video playlists yet (withMvPlaylistsRail, core/home-rails), same as
// Music's own always-present Playlists rail.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      profile: 'kids', genreLabels: BROWSE.kids.genreLabels,
      content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS).concat(MUSIC_VIDEO_CARDS)
    })
  }));
  await page.goto('/app/homeview/profile.html');
});

async function enterMusicVideos(page) {
  await enterBrowse(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="music-videos"]').click();
}

test('the Music Videos Playlists rail heading carries a ＋ that opens the create flow', async ({ page }) => {
  await enterMusicVideos(page);
  await expect(page.locator('.rail-row[data-rail="mv-playlists"]')).toBeVisible();
  const plus = page.locator('.rail-title [data-create-playlist]');
  await expect(plus).toBeVisible();
  await plus.click();
  await expect(page).toHaveURL(/playlist-create\.html\?collectionType=music-video-playlist/);
});

test('typing a name then Create makes a music-video-playlist (not a plain one), holding no tracks yet', async ({ page }) => {
  await enterMusicVideos(page);
  await page.locator('.rail-title [data-create-playlist]').click();
  const create = page.waitForRequest(req => req.url().includes('/api/playlists/create') && req.method() === 'POST');
  for (const ch of 'ROCK') {
    await page.locator('#pl-keys button').filter({ hasText: new RegExp('^' + ch + '$') }).click();
  }
  await page.locator('#btn-create').click();
  const body = JSON.parse((await create).postData());
  expect(body).toEqual({ name: 'ROCK', profile: 'kids', collection_type: 'music-video-playlist' });
  await expect(page).toHaveURL(/playlist-detail\.html\?playlist=pl-rock/);
});

test('the Music tab\'s own ＋ still creates a plain playlist (regression)', async ({ page }) => {
  await enterBrowse(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.rail-title [data-create-playlist]').click();
  await expect(page).toHaveURL(/playlist-create\.html$/); // no collectionType param
  const create = page.waitForRequest(req => req.url().includes('/api/playlists/create') && req.method() === 'POST');
  for (const ch of 'MIX') {
    await page.locator('#pl-keys button').filter({ hasText: new RegExp('^' + ch + '$') }).click();
  }
  await page.locator('#btn-create').click();
  const body = JSON.parse((await create).postData());
  expect(body).toEqual({ name: 'MIX', profile: 'kids', collection_type: 'playlist' });
});

test('the Music Videos Playlists rail is present (heading-only) even with zero music-video playlists', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      profile: 'kids', genreLabels: BROWSE.kids.genreLabels,
      content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS.filter(c => c.collectionType !== 'music-video-playlist'))
    })
  }));
  await enterMusicVideos(page);
  const rail = page.locator('.rail-row[data-rail="mv-playlists"]');
  await expect(rail).toBeVisible();
  await expect(rail.locator('.film-tile')).toHaveCount(0);
  await expect(page.locator('.rail-title [data-create-playlist]')).toBeVisible();
});
