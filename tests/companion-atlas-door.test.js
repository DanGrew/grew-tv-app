const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-330 — the companion mirror of the external-destination door (Atlas). A
// dedicated `#door` on the companion home carries one `.door-tile` per configured
// destination. Tapping it crosses BOTH surfaces in one action: the TV via a
// `launchExternal` intent (captured here off the WS) and this phone via its own
// navigation to remoteUrl. Config lives in core/external-destinations.js (shared
// with the TV) — the mirror invariant.
//
// The atlas host is stubbed so the phone's cross navigation lands on a controllable
// page instead of the real (possibly-down) LAN atlas.
const ATLAS_HOST = /192\.168\.1\.242:8090/;
const ATLAS_REMOTE_URL = /192\.168\.1\.242:8090\/app\/remote\.html/;

function msg(type, payload) { return JSON.stringify({ type, payload }); }

// Records every intent the companion emits (for wire assertions) and answers the
// device/person handshake so the companion binds to the sole TV.
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
  await page.route(ATLAS_HOST, route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>atlas remote</title>REMOTE'
  }));
  await page.goto('/companion/browse.html');
  await expect(page.locator('#sections-row .chip').first()).toBeVisible();
});

test('Story 1 (mirror): an Atlas door tile renders on the companion home', async ({ page }) => {
  await expect(page.locator('#door .door-tile[data-external="atlas"]')).toHaveText('🗺️ Atlas');
});

test('Story 2: tapping the door sends launchExternal (crossing the TV) AND takes the phone to the atlas remote', async ({ page }) => {
  await page.locator('#door .door-tile[data-external="atlas"]').click();
  // TV half: a launchExternal intent carrying ONLY the atlas TV url.
  await expect.poll(() => intents.filter(i => i.intent === 'launchExternal').length).toBeGreaterThan(0);
  const cross = intents.find(i => i.intent === 'launchExternal');
  expect(cross.params).toEqual({ tvUrl: 'http://192.168.1.242:8090/app/tv.html' });
  // Phone half: the companion walks itself to the atlas remote.
  await page.waitForURL(ATLAS_REMOTE_URL);
});
