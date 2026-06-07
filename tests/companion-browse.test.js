const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-020 / TASK-139 — the companion mirrors the app's content-type browse:
// a tab strip (Continue / Series / Films / Home Movies) whose selection swaps
// in that type's rails (genre rails for Series/Films, person rails for Home
// Movies), reusing the shared core/home-rails helpers. Search still spans the
// full catalog as a flat grid. The app side is mocked over the WS; the catalog
// itself is backend state from /api/browse (installApi fixtures).

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockApp(page, appState) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function push() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: 'browse' }));
      ws.send(msg('app_state', appState));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'snapshot_request') push();
    });
  });
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await mockApp(page, { screen: 'home', profile: 'kids' });
  await page.goto('/companion/browse.html');
  await expect(page.locator('.c-tab')).toHaveText(['Series', 'Films', 'Home Movies']);
});

test('lands on the Series tab with its genre rails', async ({ page }) => {
  await expect(page.locator('.c-tab[data-tab="series"]')).toHaveClass(/active/);
  await expect(page.locator('#rails .section-title')).toHaveText(['Animation']);
  await expect(page.locator('.c-rail-row[data-rail="genre:animation"] .tile-btn[data-id="bluey"]')).toHaveCount(1);
});

test('selecting the Films tab swaps in genre rails (A-Z), a film in each genre', async ({ page }) => {
  await page.locator('.c-tab[data-tab="films"]').click();
  await expect(page.locator('.c-tab[data-tab="films"]')).toHaveClass(/active/);
  await expect(page.locator('#rails .section-title')).toHaveText(['Animation', 'Comedy']);
  await expect(page.locator('.c-rail-row[data-rail="genre:animation"] .tile-btn')).toHaveCount(2);
  await expect(page.locator('.c-rail-row[data-rail="genre:comedy"] .tile-btn[data-id="toy-story-main"]')).toHaveCount(1);
});

test('Home Movies tab shows person rails', async ({ page }) => {
  await page.locator('.c-tab[data-tab="home-movies"]').click();
  await expect(page.locator('#rails .section-title')).toHaveText(['Millie']);
  await expect(page.locator('.c-rail-row[data-rail="person:millie"] .tile-btn[data-id="millie-walk"]')).toHaveCount(1);
});

test('search takes over with a flat grid across the catalog, then restores rails', async ({ page }) => {
  await page.locator('#search').fill('toy');
  await expect(page.locator('#search-section')).toBeVisible();
  await expect(page.locator('#rails-section')).toBeHidden();
  await expect(page.locator('#grid .tile-btn[data-id="toy-story-main"]')).toHaveCount(1);
  await expect(page.locator('#grid .tile-btn')).toHaveCount(1);
  await page.locator('#search').fill('');
  await expect(page.locator('#rails-section')).toBeVisible();
  await expect(page.locator('#search-section')).toBeHidden();
});

test('Continue tab leads when a video is mid-watch', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [
      { item_id: 'finding-nemo-main', position_secs: 1200, duration_secs: 6000, last_watched: '2026-06-05T00:00:00Z' }
    ] })
  }));
  await page.reload();
  await expect(page.locator('.c-tab')).toHaveText(['Continue Watching', 'Series', 'Films', 'Home Movies']);
  await expect(page.locator('.c-tab[data-tab="continue"]')).toHaveClass(/active/);
  await expect(page.locator('.c-rail-row[data-rail="continue"] .tile-btn[data-id="finding-nemo-main"]')).toHaveCount(1);
});
