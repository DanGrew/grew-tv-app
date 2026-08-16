const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-412 — Screen picker, Sync Mode, Switch Profile and the Atlas door
// consolidate into one popout menu off a single header icon (#btn-status),
// replacing the four previously-stacked rows. The menu opens/closes ONLY via
// that icon — never on an outside tap — so the rest of the drill stays fully
// usable underneath it while the menu stays open (Stories 1-3). The menu's
// contents (Mode/Screen/Profile/Atlas) are the pre-existing mounts, relocated —
// their own behaviour is covered by companion-browse/-screen-bar/-atlas-door.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockApp(page, intents) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function push(contextId) {
      version += 1;
      ws.send(msg('context', { version: version, context_id: contextId }));
      ws.send(msg('app_state', { screen: 'home', profile: 'kids' }));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') push('browse');
      if (m.type === 'intent' && m.payload.intent === 'navigate') push(m.payload.params.page.replace('.html', ''));
    });
  });
}

let intents;

test.beforeEach(async ({ page }) => {
  intents = [];
  await installApi(page);
  await mockApp(page, intents);
  await page.goto('/companion/browse.html');
  await expect(page.locator('#section-dock .dock-tab-label')).toHaveText(['TV Series', 'Films', 'Home Movies']);
});

test('Story 1: the menu is closed by default; tapping the header icon opens it listing Mode/Screen/Profile/Atlas', async ({ page }) => {
  await expect(page.locator('#status-menu')).not.toHaveClass(/open/);
  await page.locator('#btn-status').click();
  await expect(page.locator('#status-menu')).toHaveClass(/open/);
  await expect(page.locator('#status-menu #sync-bar .seg-opt')).toHaveCount(2);
  await expect(page.locator('#status-menu #screen-bar')).toBeVisible();
  await expect(page.locator('#status-menu #switch-profile')).toHaveText('👤 Switch profile');
  await expect(page.locator('#status-menu #door .door-tile[data-external="atlas"]')).toHaveText('🗺️ Atlas');
  // The Mode pills stretch to fill the row's width, unlike a content-sized pill.
  const segWidth = await page.locator('#sync-bar .seg').evaluate((el) => el.getBoundingClientRect().width);
  const rowWidth = await page.locator('#sync-bar').evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.abs(segWidth - rowWidth)).toBeLessThan(1);
});

test('Story 2: tapping elsewhere — a section dock tab, a pager dot — does not close the menu, and the drill underneath stays usable', async ({ page }) => {
  await page.locator('#btn-status').click();
  await page.locator('.dock-tab[data-section="films"]').click();
  await expect(page.locator('#status-menu')).toHaveClass(/open/);
  await page.locator('#pager-dots .pager-dot[data-rail="genre:comedy"]').click();
  await expect(page.locator('#status-menu')).toHaveClass(/open/);
  // The drill actually advanced underneath the still-open menu.
  await expect(page.locator('#txtgrid .ph-txt')).toHaveText(['Toy Story']);
});

test('Story 3: tapping the header icon again is the only thing that closes it', async ({ page }) => {
  await page.locator('#btn-status').click();
  await expect(page.locator('#status-menu')).toHaveClass(/open/);
  await page.locator('#btn-status').click();
  await expect(page.locator('#status-menu')).not.toHaveClass(/open/);
});

// Search + the menu icon sit at the very top — directly below the connection
// status line, above the queue quick-play buttons — and the open menu renders
// entirely below the icon row, never overlapping it.
test('Search and the menu icon sit above everything else, below the connection status; the open menu never overlaps them', async ({ page }) => {
  const order = await page.evaluate(() =>
    Array.from(document.body.children).map((el) => el.id));
  expect(order.indexOf('conn-status')).toBeLessThan(order.indexOf('topbar-actions'));
  expect(order.indexOf('topbar-actions')).toBeLessThan(order.indexOf('queue-actions'));

  await page.locator('#btn-status').click();
  const iconBox = await page.locator('#btn-status').boundingBox();
  const menuBox = await page.locator('#status-menu').boundingBox();
  expect(menuBox.y).toBeGreaterThanOrEqual(iconBox.y + iconBox.height);
});
