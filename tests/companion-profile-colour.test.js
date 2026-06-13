const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-178 — the companion person-picker / landing page has its OWN screen
// chooser (predates the shared screen-bar). With >1 screen it lists each one to
// drive; those buttons must carry the same device_id-derived colour swatch as
// the TV + the content-page chooser, so you pick the right screen by colour.
// (Kept separate from companion-profile.test.js, which needs a single-screen
// take-over mock — this needs two screens for the picker to render.)

function msg(type, payload) { return JSON.stringify({ type, payload }); }

const DEVICES = [
  { device_id: 'tv-a', label: 'Living Room', active_person: null },
  { device_id: 'tv-b', label: 'Kitchen', active_person: null }
];

function mockTwoScreens(page) {
  return page.routeWebSocket(/:8766/, (ws) => {
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: DEVICES }));
    });
  });
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test('the picker screen list carries each screen colour swatch (TASK-178)', async ({ page }) => {
  await mockTwoScreens(page);
  await page.goto('/companion/profile.html');

  await expect(page.locator('#screen-bar .screen-btn')).toHaveCount(2);
  // device_id → deterministic palette colour: tv-a #42a5f5, tv-b #ffee58.
  await expect(page.locator('#screen-bar .screen-btn[data-id="tv-a"] .screen-swatch'))
    .toHaveCSS('background-color', 'rgb(66, 165, 245)');
  await expect(page.locator('#screen-bar .screen-btn[data-id="tv-b"] .screen-swatch'))
    .toHaveCSS('background-color', 'rgb(255, 238, 88)');
  // label still shown alongside the swatch.
  await expect(page.locator('#screen-bar .screen-btn[data-id="tv-a"]')).toContainText('Living Room');
});
