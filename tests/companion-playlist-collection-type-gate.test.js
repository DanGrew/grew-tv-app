const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, PLAYLIST_CARDS, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

// TASK-378 follow-up bug (found in manual testing) — the companion mirror of
// tests/playlist-collection-type-gate.test.js. companion-playlist.js's add sheet
// (per-track ＋ in the row kebab, AND the header "Add all to playlist") must gate
// on the currently-open playlist's own collectionType (state.collectionType,
// captured off loadPlaylist), never defaulting to song playlists regardless of
// what's actually open.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockPlaylistApp(page, playlistId) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function push() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: 'playlist', playlist: playlistId }));
      ws.send(msg('app_state', { screen: 'playlist', itemId: playlistId, profile: 'kids', person: 'kids' }));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') push();
    });
  });
}

async function openPlaylist(page, id, titleText) {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(PLAYLIST_CARDS).concat(MUSIC_VIDEO_CARDS) })
  }));
  await mockPlaylistApp(page, id);
  await page.goto('/companion/playlist.html');
  await expect(page.locator('#ctx-title')).toHaveText(titleText);
}

async function openRowMenu(page, trackId) {
  await page.locator('.ph-row:has(.ph-txt[data-id="' + trackId + '"]) .ph-kebab').click();
  await expect(page.locator('#row-pop')).toBeVisible();
}
async function openTrackAddSheet(page, trackId) {
  await openRowMenu(page, trackId);
  await page.locator('#row-pop .ph-edit.add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
}

// --- from a music-video playlist: never offer a song playlist ---------------

test('a music-video playlist\'s per-track ＋ offers only music-video playlists, never a song playlist', async ({ page }) => {
  await openPlaylist(page, 'pl-mv', 'QOTSA Videos');
  await expect(page.locator('.ph-txt[data-id="mv-01"]')).toBeVisible();
  await openTrackAddSheet(page, 'mv-01');
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ QOTSA Videos']);
});

test('a music-video playlist\'s "Add all to playlist" offers only music-video playlists, never a song playlist', async ({ page }) => {
  await openPlaylist(page, 'pl-mv', 'QOTSA Videos');
  await page.locator('#btn-add-all').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveCount(0);
  await expect(page.locator('#btn-add-create')).toBeVisible();
});

test('New playlist from a music-video playlist\'s add sheet carries collectionType=music-video-playlist', async ({ page }) => {
  await openPlaylist(page, 'pl-mv', 'QOTSA Videos');
  await openTrackAddSheet(page, 'mv-01');
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addTrack=mv-01&profile=kids&collectionType=music-video-playlist/);
});

// --- from a song playlist: never offer a music-video playlist ---------------

test('a song playlist\'s per-track ＋ never offers a music-video playlist', async ({ page }) => {
  await openPlaylist(page, 'pl-roadtrip', 'Road Trip');
  await openTrackAddSheet(page, 'ootb-03');
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
});

test('a song playlist\'s "Add all to playlist" never offers a music-video playlist', async ({ page }) => {
  await openPlaylist(page, 'pl-roadtrip', 'Road Trip');
  await page.locator('#btn-add-all').click();
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Empty Mix']);
});
