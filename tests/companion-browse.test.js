const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-028 / TASK-168 — the companion drill-down browse (replaces the flat
// FEAT-020/TASK-139 tab+rails+search). The companion walks four levels —
// Sections -> Rails -> Grid -> Item — one at a time, driving the TV: each tap
// emits the existing FEAT-017 `navigate`/`select` intent (no new protocol) and
// optimistically renders locally. Chips are the breadcrumb (sideways jump = tap a
// different chip; Back collapses one level). The L3 grid is text-only — zero
// posters. The app side is mocked over the WS; the catalog is backend state from
// /api/browse (installApi fixtures).

function msg(type, payload) { return JSON.stringify({ type, payload }); }

// Single-screen mock app. Records every intent the companion emits (for wire
// assertions), auto-targets the sole screen, and echoes context: `navigate`
// swaps to the target page's context (browse/rail-grid stay on the drill page —
// the companion drives its own optimistic view), and `select` echoes the item's
// detail context so the companion follows to L4.
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
      if (m.type === 'intent' && m.payload.intent === 'select') push('detail');
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
  await expect(page.locator('#sections-row .chip')).toHaveText(['Series', 'Films', 'Home Movies']);
});

test('L1 shows section chips from the server sections — no rails/grid/Back yet', async ({ page }) => {
  await expect(page.locator('#rails-wrap')).toBeHidden();
  await expect(page.locator('#grid-wrap')).toBeHidden();
  await expect(page.locator('#btn-back')).toBeHidden();
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Home');
});

test('L1→L2: tapping a section opens its rail chips + emits a navigate intent', async ({ page }) => {
  await page.locator('.chip[data-section="series"]').click();
  await expect(page.locator('.chip[data-section="series"]')).toHaveClass(/active/);
  await expect(page.locator('#rails-wrap')).toBeVisible();
  await expect(page.locator('#rails-row .chip[data-rail="genre:animation"]')).toHaveText('Animation');
  await expect(page.locator('#grid-wrap')).toBeHidden();
  await expect(page.locator('#btn-back')).toBeVisible();
  expect(intents).toContainEqual(expect.objectContaining({ intent: 'navigate', params: { page: 'browse.html', params: { tab: 'series' } } }));
});

test('L2→L3: tapping a rail shows bare text tiles (no posters) + emits an open-grid navigate', async ({ page }) => {
  await page.locator('.chip[data-section="series"]').click();
  await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"] .nm')).toHaveText('Bluey');
  // Text-only: the L3 grid renders zero images.
  await expect(page.locator('#txtgrid img')).toHaveCount(0);
  expect(intents).toContainEqual(expect.objectContaining({ intent: 'navigate', params: { page: 'rail-grid.html', params: { section: 'series', rail: 'genre:animation' } } }));
});

test('L3→L4: tapping a tile emits `select` and follows the echoed context to the item screen', async ({ page }) => {
  await page.locator('.chip[data-section="series"]').click();
  await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
  await page.locator('#txtgrid .ph-txt[data-id="bluey"]').click();
  await expect.poll(() => intents.map(function(i) { return i.intent; })).toContain('select');
  const sel = intents.find(function(i) { return i.intent === 'select'; });
  expect(sel.params).toEqual({ id: 'bluey' });
  await page.waitForURL('**/companion/detail.html');
});

test('chip sideways-jump: a different SECTION chip swaps rails without Back', async ({ page }) => {
  await page.locator('.chip[data-section="series"]').click();
  await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await page.locator('.chip[data-section="films"]').click();
  await expect(page.locator('.chip[data-section="films"]')).toHaveClass(/active/);
  await expect(page.locator('#rails-row .chip')).toHaveText(['Animation', 'Comedy']);
  await expect(page.locator('#grid-wrap')).toBeHidden();
});

test('chip sideways-jump: a different RAIL chip swaps the grid + emits a fresh open-grid', async ({ page }) => {
  await page.locator('.chip[data-section="films"]').click();
  await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
  await expect(page.locator('#txtgrid .ph-txt[data-id="toy-story-main"]')).toBeVisible();
  await page.locator('#rails-row .chip[data-rail="genre:comedy"]').click();
  await expect(page.locator('#txtgrid .ph-txt')).toHaveText(['Toy Story']);
  await expect(page.locator('.chip[data-rail="genre:comedy"]')).toHaveClass(/active/);
  const opens = intents.filter(function(i) { return i.intent === 'navigate' && i.params.page === 'rail-grid.html'; });
  expect(opens).toHaveLength(2);
});

test('Back collapses exactly one level: grid → rails → sections', async ({ page }) => {
  await page.locator('.chip[data-section="series"]').click();
  await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await page.locator('#btn-back').click();
  await expect(page.locator('#grid-wrap')).toBeHidden();
  await expect(page.locator('#rails-wrap')).toBeVisible();
  await expect(page.locator('#btn-back')).toBeVisible();
  await page.locator('#btn-back').click();
  await expect(page.locator('#rails-wrap')).toBeHidden();
  await expect(page.locator('#btn-back')).toBeHidden();
  await expect(page.locator('#sections-row .chip')).toHaveText(['Series', 'Films', 'Home Movies']);
});

test('reuses the FEAT-021 breadcrumb — trail builds Home › Section › Rail as you drill', async ({ page }) => {
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Home');
  await page.locator('.chip[data-section="films"]').click();
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Films');
  await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Films']);
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Animation');
});

test('filter narrows the current level (rail chips here), then restores', async ({ page }) => {
  await page.locator('.chip[data-section="films"]').click();
  await expect(page.locator('#rails-row .chip')).toHaveText(['Animation', 'Comedy']);
  await page.locator('#search').fill('com');
  await expect(page.locator('#rails-row .chip')).toHaveText(['Comedy']);
  await page.locator('#search').fill('');
  await expect(page.locator('#rails-row .chip')).toHaveText(['Animation', 'Comedy']);
});

test('Switch profile drives the picker — navigate intent echoes a profile context, companion follows (BUG-007)', async ({ page }) => {
  await page.locator('#switch-profile').click();
  await expect(page).toHaveURL(/companion\/profile\.html$/);
});

test('an in-progress section leads with a Continue rail; its grid tile shows the resume hint (TASK-150)', async ({ page }) => {
  await page.route('**/api/continue-watching**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', content: [
        { item_id: 'bluey-s1e01', title: 'Daddy Putdown', poster: 'bluey.jpg', position_secs: 200, duration_secs: 420, last_watched: '2026-06-06T00:00:00Z', collection_id: 'bluey', collection_title: 'Bluey' }
      ] })
    });
  });
  await page.reload();
  await expect(page.locator('.chip[data-section="series"]')).toBeVisible();
  await page.locator('.chip[data-section="series"]').click();
  await expect(page.locator('#rails-row .chip[data-rail="continue"]')).toHaveText('Continue Watching');
  await page.locator('#rails-row .chip[data-rail="continue"]').click();
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey-s1e01"] .nm')).toHaveText('Bluey · Daddy Putdown');
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey-s1e01"]')).toHaveClass(/prog/);
});
