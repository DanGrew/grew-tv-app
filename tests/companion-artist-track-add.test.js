const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');

// TASK-440 — the companion mirror: each song row on the companion artist page gains
// the same single ＋ "Add to playlist" control companion-detail's album track rows
// already have (TASK-207/253). Play Next on top, then the profile's playlists, then
// New playlist + Cancel; Play Next POSTs queue-track per person. In Browse (desync)
// the play tile greys but the ＋ / sheet stay live, matching the album mirror.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockApp(page, person) {
  let version = 1;
  const st = { screen: 'artist', artist: 'ELO', profile: 'kids', person: person };
  return page.routeWebSocket(/:8766/, (ws) => {
    function pushCtx() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: 'artist', artist: st.artist }));
      ws.send(msg('app_state', st));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') pushCtx();
    });
  });
}

async function mockArtist(page) {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS) })
  }));
  await page.route('**/api/queue/music/queue-item**', route => route.fulfill({ status: 204, body: '' }));
}

// Synced (Control) entry.
async function openSynced(page) {
  await mockArtist(page);
  await mockApp(page, 'mom');
  await page.goto('/companion/artist.html');
  await expect(page.locator('.detail-track-row').first()).toBeVisible();
}

// Browse (desync) entry: self-loads from ?id, rows grey out.
async function openDesynced(page) {
  await page.addInitScript(() => { sessionStorage.setItem('grew-tv:companion-mode', 'desynced'); });
  await mockArtist(page);
  await mockApp(page, 'mom');
  await page.goto('/companion/artist.html?id=ELO');
  await expect(page.locator('.detail-track-row').first()).toBeVisible();
}

async function playNext(page, id) {
  await page.locator('.detail-add-btn[data-add="' + id + '"]').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#add-sheet-list .add-queue').click();
}

test('each song row carries a single ＋; the sheet\'s top option is ▶ Play Next, then the profile\'s playlists', async ({ page }) => {
  await openSynced(page);
  await expect(page.locator('.detail-add-btn')).toHaveCount(5);
  await expect(page.locator('.detail-add-btn[data-add="ootb-01"]')).toHaveText('＋');
  await page.locator('.detail-add-btn[data-add="ootb-01"]').click();
  await expect(page.locator('#add-sheet-list > *').first()).toHaveClass(/add-queue/);
  await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Play Next');
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
});

test('Control mode: the queue option POSTs queue-item for the active person, confirms, and closes', async ({ page }) => {
  await openSynced(page);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/queue-item') && req.method() === 'POST');
  await playNext(page, 'ootb-01');
  const req = await queued;
  expect(req.url()).toContain('person=mom');
  expect(JSON.parse(req.postData())).toEqual({ item_id: 'ootb-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to Queue');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('picking an existing playlist POSTs add-track and confirms, then closes the sheet', async ({ page }) => {
  await openSynced(page);
  await page.locator('.detail-add-btn[data-add="ootb-01"]').click();
  const add = page.waitForRequest(req =>
    req.url().includes('/api/playlists/add-track') && req.method() === 'POST');
  await page.locator('#add-sheet-list .add-choice[data-id="pl-roadtrip"]').click();
  expect(JSON.parse((await add).postData())).toEqual({ playlist_id: 'pl-roadtrip', track_id: 'ootb-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to Road Trip');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('New playlist hands off to the create page carrying the track id and profile', async ({ page }) => {
  await openSynced(page);
  await page.locator('.detail-add-btn[data-add="ootb-01"]').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addTrack=ootb-01&profile=kids/);
});

test('Browse mode: the play tile greys but the ＋ / queue option stays live and still POSTs', async ({ page }) => {
  await openDesynced(page);
  await expect(page.locator('.song[data-id="ootb-01"]')).toHaveClass(/desync-off/);
  await expect(page.locator('.detail-add-btn[data-add="ootb-01"]')).not.toHaveClass(/desync-off/);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/queue-item') && req.method() === 'POST');
  await playNext(page, 'ootb-01');
  expect(JSON.parse((await queued).postData())).toEqual({ item_id: 'ootb-01' });
  await expect(page.locator('#add-status')).toHaveText('Added to Queue');
});
