const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// BUG-021 (end-to-end) — driving the REAL companion drill, not a seeded trail:
// Home → Music → a rail → a tile → the leaf page, then BACK via the rail
// breadcrumb crumb must land on that rail's GRID (not the sections root). The
// first fix made the crumb render; this guards the round-trip — trimOnCrumb used
// to wipe the rail entry so companion-browse reloaded at the top.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

const PLAYLIST_BROWSE_CARDS = [
  { kind: 'series', id: 'pl-roadtrip', title: 'Road Trip', poster: null, type: null, section: 'music', collectionType: 'playlist', artist: null, clipCount: 2, tags: null, coverArt: ['ootb.jpg', 'abba.jpg'] }
];

function ctxForSelect(id) {
  if (id === 'pl-roadtrip') return { context_id: 'playlist', playlist: id, screen: 'playlist', itemId: id };
  if (id && id.indexOf('artist:') === 0) return { context_id: 'artist', artist: id.replace('artist:', ''), screen: 'artist' };
  return { context_id: 'detail', series_id: id, screen: 'detail', itemId: id };
}

// Faithful single-screen app mock: echoes the leaf context on `select` and the
// target page's context on `navigate`, persisting across the companion's own page
// loads so the leaf page and the returned browse page each re-sync.
function mockApp(page) {
  let version = 1;
  let cur = { context_id: 'browse', screen: 'home' };
  return page.routeWebSocket(/:8766/, (ws) => {
    function push() {
      version += 1;
      ws.send(msg('context', Object.assign({ version: version }, cur)));
      ws.send(msg('app_state', Object.assign({ profile: 'kids', person: 'kids' }, cur)));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') push();
      if (m.type === 'intent' && m.payload.intent === 'select') { cur = ctxForSelect(m.payload.params.id); push(); }
      if (m.type === 'intent' && m.payload.intent === 'navigate') { cur = { context_id: m.payload.params.page.replace('.html', ''), screen: 'home' }; push(); }
    });
  });
}

async function openMusicBrowse(page) {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_BROWSE_CARDS) })
  }));
  await mockApp(page);
  await page.goto('/companion/browse.html');
  await expect(page.locator('#sections-row .chip')).toContainText(['Music']);
}

test('BUG-021: drill Music → Playlists rail → playlist, then back via the rail crumb lands on the Playlists grid', async ({ page }) => {
  await openMusicBrowse(page);
  await page.locator('.chip[data-section="music"]').click();
  await page.locator('#rails-row .chip[data-rail="playlists"]').click();
  await expect(page.locator('#txtgrid .ph-txt[data-id="pl-roadtrip"]')).toBeVisible();
  await page.locator('#txtgrid .ph-txt[data-id="pl-roadtrip"]').click();
  await page.waitForURL('**/companion/playlist.html');
  // The breadcrumb shows the rail it was reached through.
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Playlists']);
  // Back via the rail crumb returns to the Playlists GRID, not the sections root.
  await page.locator('#breadcrumb .crumb-link', { hasText: 'Playlists' }).click();
  await page.waitForURL('**/companion/browse.html');
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await expect(page.locator('#txtgrid .ph-txt[data-id="pl-roadtrip"]')).toBeVisible();
  await expect(page.locator('#rails-row .chip[data-rail="playlists"]')).toHaveClass(/active/);
});

test('BUG-021: drill Music → Artists rail → artist, then back via the rail crumb lands on the Artists grid', async ({ page }) => {
  await openMusicBrowse(page);
  await page.locator('.chip[data-section="music"]').click();
  await page.locator('#rails-row .chip[data-rail="artists"]').click();
  await expect(page.locator('#txtgrid .ph-txt[data-id="artist:ELO"]')).toBeVisible();
  await page.locator('#txtgrid .ph-txt[data-id="artist:ELO"]').click();
  await page.waitForURL('**/companion/artist.html');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Artists']);
  await page.locator('#breadcrumb .crumb-link', { hasText: 'Artists' }).click();
  await page.waitForURL('**/companion/browse.html');
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await expect(page.locator('#txtgrid .ph-txt[data-id="artist:ELO"]')).toBeVisible();
  await expect(page.locator('#rails-row .chip[data-rail="artists"]')).toHaveClass(/active/);
});
