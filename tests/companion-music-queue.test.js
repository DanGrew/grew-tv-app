const { test, expect } = require('@playwright/test');
const { installApi, VIDEOS, BROWSE } = require('./fixtures/api.js');

// FEAT-040 (TASK-248) — the companion mirror of the album-detail "＋ Queue" (Play
// Next). Each ALBUM track row carries a ＋ Queue control beside ＋ Playlist; tapping
// it POSTs queue-track per person to /api/playback. Because it is a per-person POST
// (not a WS intent), it works in BOTH modes — in Browse the play tile greys but the
// ＋ Queue control stays live, exactly like ＋ Playlist. The durable override queue
// (TASK-246) keeps it across album swaps. Absorbs FEAT-038 TASK-231 (music half).

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

async function mockAlbum(page) {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content })
  }));
  await page.route('**/api/series/ootb', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(ALBUM)
  }));
  await page.route('**/api/playback/queue-track**', route => route.fulfill({ status: 204, body: '' }));
}

// Synced (Control) entry: the TV is on this album, the companion follows its echo.
async function openSynced(page, sent) {
  await mockAlbum(page);
  await mockApp(page, {
    context: { context_id: 'detail', series_id: 'ootb' },
    appState: { screen: 'detail', itemId: 'ootb', profile: 'kids', person: 'mom' }
  }, sent);
  await page.goto('/companion/detail.html');
  await expect(page.locator('.detail-track-row').first()).toBeVisible();
}

// Browse (desync) entry: the TV is elsewhere; the companion self-loads from ?id.
async function openDesynced(page, sent) {
  await page.addInitScript(() => {
    sessionStorage.setItem('grew-tv:companion-mode', 'desynced');
    sessionStorage.removeItem('grew-tv:nav-trail');
  });
  await mockAlbum(page);
  await mockApp(page, {
    context: { context_id: 'browse' },
    appState: { screen: 'browse', profile: 'kids', person: 'mom' }
  }, sent);
  await page.goto('/companion/detail.html?id=ootb');
  await expect(page.locator('.detail-track-row').first()).toBeVisible();
}

test('every album track row carries a ＋ Queue control beside ＋ Playlist', async ({ page }) => {
  await openSynced(page, []);
  await expect(page.locator('.detail-queue-btn')).toHaveCount(3);
  await expect(page.locator('.detail-queue-btn[data-queue="ootb-01"]')).toHaveText('＋ Queue');
  await expect(page.locator('.detail-track-row').first().locator('.detail-add-btn')).toHaveCount(1);
});

test('Control mode: ＋ Queue POSTs queue-track for the active person and confirms', async ({ page }) => {
  await openSynced(page, []);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/playback/queue-track') && req.method() === 'POST');
  await page.locator('.detail-queue-btn[data-queue="ootb-02"]').click();
  const req = await queued;
  expect(req.url()).toContain('person=mom');
  expect(JSON.parse(req.postData())).toEqual({ track_id: 'ootb-02' });
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
});

test('Browse mode: the play tile greys but ＋ Queue stays live and still POSTs', async ({ page }) => {
  await openDesynced(page, []);
  // Play is greyed (drives the TV), ＋ Queue is not (per-person POST).
  await expect(page.locator('.tile-btn[data-id="ootb-02"]')).toHaveClass(/desync-off/);
  await expect(page.locator('.detail-queue-btn[data-queue="ootb-02"]')).not.toHaveClass(/desync-off/);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/playback/queue-track') && req.method() === 'POST');
  await page.locator('.detail-queue-btn[data-queue="ootb-02"]').click();
  const req = await queued;
  expect(JSON.parse(req.postData())).toEqual({ track_id: 'ootb-02' });
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
});

test('the play tile still plays — ＋ Queue does not hijack the row (Control mode)', async ({ page }) => {
  const sent = [];
  await openSynced(page, sent);
  await page.locator('.tile-btn[data-id="ootb-02"]').click();
  await expect.poll(() => sent.some(m =>
    m.type === 'intent' && m.payload.intent === 'play' && m.payload.params.id === 'ootb-02')).toBe(true);
});
