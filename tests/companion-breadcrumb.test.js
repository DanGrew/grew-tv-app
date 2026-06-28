const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-141 — companion breadcrumb. The companion is the PRIMARY remote: a crumb
// tap sends a `navigate` intent and the app (here a mock) teleports the TV and
// echoes its new context, which the companion screen follows. These tests stub
// the app side of the WebSocket and assert the trail renders and each crumb
// drives the companion to the right ancestor page.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

const PAGE_TO_CONTEXT = {
  'browse.html': () => ({ context_id: 'browse' }),
  'detail.html': (params) => ({ context_id: 'detail', series_id: params.series })
};

// Mock app over ws://...:8766. Pushes `initial` context (+ optional app_state) on
// the companion's snapshot_request, and on a `navigate` intent swaps to the
// target page's context and pushes again. State is shared across reconnects so
// the post-navigation page re-syncs to the ancestor.
function mockApp(page, initial) {
  let version = 1;
  let ctx = initial;
  return page.routeWebSocket(/:8766/, (ws) => {
    function push() {
      version += 1;
      ws.send(msg('context', Object.assign({ version: version }, ctx.context)));
      if (ctx.appState) ws.send(msg('app_state', ctx.appState));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      // TASK-158: the companion lists screens, auto-targets the sole one, then snapshots.
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') push();
      if (m.type === 'intent' && m.payload.intent === 'navigate') {
        const params = m.payload.params;
        ctx = { context: PAGE_TO_CONTEXT[params.page](params.params), appState: null };
        push();
      }
    });
  });
}

test('browse shows a single non-clickable Home crumb', async ({ page }) => {
  await installApi(page);
  await mockApp(page, { context: { context_id: 'browse' }, appState: { screen: 'home', profile: 'kids' } });
  await page.goto('/companion/browse.html');
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveCount(0);
  // Guards the drill-down catalog render path (FEAT-028 / TASK-168: L1 is a row
  // of server-driven section chips, not a content-type tab strip).
  await expect(page.locator('#sections-row .chip')).toHaveText(['TV Series', 'Films', 'Home Movies']);
});

test('detail shows Home (clickable) then the series as current', async ({ page }) => {
  await installApi(page);
  await mockApp(page, { context: { context_id: 'detail', series_id: 'bluey' }, appState: { screen: 'detail', itemId: 'bluey', profile: 'kids' } });
  await page.goto('/companion/detail.html');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Bluey');
});

test('tapping the Home crumb on detail drives the companion to browse', async ({ page }) => {
  await installApi(page);
  await mockApp(page, { context: { context_id: 'detail', series_id: 'bluey' }, appState: { screen: 'detail', itemId: 'bluey', profile: 'kids' } });
  await page.goto('/companion/detail.html');
  await page.locator('#breadcrumb .crumb-link').click();
  await page.waitForURL('**/companion/browse.html');
  await expect(page.locator('#search')).toBeVisible();
});

test('series episode shows Home > Series > Episode trail', async ({ page }) => {
  await installApi(page);
  await mockApp(page, {
    context: { context_id: 'video', display: { id: 'bluey-s1e03', title: 'Hammerbarn' } },
    appState: { screen: 'player', itemId: 'bluey', episodeId: 'bluey-s1e03', profile: 'kids', durationSec: 440, positionSec: 0, playing: true }
  });
  await page.goto('/companion/video.html');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Bluey']);
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Hammerbarn');
});

test('tapping the series crumb on the player drives the companion to detail', async ({ page }) => {
  await installApi(page);
  await mockApp(page, {
    context: { context_id: 'video', display: { id: 'bluey-s1e03', title: 'Hammerbarn' } },
    appState: { screen: 'player', itemId: 'bluey', episodeId: 'bluey-s1e03', profile: 'kids', durationSec: 440, positionSec: 0, playing: true }
  });
  await page.goto('/companion/video.html');
  await page.locator('#breadcrumb .crumb-link', { hasText: 'Bluey' }).click();
  await page.waitForURL('**/companion/detail.html');
});

test('a film player shows Home > Title and Home drives the companion to browse', async ({ page }) => {
  await installApi(page);
  await mockApp(page, {
    context: { context_id: 'video', display: { id: 'toy-story-main', title: 'Toy Story' } },
    appState: { screen: 'player', itemId: 'toy-story-main', episodeId: 'toy-story-main', profile: 'kids', durationSec: 4860, positionSec: 0, playing: true }
  });
  await page.goto('/companion/video.html');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Toy Story');
  await page.locator('#breadcrumb .crumb-link').click();
  await page.waitForURL('**/companion/browse.html');
});
