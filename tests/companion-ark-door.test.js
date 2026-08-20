const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-483 — mirrors tests/companion-atlas-door.test.js for the Ark destination.
// Tapping the door tile crosses BOTH surfaces in one action: the TV via a
// `launchExternal` intent (captured here off the WS) and this phone via its own
// navigation to remoteUrl. Config lives in core/external-destinations.js (shared
// with the TV) — the mirror invariant.
const ARK_HOST = /localhost:8095/;
const ARK_REMOTE_URL = /localhost:8095\/remote\.html/;

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockApp(page, intents) {
  return page.routeWebSocket(/:8766/, (ws) => {
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') { ws.send(msg('context', { version: 2, context_id: 'browse' })); ws.send(msg('app_state', { screen: 'home', profile: 'kids', person: 'kids' })); }
    });
  });
}

let intents;

test.beforeEach(async ({ page }) => {
  intents = [];
  await installApi(page);
  await mockApp(page, intents);
  await page.route(ARK_HOST, route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>ark remote</title>REMOTE'
  }));
  await page.goto('/companion/browse.html');
  await expect(page.locator('#section-dock .dock-tab').first()).toBeVisible();
});

test('Story 1 (mirror): an Ark door tile renders on the companion home', async ({ page }) => {
  await page.locator('#btn-status').click();
  await expect(page.locator('#door .door-tile[data-external="ark"]')).toHaveText('🐟 Ark');
});

test('Story 2: tapping the door sends launchExternal (crossing the TV) AND takes the phone to the ark remote', async ({ page }) => {
  await page.locator('#btn-status').click();
  await page.locator('#door .door-tile[data-external="ark"]').click();
  // TV half: a launchExternal intent carrying ONLY the ark TV url.
  await expect.poll(() => intents.filter(i => i.intent === 'launchExternal').length).toBeGreaterThan(0);
  const cross = intents.filter(i => i.intent === 'launchExternal').pop();
  expect(cross.params).toEqual({ tvUrl: 'http://localhost:8095/tank.html' });
  // Phone half: the companion walks itself to the ark remote.
  await page.waitForURL(ARK_REMOTE_URL);
});

test('Story 3: with the ark relay down, the door tile still renders and stays selectable', async ({ page }) => {
  await page.unroute(ARK_HOST);
  await page.route(ARK_HOST, route => route.abort('connectionrefused'));
  await page.locator('#btn-status').click();
  const tile = page.locator('#door .door-tile[data-external="ark"]');
  await expect(tile).toBeVisible();
  await expect(tile).toBeEnabled();
});
