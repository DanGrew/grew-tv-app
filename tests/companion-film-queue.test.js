const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-040 (TASK-250) — film ＋ Queue gap. A standalone film has no episode-row
// list (series get ＋ Queue per row in TASK-249), so the companion browse GRID
// film tile gains its own ＋ Queue control: it POSTs queue-item per person to
// the TASK-498 unified queue engine (/api/queue/film — TASK-503; the old
// video-playback engine's queue-video is never read by a film once queued
// there). Per-person POST ⇒ works in both modes; series/album tiles do NOT get
// the control (they route to their own pages / queue per episode).

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockApp(page) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function push(contextId) {
      version += 1;
      ws.send(msg('context', { version: version, context_id: contextId }));
      ws.send(msg('app_state', { screen: 'home', profile: 'kids', person: 'mom' }));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') push('browse');
      if (m.type === 'intent' && m.payload.intent === 'select') push('detail');
    });
  });
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await mockApp(page);
  await page.route('**/api/queue/film/queue-item**',
    route => route.fulfill({ status: 204, body: '' }));
  await page.goto('/companion/browse.html');
  await expect(page.locator('#section-dock .dock-tab-label')).toHaveText(['TV Series', 'Films', 'Home Movies']);
});

async function openFilmsGrid(page) {
  await page.locator('.dock-tab[data-section="films"]').click();
  await expect(page.locator('#txtgrid .ph-txt[data-id="toy-story-main"]')).toBeVisible();
}

test('a film grid tile carries a ＋ Queue control', async ({ page }) => {
  await openFilmsGrid(page);
  await expect(page.locator('.ph-txt-cell .ph-cell-queue[data-queue="toy-story-main"]')).toHaveText('＋');
});

test('＋ Queue POSTs queue-item to the film engine for the active person and confirms with a toast', async ({ page }) => {
  await openFilmsGrid(page);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/queue-item') && req.method() === 'POST');
  await page.locator('.ph-cell-queue[data-queue="toy-story-main"]').click();
  const req = await queued;
  expect(req.url()).toContain('person=mom');
  expect(JSON.parse(req.postData())).toEqual({ item_id: 'toy-story-main' });
  // TASK-516 — the confirmation is now the media type's own wording from
  // core/queue-shell-config.js. A film is APPENDED to the unified queue, so
  // "Added to Queue"; a music video still means play-next, and still says so.
  await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
});

test('the film play tile still opens — ＋ Queue does not hijack it', async ({ page }) => {
  await openFilmsGrid(page);
  await page.locator('.ph-txt[data-id="toy-story-main"]').click();
  await expect(page).toHaveURL(/detail\.html/, { timeout: 10000 });
});

test('series tiles get NO ＋ Queue control (they queue per episode on the detail page)', async ({ page }) => {
  await page.locator('.dock-tab[data-section="series"]').click();
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"]')).toBeVisible();
  await expect(page.locator('.ph-cell-queue')).toHaveCount(0);
});
