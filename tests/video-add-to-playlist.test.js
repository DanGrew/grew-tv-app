const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, MUSIC_VIDEO_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');

// TASK-378 — "Add to playlist" for the CURRENTLY PLAYING music video, on the TV
// player itself (screen-video-page.js) — there is no music-video detail page to
// hang it off (TASK-374 made a music video standalone). The sheet mirrors the
// album-detail per-track one (screen-album-detail-page.js): profile's
// music-video playlists (never a song playlist) + New playlist + Cancel. Music-
// video-only: hidden for a film/series, where the existing engine-driven Queue
// button lives instead. "Currently playing" reads off the server-authoritative
// snapshot, so every test needs a working engine backend for the player to
// swap in at all — the TASK-498 unified one since TASK-505 cut music videos
// over to it.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'music-video');
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        profile: 'kids', genreLabels: BROWSE.kids.genreLabels,
        content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS).concat(PLAYLIST_CARDS)
      })
    });
  });
});

test('the Add to playlist button shows for a music video, and offers only its music-video playlists (never a song playlist)', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-add-playlist')).toBeVisible();
  await page.locator('#btn-add-playlist').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ QOTSA Videos']);
  await expect(page.locator('#btn-add-create')).toBeVisible();
  await expect(page.locator('#btn-add-cancel')).toBeVisible();
});

test('picking a playlist adds the CURRENTLY PLAYING video and confirms, then closes the sheet', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await page.locator('#btn-add-playlist').click();
  const add = page.waitForRequest(req => req.url().includes('/api/playlists/add-track') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-mv"]').click();
  const body = JSON.parse((await add).postData());
  expect(body).toEqual({ playlist_id: 'pl-mv', track_id: 'mv-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to QOTSA Videos');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('after advancing to the next music video, Add to playlist adds THAT one (currentItem, not the entry item)', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.locator('#btn-add-playlist').click();
  const add = page.waitForRequest(req => req.url().includes('/api/playlists/add-track') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-mv"]').click();
  const body = JSON.parse((await add).postData());
  expect(body).toEqual({ playlist_id: 'pl-mv', track_id: 'mv-02' });
});

test('New playlist hands off to the create screen carrying the video id + collectionType=music-video-playlist', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-03&from=browse');
  await page.locator('#btn-add-playlist').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?.*addTrack=mv-03.*collectionType=music-video-playlist/);
});

test('creating a playlist from the player lands on the new music-video-playlist holding that video', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-03&from=browse');
  await page.locator('#btn-add-playlist').click();
  const create = page.waitForRequest(req => req.url().includes('/api/playlists/create') && req.method() === 'POST');
  await page.locator('#btn-add-create').click();
  for (const ch of 'MUSE') {
    await page.locator('#pl-keys button').filter({ hasText: new RegExp('^' + ch + '$') }).click();
  }
  await page.locator('#btn-create').click();
  const body = JSON.parse((await create).postData());
  // The create page's own profile picker (no ?profile= carried, mirrors the
  // pre-existing album-detail createNew gap) defaults to 'adults' with no stored
  // profile — collection_type is the thing THIS test proves.
  expect(body).toEqual({ name: 'MUSE', profile: 'adults', collection_type: 'music-video-playlist' });
  await expect(page).toHaveURL(/playlist-detail\.html\?playlist=pl-muse/);
  await expect(page.locator('.detail-row[data-id="mv-03"]')).toHaveCount(1);
});

test('Cancel closes the add sheet without adding, returning focus to the Add to playlist button', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await page.locator('#btn-add-playlist').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#btn-add-cancel').click();
  await expect(page.locator('#add-sheet')).toBeHidden();
  await expect(page.locator('#btn-add-playlist')).toBeFocused();
});

test('Escape closes the add sheet', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await page.locator('#btn-add-playlist').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#add-sheet-list .add-choice').first().focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

// TASK-600 — the remote's burger button (`c`) cycles Night Mode on the player, but
// never from under the sheet: the sheet's own keydown stops the press before the
// page's key map sees it.
test('the burger button does nothing behind the open ＋ Playlist sheet', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await page.locator('#btn-add-playlist').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#add-sheet-list .add-choice').first().focus();
  await page.keyboard.press('c');
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#btn-night')).toHaveText('Night: Off');
});

// TASK-600 — the positive half on a music video, so the sheet test above can't
// pass merely because the burger button does nothing on this page at all.
test('the burger button cycles Night Mode on a music video', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-add-playlist')).toBeVisible();
  await page.keyboard.press('c');
  await expect(page.locator('#btn-night')).toHaveText('Night: Soft');
});

// TASK-596 — ＋ Playlist was drawn, and focus was even placed on it when its
// sheet closed (the Cancel test above), but it was missing from the player's
// d-pad cycle: a remote could land there once, on the way out of the sheet, and
// then never get back to it. Stepping onto it and back off is the whole of the
// fix — the sheet itself has been walkable since TASK-378.
test('＋ Playlist is a stop on the d-pad cycle, reachable and returnable (TASK-596)', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-add-playlist')).toBeVisible();
  await page.evaluate(() => document.getElementById('btn-night').focus());
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-add-playlist')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-add-playlist')).not.toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#btn-add-playlist')).toBeFocused();
});

test('a standalone film never offers Add to playlist (the existing engine Queue button lives there instead)', async ({ page }) => {
  await installQueuePlaybackBackend(page, 'film');
  await page.goto('/app/homeview/video.html?video=toy-story-main&from=browse');
  await expect(page.locator('#btn-add-playlist')).toBeHidden();
  await expect(page.locator('#btn-queue')).toBeVisible();
});
