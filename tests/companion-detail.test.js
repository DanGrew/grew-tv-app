const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-123 — companion season selector. The companion mirrors the app's detail
// screen: with a seasons[] series it shows a season chip row that filters the
// episode list; without one it stays a flat list. The app side of the WS is
// stubbed (as in companion-breadcrumb) so the companion captures the series
// context and fetches the catalog over HTTP.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

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

async function openSeasons(page) {
  await installApi(page);
  await mockApp(page, {
    context: { context_id: 'detail', series_id: 'inbetweeners' },
    appState: { screen: 'detail', itemId: 'inbetweeners', profile: 'kids' }
  });
  await page.goto('/companion/detail.html');
  await expect(page.locator('.season-chip').first()).toBeVisible();
}

test('companion renders a chip per declared season', async ({ page }) => {
  await openSeasons(page);
  await expect(page.locator('.season-chip')).toHaveText(['Season 1', 'Season 2']);
});

test('companion default season is active and filters the episode list', async ({ page }) => {
  await openSeasons(page);
  await expect(page.locator('.season-chip[data-season="1"]')).toHaveClass(/active/);
  await expect(page.locator('.tile-btn')).toHaveCount(2);
  await expect(page.locator('.tile-btn[data-id="ib-s1e1"]')).toBeVisible();
  await expect(page.locator('.tile-btn[data-id="ib-s2e1"]')).toHaveCount(0);
});

test('tapping a season chip re-filters the list', async ({ page }) => {
  await openSeasons(page);
  await page.locator('.season-chip[data-season="2"]').click();
  await expect(page.locator('.season-chip[data-season="2"]')).toHaveClass(/active/);
  await expect(page.locator('.tile-btn')).toHaveCount(1);
  await expect(page.locator('.tile-btn[data-id="ib-s2e1"]')).toBeVisible();
});

test('a seasons-less series shows no chips (flat list)', async ({ page }) => {
  await installApi(page);
  await mockApp(page, {
    context: { context_id: 'detail', series_id: 'bluey' },
    appState: { screen: 'detail', itemId: 'bluey', profile: 'kids' }
  });
  await page.goto('/companion/detail.html');
  await expect(page.locator('.tile-btn').first()).toBeVisible();
  await expect(page.locator('.season-chip')).toHaveCount(0);
  await expect(page.locator('.tile-btn')).toHaveCount(3);
});
