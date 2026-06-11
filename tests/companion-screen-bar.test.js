const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-179 (FEAT-026 device plane) — the persistent screen chooser on the
// companion content pages. With >1 screen and none chosen the page shows the
// chooser, not a blank grid (BUG-013); picking a screen re-targets via
// register_companion + snapshot_request (A1) and re-syncs; re-targeting another
// screen is a device-plane MOVE that emits no person-plane traffic, so the first
// app keeps running (A3).

function msg(type, payload) { return JSON.stringify({ type, payload }); }

const DEVICES = [
  { device_id: 'tv-a', label: 'Living Room', active_person: null },
  { device_id: 'tv-b', label: 'Kitchen', active_person: null }
];

// Two-screen mock app. Unlike the single-screen companion fixtures it answers
// list_devices with TWO screens, so the companion does NOT auto-target — it must
// surface the chooser. State is pushed only for the screen the companion
// registers against (per-device routing), on each snapshot_request. `received`
// collects every frame type the companion sends, for wire assertions.
function mockApp(page, received) {
  let version = 1;
  let target = null;
  return page.routeWebSocket(/:8766/, (ws) => {
    function pushFor() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: 'browse' }));
      ws.send(msg('app_state', { screen: 'home', profile: 'kids', person: 'millie' }));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      received.push(m);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: DEVICES }));
      if (m.type === 'register_companion') target = m.payload.device_id;
      if (m.type === 'snapshot_request') pushFor(target);
    });
  });
}

function types(received) { return received.map(function(m) { return m.type; }); }

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test('>1 screen, none chosen → renders the chooser, not an empty grid (BUG-013)', async ({ page }) => {
  const received = [];
  await mockApp(page, received);
  await page.goto('/companion/browse.html');

  // The chooser is shown with both screens to pick from...
  await expect(page.locator('#screen-bar')).toContainText('Pick a screen');
  await expect(page.locator('#screen-bar .screen-btn')).toHaveCount(2);
  await expect(page.locator('#screen-bar .screen-btn[data-id="tv-a"]')).toHaveText('Living Room');
  // ...and the (would-be empty) browse content is suppressed — no blank grid.
  await expect(page.locator('.c-tab')).toHaveCount(0);
  await expect(page.locator('#search')).toBeHidden();
  // Never auto-registered against either screen.
  expect(types(received)).not.toContain('register_companion');
});

test('picking a screen re-targets (register_companion + snapshot_request) and renders its state', async ({ page }) => {
  const received = [];
  await mockApp(page, received);
  await page.goto('/companion/browse.html');
  await expect(page.locator('#screen-bar .screen-btn')).toHaveCount(2);

  await page.locator('#screen-bar .screen-btn[data-id="tv-a"]').click();

  // Re-target hit the wire: register_companion for the chosen screen + snapshot.
  await expect.poll(() => types(received)).toContain('register_companion');
  const reg = received.find(function(m) { return m.type === 'register_companion'; });
  expect(reg.payload.device_id).toBe('tv-a');
  expect(types(received)).toContain('snapshot_request');

  // The screen's pushed state renders the browse content.
  await expect(page.locator('.c-tab')).toHaveText(['Series', 'Films', 'Home Movies']);
  await expect(page.locator('#search')).toBeVisible();
  // The bar collapses to a current-screen pill naming the bound screen.
  await expect(page.locator('#screen-bar .screen-current')).toContainText('Living Room');
});

test('re-targeting another screen is a device-plane MOVE — no activate_person / setProfile (A3)', async ({ page }) => {
  const received = [];
  await mockApp(page, received);
  await page.goto('/companion/browse.html');
  await page.locator('#screen-bar .screen-btn[data-id="tv-a"]').click();
  await expect(page.locator('.c-tab').first()).toBeVisible();

  received.length = 0;
  // Open the chooser pill and hop to the other screen.
  await page.locator('#screen-bar .screen-current').click();
  await page.locator('#screen-bar .screen-btn[data-id="tv-b"]').click();

  await expect.poll(() => types(received)).toContain('register_companion');
  const reg = received.find(function(m) { return m.type === 'register_companion'; });
  expect(reg.payload.device_id).toBe('tv-b');
  // The move emits ONLY register_companion + snapshot_request — no person plane.
  expect(types(received)).not.toContain('activate_person');
  expect(types(received)).not.toContain('intent');
  await expect(page.locator('#screen-bar .screen-current')).toContainText('Kitchen');
});
