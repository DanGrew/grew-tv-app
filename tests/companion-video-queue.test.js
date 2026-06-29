const { test, expect } = require('@playwright/test');
const { installApi, SERIES, BROWSE } = require('./fixtures/api.js');

// FEAT-040 (TASK-249) — the companion mirror of the video series-detail "＋ Queue"
// (Play Next). Each episode row carries a ＋ Queue control; tapping it POSTs
// queue-video per person to the SEPARATE video queue (/api/video-playback). A
// per-person POST (not a WS intent), so it works in BOTH modes — in Browse the
// play tile greys but ＋ Queue stays live. Absorbs FEAT-038 TASK-231 (video half).

function msg(type, payload) { return JSON.stringify({ type, payload }); }

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

async function mockSeries(page) {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content })
  }));
  await page.route('**/api/series/bluey', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(SERIES.bluey)
  }));
  await page.route('**/api/video-playback/queue-video**',
    route => route.fulfill({ status: 204, body: '' }));
}

// Synced (Control) entry: the TV is on this series, the companion follows its echo.
async function openSynced(page, sent) {
  await mockSeries(page);
  await mockApp(page, {
    context: { context_id: 'detail', series_id: 'bluey' },
    appState: { screen: 'detail', itemId: 'bluey', profile: 'kids', person: 'mom' }
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
  await mockSeries(page);
  await mockApp(page, {
    context: { context_id: 'browse' },
    appState: { screen: 'browse', profile: 'kids', person: 'mom' }
  }, sent);
  await page.goto('/companion/detail.html?id=bluey');
  await expect(page.locator('.detail-track-row').first()).toBeVisible();
}

test('every episode row carries a ＋ Queue control (and no ＋ Playlist — video)', async ({ page }) => {
  await openSynced(page, []);
  await expect(page.locator('.detail-queue-btn')).toHaveCount(3);
  await expect(page.locator('.detail-add-btn')).toHaveCount(0);
  await expect(page.locator('.detail-queue-btn[data-queue="bluey-s1e01"]')).toHaveText('＋ Queue');
});

test('Control mode: ＋ Queue POSTs queue-video for the active person', async ({ page }) => {
  await openSynced(page, []);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/queue-video') && req.method() === 'POST');
  await page.locator('.detail-queue-btn[data-queue="bluey-s1e02"]').click();
  const req = await queued;
  expect(req.url()).toContain('person=mom');
  expect(JSON.parse(req.postData())).toEqual({ video_id: 'bluey-s1e02' });
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
});

test('Browse mode: the play tile greys but ＋ Queue stays live and still POSTs', async ({ page }) => {
  await openDesynced(page, []);
  await expect(page.locator('.tile-btn[data-id="bluey-s1e02"]')).toHaveClass(/desync-off/);
  await expect(page.locator('.detail-queue-btn[data-queue="bluey-s1e02"]')).not.toHaveClass(/desync-off/);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/queue-video') && req.method() === 'POST');
  await page.locator('.detail-queue-btn[data-queue="bluey-s1e02"]').click();
  expect(JSON.parse((await queued).postData())).toEqual({ video_id: 'bluey-s1e02' });
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
});

test('the play tile still drives the TV — ＋ Queue does not hijack the row', async ({ page }) => {
  const sent = [];
  await openSynced(page, sent);
  await page.locator('.tile-btn[data-id="bluey-s1e02"]').click();
  await expect.poll(() => sent.some(m =>
    m.type === 'intent' && m.payload.intent === 'play' && m.payload.params.id === 'bluey-s1e02')).toBe(true);
});
