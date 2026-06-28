const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-123 — companion season selector. The companion mirrors the app's detail
// screen: with a seasons[] series it shows a season chip row that filters the
// episode list; without one it stays a flat list. The app side of the WS is
// stubbed (as in companion-breadcrumb) so the companion captures the series
// context and fetches the catalog over HTTP.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockApp(page, ctx) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function push() {
      version += 1;
      ws.send(msg('context', Object.assign({ version: version }, ctx.context)));
      ws.send(msg('app_state', ctx.appState));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') push();
    });
  });
}

async function openSeasons(page) {
  await installApi(page);
  await mockApp(page, {
    context: { context_id: 'detail', series_id: 'inbetweeners' },
    appState: { screen: 'detail', itemId: 'inbetweeners', profile: 'kids' }
  });
  await page.goto('/companion/detail.html');
  await expect(page.locator('.season-chip').first()).toBeVisible();
}

test('companion renders a chip per declared season', async ({ page }) => {
  await openSeasons(page);
  await expect(page.locator('.season-chip')).toHaveText(['Season 1', 'Season 2']);
});

test('companion default season is active and filters the episode list', async ({ page }) => {
  await openSeasons(page);
  await expect(page.locator('.season-chip[data-season="1"]')).toHaveClass(/active/);
  await expect(page.locator('.tile-btn')).toHaveCount(2);
  await expect(page.locator('.tile-btn[data-id="ib-s1e1"]')).toBeVisible();
  await expect(page.locator('.tile-btn[data-id="ib-s2e1"]')).toHaveCount(0);
});

test('tapping a season chip re-filters the list', async ({ page }) => {
  await openSeasons(page);
  await page.locator('.season-chip[data-season="2"]').click();
  await expect(page.locator('.season-chip[data-season="2"]')).toHaveClass(/active/);
  await expect(page.locator('.tile-btn')).toHaveCount(1);
  await expect(page.locator('.tile-btn[data-id="ib-s2e1"]')).toBeVisible();
});

test('a seasons-less series shows no chips (flat list)', async ({ page }) => {
  await installApi(page);
  await mockApp(page, {
    context: { context_id: 'detail', series_id: 'bluey' },
    appState: { screen: 'detail', itemId: 'bluey', profile: 'kids' }
  });
  await page.goto('/companion/detail.html');
  await expect(page.locator('.tile-btn').first()).toBeVisible();
  await expect(page.locator('.season-chip')).toHaveCount(0);
  await expect(page.locator('.tile-btn')).toHaveCount(3);
});

// FEAT-032 (TASK-218): when an album was opened from an artist's albums page, the
// nav trail's top is that artist entry, so Back returns there (not the default
// browse). A series, or an album reached straight from a rail, has no artist top
// and keeps the existing `back` intent.
function mockAppRec(page, ctx, intents) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function push() {
      version += 1;
      ws.send(msg('context', Object.assign({ version: version }, ctx.context)));
      ws.send(msg('app_state', ctx.appState));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') push();
    });
  });
}

test('FEAT-032: album opened from an artist — Back returns to that artist, breadcrumb shows it', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockAppRec(page, {
    context: { context_id: 'detail', series_id: 'bluey' },
    appState: { screen: 'detail', itemId: 'bluey', profile: 'kids' }
  }, intents);
  await page.addInitScript(() => {
    sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([
      { page: 'browse.html', params: { tab: 'music', rail: 'artists' }, label: 'Artists' },
      { page: 'artist.html', params: { artist: 'elo' }, label: 'ELO' }
    ]));
  });
  await page.goto('/companion/detail.html');
  await expect(page.locator('#breadcrumb .crumb-link')).toContainText(['ELO']);
  await page.locator('#btn-back').click();
  await expect.poll(() => intents.filter((i) => i.intent === 'navigate' && i.params.page === 'artist.html' && i.params.params.artist === 'elo').length).toBeGreaterThan(0);
  expect(intents.filter((i) => i.intent === 'back')).toHaveLength(0);
});

test('FEAT-032: a series detail (no artist parent) keeps the default Back intent', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockAppRec(page, {
    context: { context_id: 'detail', series_id: 'bluey' },
    appState: { screen: 'detail', itemId: 'bluey', profile: 'kids' }
  }, intents);
  await page.addInitScript(() => { sessionStorage.removeItem('grew-tv:nav-trail'); });
  await page.goto('/companion/detail.html');
  await page.locator('#btn-back').click();
  await expect.poll(() => intents.filter((i) => i.intent === 'back').length).toBeGreaterThan(0);
  expect(intents.filter((i) => i.intent === 'navigate' && i.params.page === 'artist.html')).toHaveLength(0);
});

// FEAT-038 (TASK-230) — desynced detail. The companion arrives via browse's local
// link (detail.html?id=…) while the TV is elsewhere, so it self-loads the series
// from the id instead of waiting for the TV's context echo; it does not follow the
// TV, greys the play controls, and Back is a local hop to browse.
test.describe('desync mode', () => {
  // The TV is NOT on detail (context: browse) — proving the page self-loads.
  function mockElsewhere(page, intents) {
    return mockAppRec(page, {
      context: { context_id: 'browse' },
      appState: { screen: 'browse', profile: 'kids' }
    }, intents);
  }
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('grew-tv:companion-mode', 'desynced');
      sessionStorage.removeItem('grew-tv:nav-trail');
    });
  });

  test('self-loads the series from ?id without the TV echo', async ({ page }) => {
    await installApi(page);
    await mockElsewhere(page, []);
    await page.goto('/companion/detail.html?id=bluey');
    await expect(page.locator('.tile-btn')).toHaveCount(3);
    await expect(page.locator('#btn-sync-toggle')).toHaveText('Desynced · Sync');
  });

  test('play controls grey out (no dead clicks) while desynced', async ({ page }) => {
    await installApi(page);
    await mockElsewhere(page, []);
    await page.goto('/companion/detail.html?id=bluey');
    await expect(page.locator('.play-next-btn')).toHaveClass(/desync-off/);
    await expect(page.locator('.tile-btn').first()).toHaveClass(/desync-off/);
  });

  test('Back is a local hop to browse — no back/navigate intent to the TV', async ({ page }) => {
    const intents = [];
    await installApi(page);
    await mockElsewhere(page, intents);
    await page.goto('/companion/detail.html?id=bluey');
    await expect(page.locator('.tile-btn').first()).toBeVisible();
    await page.locator('#btn-back').click();
    await page.waitForURL('**/companion/browse.html');
    expect(intents.filter((i) => i.intent === 'back')).toHaveLength(0);
  });
});
