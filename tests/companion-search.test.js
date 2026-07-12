const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// FEAT-048 (TASK-324) — the companion search overlay. A 🔍 button in the topbar
// opens a modal panel (Videos|Music toggle + text field + ranked results) that
// is a SEPARATE surface over the drill: it never re-renders the Section/Rail/Grid
// rows, so closing it leaves the drill exactly where it was (Story 7 / BUG-038).
// Videos come from the browse cards; Music from /api/tracks (tracks) plus albums
// & artists derived from the same cards. A result tap routes via the existing
// tile `select` path (companion drives, TV mirrors): a TRACK targets its album, an
// ARTIST its artist page. The app is mocked over the WS; catalog is /api/browse.

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
      if (m.type === 'intent' && m.payload.intent === 'select') push('detail');
    });
  });
}

function withMusic(page) {
  return page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: {}, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
}

let intents;

test.beforeEach(async ({ page }) => {
  intents = [];
  await installApi(page);
  await mockApp(page, intents);
});

test('Story 1 — tapping 🔍 opens a panel with a Videos|Music toggle and a focused text field', async ({ page }) => {
  await page.goto('/companion/browse.html');
  await expect(page.locator('#sections-row .chip').first()).toBeVisible();
  await expect(page.locator('#search-panel')).toBeHidden();
  await page.locator('#btn-search').click();
  await expect(page.locator('#search-panel')).toBeVisible();
  await expect(page.locator('#search-seg .seg-opt')).toHaveText(['Videos', 'Music']);
  await expect(page.locator('#search-seg .seg-opt.on')).toHaveText('Videos');
  await expect(page.locator('#search-input')).toBeFocused();
});

test('Story 2 — Videos + a query shows ranked results with a thumbnail + type tag; tap routes to its detail', async ({ page }) => {
  await page.goto('/companion/browse.html');
  await expect(page.locator('#sections-row .chip').first()).toBeVisible();
  await page.locator('#btn-search').click();
  await page.locator('#search-input').fill('blu');
  const row = page.locator('.sr-row', { hasText: 'Bluey' });
  await expect(row).toBeVisible();
  await expect(row.locator('.sr-thumb')).toBeVisible();      // thumbnails load (bounded overlay)
  await expect(row.locator('.sr-tag')).toHaveText('SERIES');
  await row.click();
  await expect.poll(() => intents.filter(i => i.intent === 'select').map(i => i.params.id)).toContain('bluey');
  await page.waitForURL('**/companion/detail.html');         // TV mirrors -> companion follows to detail
});

test('empty / blank query shows no results (nothing until >=1 char)', async ({ page }) => {
  await page.goto('/companion/browse.html');
  await page.locator('#btn-search').click();
  await expect(page.locator('.sr-row')).toHaveCount(0);
  await page.locator('#search-input').fill('zzzznomatch');
  await expect(page.locator('.sr-row')).toHaveCount(0);
});

test('Story 7 — closing the panel returns to browse exactly where I was (drill untouched)', async ({ page }) => {
  await page.goto('/companion/browse.html');
  await page.locator('.chip[data-section="series"]').click();
  await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"] .nm')).toHaveText('Bluey');
  await page.locator('#btn-search').click();
  await expect(page.locator('#search-panel')).toBeVisible();
  await page.locator('#btn-search-close').click();
  await expect(page.locator('#search-panel')).toBeHidden();
  // The drill is untouched — still the animation grid, breadcrumb intact.
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"] .nm')).toHaveText('Bluey');
  await expect(page.locator('.chip[data-section="series"]')).toHaveClass(/active/);
});

test.describe('Music search', () => {
  test.beforeEach(async ({ page }) => {
    await withMusic(page);
    await page.goto('/companion/browse.html');
    await expect(page.locator('#sections-row .chip')).toContainText(['Music']);
  });

  test('Story 3/5 — Music + an artist name shows mixed TRACK, ALBUM and ARTIST results ranked closest-first', async ({ page }) => {
    await page.locator('#btn-search').click();
    await page.locator('#search-seg .seg-opt[data-domain="music"]').click();
    await expect(page.locator('#search-seg .seg-opt.on')).toHaveText('Music');
    await page.locator('#search-input').fill('elo');
    // The artist name hits the artist tile, its albums AND its tracks (not just track title).
    await expect(page.locator('.sr-row:has(.sr-tag:text-is("ARTIST"))')).toHaveCount(1);
    await expect(page.locator('.sr-row:has(.sr-tag:text-is("ALBUM"))').first()).toBeVisible();
    await expect(page.locator('.sr-row:has(.sr-tag:text-is("TRACK"))').first()).toBeVisible();
    // Closest match first: the exact artist-name match leads.
    await expect(page.locator('.sr-row').first().locator('.sr-tag')).toHaveText('ARTIST');
  });

  test('Story 4 — tapping a TRACK drives to its album; ARTIST drives to the artist page', async ({ page }) => {
    await page.locator('#btn-search').click();
    await page.locator('#search-seg .seg-opt[data-domain="music"]').click();
    await page.locator('#search-input').fill('blue sky');
    const track = page.locator('.sr-row', { hasText: 'Mr. Blue Sky' });
    await expect(track.locator('.sr-tag')).toHaveText('TRACK');
    await expect(track.locator('.sr-sub')).toHaveText('ELO · Out of the Blue');
    await track.click();
    // A TRACK opens its album — the select carries the album_id, not the track id.
    await expect.poll(() => intents.filter(i => i.intent === 'select').map(i => i.params.id)).toContain('ootb');
  });

  test('Story 4 — tapping an ARTIST drives to the artist page (id artist:Name)', async ({ page }) => {
    await page.locator('#btn-search').click();
    await page.locator('#search-seg .seg-opt[data-domain="music"]').click();
    await page.locator('#search-input').fill('abba');
    const artist = page.locator('.sr-row:has(.sr-tag:text-is("ARTIST"))');
    await expect(artist.locator('.sr-title')).toHaveText('ABBA');
    await artist.click();
    await expect.poll(() => intents.filter(i => i.intent === 'select').map(i => i.params.id)).toContain('artist:ABBA');
  });
});
