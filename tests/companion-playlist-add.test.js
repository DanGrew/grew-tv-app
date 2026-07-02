const { test, expect } = require('@playwright/test');
const { installApi, VIDEOS, BROWSE, PLAYLIST_CARDS } = require('./fixtures/api.js');

// FEAT-036 (TASK-207) — the companion "＋ Add to playlist", the PRACTICAL build
// surface (phone keyboard + easy track browsing). Mirror of the app's album-detail
// Add sheet (TASK-206): each ALBUM track row on the companion detail screen carries
// a ＋ Playlist control opening a sheet that lists the active profile's playlists
// (loadBrowse is already profile-filtered — core/playlist-pick) plus New playlist +
// Cancel. Picking POSTs add-track; New playlist hands off to the companion create
// page carrying the track, which creates → adds → returns to the playlists list.
// A TV series (collectionType !== 'album') never offers the control. The app side of
// the WS is stubbed (as in companion-detail) so the companion captures the context
// and fetches the catalog over HTTP.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

// An album resolved via /api/series (an album IS a series row — get_series returns
// collectionType:'album'), with audio tracks reusing the shared VIDEOS fixtures.
const ALBUM = {
  id: 'ootb', title: 'Out of the Blue', profile: 'kids', poster: 'ootb.jpg',
  type: null, collectionType: 'album', artist: 'ELO', seasons: [],
  items: [
    { season: null, episode: 1, video: VIDEOS['ootb-01'] },
    { season: null, episode: 2, video: VIDEOS['ootb-02'] },
    { season: null, episode: 3, video: VIDEOS['ootb-03'] }
  ]
};

function mockApp(page, ctx, sent) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function push() {
      version += 1;
      ws.send(msg('context', Object.assign({ version: version }, ctx.context)));
      ws.send(msg('app_state', ctx.appState));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      sent.push(m);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') push();
    });
  });
}

// Browse must carry the profile's playlist cards so the Add sheet can offer them
// (the default music browse keeps playlists out — the playlist e2e injects them).
async function browseWithPlaylists(page) {
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(PLAYLIST_CARDS) })
  }));
}

async function openAlbum(page, sent) {
  await installApi(page);
  await browseWithPlaylists(page);
  await page.route('**/api/series/ootb', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(ALBUM)
  }));
  await mockApp(page, {
    context: { context_id: 'detail', series_id: 'ootb' },
    appState: { screen: 'detail', itemId: 'ootb', profile: 'kids', person: 'mom' }
  }, sent);
  await page.goto('/companion/detail.html');
  await expect(page.locator('.detail-track-row').first()).toBeVisible();
}

// TASK-253 — one consolidated "＋" per row (was "＋ Playlist"), opening the sheet.
test('every album track row carries a single ＋ control', async ({ page }) => {
  await openAlbum(page, []);
  await expect(page.locator('.detail-track-row')).toHaveCount(3);
  await expect(page.locator('.detail-add-btn')).toHaveCount(3);
  await expect(page.locator('.detail-add-btn[data-add="ootb-01"]')).toHaveText('＋');
  // The old standalone ＋ Queue is gone on album rows — queueing is the sheet's top option.
  await expect(page.locator('.detail-queue-btn')).toHaveCount(0);
});

test('a TV series (not an album) offers no ＋ Playlist control', async ({ page }) => {
  // ＋ Playlist is music-only; a TV series episode now carries a ＋ Queue (VIDEO
  // queue, FEAT-040/TASK-249) but never ＋ Playlist.
  await installApi(page);
  await browseWithPlaylists(page);
  await mockApp(page, {
    context: { context_id: 'detail', series_id: 'bluey' },
    appState: { screen: 'detail', itemId: 'bluey', profile: 'kids', person: 'mom' }
  }, []);
  await page.goto('/companion/detail.html');
  await expect(page.locator('.tile-btn').first()).toBeVisible();
  await expect(page.locator('.detail-add-btn')).toHaveCount(0);     // no ＋ Playlist
  await expect(page.locator('.detail-track-row')).toHaveCount(3);   // each w/ ＋ Queue
  await expect(page.locator('.detail-queue-btn')).toHaveCount(3);
});

test('＋ opens a sheet with Play Next on top, then the profile\'s playlists + New playlist', async ({ page }) => {
  await openAlbum(page, []);
  await page.locator('.detail-add-btn[data-add="ootb-01"]').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  // Play Next is the first sheet cell, distinct from the playlist choices.
  await expect(page.locator('#add-sheet-list > *').first()).toHaveClass(/add-queue/);
  await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Play Next');
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
  await expect(page.locator('#btn-add-create')).toBeVisible();
  await expect(page.locator('#btn-add-cancel')).toBeVisible();
});

test('picking an existing playlist POSTs add-track and confirms, then closes the sheet', async ({ page }) => {
  await openAlbum(page, []);
  await page.locator('.detail-add-btn[data-add="ootb-01"]').click();
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-track') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-roadtrip"]').click();
  const body = JSON.parse((await add).postData());
  expect(body).toEqual({ playlist_id: 'pl-roadtrip', track_id: 'ootb-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to Road Trip');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('the play tile still plays (the ＋ Playlist control does not hijack the row)', async ({ page }) => {
  const sent = [];
  await openAlbum(page, sent);
  await page.locator('.tile-btn[data-id="ootb-02"]').click();
  await expect.poll(() => sent.some(m =>
    m.type === 'intent' && m.payload.intent === 'play' && m.payload.params.id === 'ootb-02')).toBe(true);
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('Cancel closes the add sheet without adding', async ({ page }) => {
  await openAlbum(page, []);
  await page.locator('.detail-add-btn[data-add="ootb-02"]').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#btn-add-cancel').click();
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('New playlist hands off to the create page carrying the track id and profile', async ({ page }) => {
  await openAlbum(page, []);
  await page.locator('.detail-add-btn[data-add="ootb-03"]').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addTrack=ootb-03&profile=kids/);
});

test('creating a playlist from a track creates it, adds the track, then returns to the list', async ({ page }) => {
  await installApi(page);
  await page.routeWebSocket(/:8766/, function(ws) { ws.onMessage(function() {}); });
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-track') && req.method() === 'POST');
  await page.goto('/companion/playlist-create.html?addTrack=ootb-03&profile=kids');
  await page.locator('#pl-name').fill('Mix');
  await page.locator('#btn-create').click();
  const body = JSON.parse((await add).postData());
  expect(body).toEqual({ playlist_id: 'pl-mix', track_id: 'ootb-03' });
  await expect(page).toHaveURL(/companion\/browse\.html$/);
});
