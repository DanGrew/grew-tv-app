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
    function push(contextId) {
      version += 1;
      ws.send(msg('context', { version: version, context_id: contextId }));
      ws.send(msg('app_state', appState));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'snapshot_request') push('browse');
      // BUG-007: the app turns a `navigate` intent into a teleport and echoes the
      // target screen's context back — mirror that so the companion follows.
      if (m.type === 'intent' && m.payload.intent === 'navigate') push(m.payload.params.page.replace('.html', ''));
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

test('builds each poster exactly once — no double-render request storm', async ({ page }) => {
  // Regression: loadCatalog used to call renderTabs() from BOTH the browse and
  // the continue-watching callbacks, tearing down and rebuilding every <img>
  // twice. The aborted-then-recreated requests left posters intermittently
  // failed. Now it renders once after both settle. Delaying continue-watching
  // separates the two would-be renders in time so the second render's request
  // can't coalesce with the first — old code => 2 hits, single render => 1.
  let hits = 0;
  await page.route('**/media/bluey.jpg', function(route) {
    hits += 1;
    return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'Cache-Control': 'no-store' }, body: '' });
  });
  await page.route('**/api/continue-watching**', async function(route) {
    await new Promise(function(r) { setTimeout(r, 400); });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: 'kids', content: [] }) });
  });
  await page.reload();
  await expect(page.locator('.c-rail-row[data-rail="genre:animation"] .tile-btn[data-id="bluey"]')).toHaveCount(1);
  await page.waitForTimeout(700);
  expect(hits).toBe(1);
});

test('a poster that fails to load is hidden, not left as a broken image', async ({ page }) => {
  await page.route('**/media/bluey.jpg', function(route) { return route.abort(); });
  await page.reload();
  var img = page.locator('.c-rail-row[data-rail="genre:animation"] .tile-btn[data-id="bluey"] img');
  await expect(img).toHaveCSS('display', 'none');
});

test('Switch profile drives the picker — navigate intent echoes a profile context, companion follows (BUG-007)', async ({ page }) => {
  await expect(page.locator('#switch-profile')).toBeVisible();
  await page.locator('#switch-profile').click();
  await expect(page).toHaveURL(/companion\/profile\.html$/);
});

test('each tab leads with a Continue Watching rail of its in-progress items (TASK-150)', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [
      { item_id: 'bluey-s1e01', title: 'Daddy Putdown', poster: 'bluey.jpg', position_secs: 200, duration_secs: 420, last_watched: '2026-06-06T00:00:00Z', format: 'tv-series', collection_id: 'bluey', collection_title: 'Bluey' },
      { item_id: 'finding-nemo-main', title: 'Finding Nemo', poster: 'nemo.jpg', position_secs: 1200, duration_secs: 6000, last_watched: '2026-06-05T00:00:00Z', format: 'film', collection_id: null, collection_title: null }
    ] })
  }));
  await page.reload();
  // No standalone Continue tab — it is a rail inside each tab.
  await expect(page.locator('.c-tab')).toHaveText(['Series', 'Films', 'Home Movies']);
  await expect(page.locator('.c-tab[data-tab="continue"]')).toHaveCount(0);
  // Series tab (default) leads with a Continue Watching rail showing the episode.
  await expect(page.locator('#rails .section-title').first()).toHaveText('Continue Watching');
  await expect(page.locator('.c-rail-row[data-rail="continue"] .tile-btn[data-id="bluey-s1e01"]')).toHaveText('Bluey · Daddy Putdown');
  // Films tab leads with its own Continue Watching rail (the film).
  await page.locator('.c-tab[data-tab="films"]').click();
  await expect(page.locator('.c-rail-row[data-rail="continue"] .tile-btn[data-id="finding-nemo-main"]')).toHaveCount(1);
});
