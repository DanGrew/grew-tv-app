const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

// TASK-421 (story 3) — the companion mirror of tests/playlist-detail-mv-queue.test.js:
// a music-video playlist row's ＋ (kebab popover) sheet "☰ Play Next" must POST to the
// SEPARATE music-video engine (FEAT-418), never the audio engine's own queue-track.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

async function browseWithMvPlaylist(page) {
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
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

// pl-mv holds mv-01 then mv-02.
async function openPlaylist(page) {
  await installApi(page);
  await browseWithMvPlaylist(page);
  await page.route('**/api/music-video-playback/queue-video**', route => route.fulfill({ status: 204, body: '' }));
  await mockPlaylistApp(page, 'pl-mv');
  await page.goto('/companion/playlist.html');
  await expect(page.locator('#ctx-title')).toHaveText('QOTSA Videos');
  await expect(page.locator('.ph-txt[data-id="mv-01"]')).toBeVisible();
}

async function openAddSheet(page, videoId) {
  await page.locator('.ph-row:has(.ph-txt[data-id="' + videoId + '"]) .ph-kebab').click();
  await expect(page.locator('#row-pop')).toBeVisible();
  await page.locator('#row-pop .ph-edit.add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
}

test('Play Next on a music-video row POSTs queue-video to the music-video engine (person=)', async ({ page }) => {
  await openPlaylist(page);
  await openAddSheet(page, 'mv-01');
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/queue-video') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-queue').click();
  const req = await queued;
  expect(req.url()).toContain('person=kids');
  expect(JSON.parse(req.postData())).toEqual({ video_id: 'mv-01' });
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('Play Next on a music-video row never POSTs to the audio engine\'s queue-track', async ({ page }) => {
  await openPlaylist(page);
  let audioQueued = false;
  await page.route('**/api/playback/queue-track**', route => { audioQueued = true; return route.fulfill({ status: 204, body: '' }); });
  await openAddSheet(page, 'mv-01');
  await page.locator('#add-sheet-list .add-queue').click();
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
  expect(audioQueued).toBe(false);
});
