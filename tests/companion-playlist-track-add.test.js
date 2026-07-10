const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, PLAYLIST_CARDS } = require('./fixtures/api.js');

// TASK-262 (FEAT-039) — the companion mirror of the app playlist detail's per-track
// ＋ (mirror invariant). TASK-328 relocated that ＋ (with ↑ ↓ ✕) from an inline row
// chip into the row's ⋮ kebab popover, so these tests open the kebab first. The ＋
// still opens the add sheet: "☰ Play Next" on top (queue that ONE track), then the
// active profile's playlists, then New playlist + Cancel. Play Next POSTs queue-track
// per person; picking a playlist POSTs add-track; New playlist hands off to the
// companion create page carrying the track. The app side of the WS is stubbed so the
// companion captures the live playlist context and fetches over HTTP. The whole-list
// "Add all to playlist" control stays (companion-playlist-bulk-add).

function msg(type, payload) { return JSON.stringify({ type, payload }); }

async function browseWithPlaylists(page) {
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(PLAYLIST_CARDS) })
  }));
}

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

// pl-roadtrip holds ootb-03 then ootb-01 (a 2-track mix in stored order).
async function openPlaylist(page) {
  await installApi(page);
  await browseWithPlaylists(page);
  await page.route('**/api/playback/queue-track**', route => route.fulfill({ status: 204, body: '' }));
  await mockPlaylistApp(page, 'pl-roadtrip');
  await page.goto('/companion/playlist.html');
  await expect(page.locator('#ctx-title')).toHaveText('Road Trip');
  await expect(page.locator('.ph-txt[data-id="ootb-03"]')).toBeVisible();
}

// TASK-328 — the ＋ (add) lives in the row's ⋮ kebab popover now. Open the kebab,
// then click the popover's ＋ to open the add sheet (the popover closes as it does).
async function openRowMenu(page, trackId) {
  await page.locator('.ph-row:has(.ph-txt[data-id="' + trackId + '"]) .ph-kebab').click();
  await expect(page.locator('#row-pop')).toBeVisible();
}
async function openAddSheet(page, trackId) {
  await openRowMenu(page, trackId);
  await page.locator('#row-pop .ph-edit.add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
}

test('TASK-328: each row exposes ＋ (add) alongside ✕ (remove) via its ⋮ kebab popover', async ({ page }) => {
  await openPlaylist(page);
  await expect(page.locator('.ph-row .ph-kebab')).toHaveCount(2);
  await openRowMenu(page, 'ootb-03');
  await expect(page.locator('#row-pop .ph-edit.add')).toHaveCount(1);
  await expect(page.locator('#row-pop .ph-edit.add')).toHaveText('＋');
  await expect(page.locator('#row-pop .ph-edit.x')).toHaveCount(1);
});

test('＋ opens a sheet with Play Next on top, then the profile\'s playlists + New playlist', async ({ page }) => {
  await openPlaylist(page);
  await openAddSheet(page, 'ootb-03');
  await expect(page.locator('#add-sheet-list > *').first()).toHaveClass(/add-queue/);
  await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Play Next');
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
  await expect(page.locator('#btn-add-create')).toBeVisible();
  await expect(page.locator('#btn-add-cancel')).toBeVisible();
});

test('Play Next queues the one track (queue-track POST carries person=)', async ({ page }) => {
  await openPlaylist(page);
  await openAddSheet(page, 'ootb-03');
  const queue = page.waitForRequest(req =>
    req.url().includes('/api/playback/queue-track') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-queue').click();
  const req = await queue;
  expect(req.url()).toContain('person=kids');
  expect(JSON.parse(req.postData())).toEqual({ track_id: 'ootb-03' });
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('picking an existing playlist POSTs add-track and confirms, then closes the sheet', async ({ page }) => {
  await openPlaylist(page);
  await openAddSheet(page, 'ootb-01');
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-track') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-empty"]').click();
  expect(JSON.parse((await add).postData())).toEqual({ playlist_id: 'pl-empty', track_id: 'ootb-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to Empty Mix');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('Cancel closes the add sheet without adding', async ({ page }) => {
  await openPlaylist(page);
  await openAddSheet(page, 'ootb-01');
  await page.locator('#btn-add-cancel').click();
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('New playlist hands off to the create page carrying the track id and profile', async ({ page }) => {
  await openPlaylist(page);
  await openAddSheet(page, 'ootb-03');
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addTrack=ootb-03&profile=kids/);
});
