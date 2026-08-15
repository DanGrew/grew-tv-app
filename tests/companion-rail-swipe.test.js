const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-411 — dragging the companion browse grid horizontally pages between a
// section's rails, mirroring what a pager dot/arrow does: the SAME navigate()/
// selectRail() path a chip tap always used (FEAT-017), just a third way to
// land on it. Films has two rails (Animation, Comedy — confirmed by
// companion-browse.test.js's dot/arrow coverage), which this drag exercises.

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

// A drag on the grid: down, a handful of intermediate moves (so the gesture
// reads as a drag, not a jump), then up. dx/dy are the total deltas.
async function dragGrid(page, dx, dy) {
  const box = await page.locator('#txtgrid').boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.min(box.height / 2, 20);
  await dragFrom(page, startX, startY, dx, dy);
}

// TASK-425 — same gesture, started below the last tile row (the enlarged
// empty zone within #grid-wrap, down to #section-dock) rather than on a tile.
async function dragBelowGrid(page, dx, dy) {
  const box = await page.locator('#grid-wrap').boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height - 10;
  await dragFrom(page, startX, startY, dx, dy);
}

async function dragFrom(page, startX, startY, dx, dy) {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const steps = 6;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(startX + (dx * i) / steps, startY + (dy * i) / steps);
  }
  await page.mouse.up();
}

let intents;

test.beforeEach(async ({ page }) => {
  intents = [];
  await installApi(page);
  await mockApp(page, intents);
  await page.goto('/companion/browse.html');
  await page.locator('.dock-tab[data-section="films"]').click();
  await expect(page.locator('#pager-name')).toHaveText('Animation');
});

test('a leftward drag past the swipe threshold pages to the next rail, over the same selectRail() path', async ({ page }) => {
  await dragGrid(page, -80, 0);
  await expect(page.locator('#pager-name')).toHaveText('Comedy');
  await expect(page.locator('#txtgrid .ph-txt')).toHaveText(['Toy Story']);
  expect(intents).toContainEqual(expect.objectContaining({ intent: 'navigate', params: { page: 'rail-grid.html', params: { section: 'films', rail: 'genre:comedy' } } }));
});

test('a rightward drag past the swipe threshold pages back to the previous rail', async ({ page }) => {
  await dragGrid(page, -80, 0);
  await expect(page.locator('#pager-name')).toHaveText('Comedy');
  await dragGrid(page, 80, 0);
  await expect(page.locator('#pager-name')).toHaveText('Animation');
});

test('a drag under the swipe threshold snaps back — no rail change, no fresh navigate', async ({ page }) => {
  const before = intents.length;
  await dragGrid(page, -15, 0);
  await expect(page.locator('#pager-name')).toHaveText('Animation');
  expect(intents.slice(before).filter((i) => i.intent === 'navigate')).toHaveLength(0);
});

test('a rightward drag at the first rail (nothing further to reach) does not page past it', async ({ page }) => {
  const before = intents.length;
  await dragGrid(page, 80, 0);
  await expect(page.locator('#pager-name')).toHaveText('Animation');
  expect(intents.slice(before).filter((i) => i.intent === 'navigate')).toHaveLength(0);
});

test('a predominantly-vertical drag does not page the rail (left for the grid\'s own scroll)', async ({ page }) => {
  const before = intents.length;
  await dragGrid(page, 10, 80);
  await expect(page.locator('#pager-name')).toHaveText('Animation');
  expect(intents.slice(before).filter((i) => i.intent === 'navigate')).toHaveLength(0);
});

// TASK-425 — Animation is a single-row rail (Toy Story, Finding Nemo), so
// #grid-wrap's flex-fill leaves empty space below the tiles, down to the dock.
test('a leftward drag started below the last tile row pages the rail exactly as a drag on a tile does', async ({ page }) => {
  await dragBelowGrid(page, -80, 0);
  await expect(page.locator('#pager-name')).toHaveText('Comedy');
  await expect(page.locator('#txtgrid .ph-txt')).toHaveText(['Toy Story']);
  expect(intents).toContainEqual(expect.objectContaining({ intent: 'navigate', params: { page: 'rail-grid.html', params: { section: 'films', rail: 'genre:comedy' } } }));
});

test('a tap in the enlarged empty area below the tiles is not a drag — no rail change, no tile opened', async ({ page }) => {
  const before = intents.length;
  const box = await page.locator('#grid-wrap').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('#pager-name')).toHaveText('Animation');
  expect(intents.slice(before)).toHaveLength(0);
});
