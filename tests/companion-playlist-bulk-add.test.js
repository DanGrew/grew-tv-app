const { test, expect } = require('@playwright/test');
const { installApi, VIDEOS, BROWSE, PLAYLIST_CARDS } = require('./fixtures/api.js');

// FEAT-036 (TASK-212) — the companion "Add all to playlist" bulk-add, the mirror of
// the app's album-detail / playlist-detail "Add all" buttons. On companion-detail an
// ALBUM gains a header "＋ Add all to playlist" control (a TV series does not); on
// companion-playlist the manage row gains the same control. Both open the add sheet
// and POST add-source (a whole-album / whole-playlist SNAPSHOT) instead of add-track;
// the playlist sheet excludes the current playlist (no self-add). New playlist hands
// off to the companion create page carrying the bulk source. The app side of the WS
// is stubbed so the companion captures the live context and fetches over HTTP.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

const ALBUM = {
  id: 'ootb', title: 'Out of the Blue', profile: 'kids', poster: 'ootb.jpg',
  type: null, collectionType: 'album', artist: 'ELO', seasons: [],
  items: [
    { season: null, episode: 1, video: VIDEOS['ootb-01'] },
    { season: null, episode: 2, video: VIDEOS['ootb-02'] },
    { season: null, episode: 3, video: VIDEOS['ootb-03'] }
  ]
};

function mockApp(page, ctx) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function push() {
      version += 1;
      ws.send(msg('context', Object.assign({ version: version }, ctx.context)));
      ws.send(msg('app_state', ctx.appState));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') push();
    });
  });
}

async function browseWithPlaylists(page) {
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(PLAYLIST_CARDS) })
  }));
}

// --- companion-detail: add the whole album ----------------------------------
async function openAlbum(page) {
  await installApi(page);
  await browseWithPlaylists(page);
  await page.route('**/api/series/ootb', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(ALBUM)
  }));
  await mockApp(page, {
    context: { context_id: 'detail', series_id: 'ootb' },
    appState: { screen: 'detail', itemId: 'ootb', profile: 'kids', person: 'mom' }
  });
  await page.goto('/companion/detail.html');
  await expect(page.locator('.detail-track-row').first()).toBeVisible();
}

test('an album offers a header Add all to playlist control', async ({ page }) => {
  await openAlbum(page);
  await expect(page.locator('#btn-add-all')).toHaveText('＋ Add all to playlist');
});

test('a TV series (not an album) offers no Add all control', async ({ page }) => {
  await installApi(page);
  await browseWithPlaylists(page);
  await mockApp(page, {
    context: { context_id: 'detail', series_id: 'bluey' },
    appState: { screen: 'detail', itemId: 'bluey', profile: 'kids', person: 'mom' }
  });
  await page.goto('/companion/detail.html');
  await expect(page.locator('.tile-btn').first()).toBeVisible();
  await expect(page.locator('#btn-add-all')).toHaveCount(0);
});

test('Add all opens a sheet and a pick POSTs add-source for the whole album', async ({ page }) => {
  await openAlbum(page);
  await page.locator('#btn-add-all').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-source') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-roadtrip"]').click();
  const body = JSON.parse((await add).postData());
  expect(body).toEqual({ playlist_id: 'pl-roadtrip', source_type: 'album', source_id: 'ootb' });
  await expect(page.locator('#add-status')).toHaveText('Added to Road Trip');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('New playlist from an album hands off carrying the album source + profile', async ({ page }) => {
  await openAlbum(page);
  await page.locator('#btn-add-all').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addSourceType=album&addSourceId=ootb&profile=kids/);
});

// --- companion-playlist: add this whole playlist into another ---------------
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

async function openPlaylist(page, id) {
  await installApi(page);
  await browseWithPlaylists(page);
  await mockPlaylistApp(page, id);
  await page.goto('/companion/playlist.html');
  await expect(page.locator('#ctx-title')).toHaveText('Road Trip');
}

test('a playlist offers an Add all to playlist control', async ({ page }) => {
  await openPlaylist(page, 'pl-roadtrip');
  await expect(page.locator('#btn-add-all')).toHaveText('＋ Add all to playlist');
});

test('the playlist sheet excludes the current playlist (no self-add)', async ({ page }) => {
  await openPlaylist(page, 'pl-roadtrip');
  await page.locator('#btn-add-all').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Empty Mix']);
});

test('picking a target POSTs add-source for this whole playlist (snapshot)', async ({ page }) => {
  await openPlaylist(page, 'pl-roadtrip');
  await page.locator('#btn-add-all').click();
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-source') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-empty"]').click();
  const body = JSON.parse((await add).postData());
  expect(body).toEqual({ playlist_id: 'pl-empty', source_type: 'playlist', source_id: 'pl-roadtrip' });
  await expect(page.locator('#add-status')).toHaveText('Added to Empty Mix');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('New playlist from a playlist hands off carrying the playlist source + profile', async ({ page }) => {
  await openPlaylist(page, 'pl-roadtrip');
  await page.locator('#btn-add-all').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addSourceType=playlist&addSourceId=pl-roadtrip&profile=kids/);
});
