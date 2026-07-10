const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// TASK-322 (FEAT-046) — the companion artist mirror: the same grouped SONG LIST as
// the TV artist page (all the artist's tracks under album headers, newest album
// first). Tapping a song drives the TV to the artist player from there (the `play`
// intent → the TV clicks that track's row → play-source {artist} + play-track). No
// Play/Shuffle header (TASK-321 mirror invariant). The app side is mocked over the
// WS; the catalog is backend state (MUSIC_CARDS: ELO x2 albums, ABBA x1) + one
// /api/album per album (installApi resolves ootb + elo-time).

function msg(type, payload) { return JSON.stringify({ type, payload }); }

// Intents the companion sends — the mock records the full payload so a song tap can
// be asserted (a play drives the TV, so there's no companion URL change to observe).
let sentIntents;

function mockApp(page) {
  let version = 1;
  let ctx = 'artist';
  const st = { screen: 'artist', artist: 'ELO', profile: 'kids' };
  return page.routeWebSocket(/:8766/, (ws) => {
    function pushState() { ws.send(msg('app_state', st)); }
    function pushCtx() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: ctx, artist: st.artist }));
      pushState();
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'intent') sentIntents.push(m.payload);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') pushCtx();
      if (m.type === 'intent' && m.payload.intent === 'navigate') {
        const p = m.payload.params.page.replace('.html', '');
        ctx = p;
        pushCtx();
      }
    });
  });
}

// A 1×1 transparent PNG so the cover <img> resolves (200) in-test — otherwise a
// 404 fires the row's onerror, swapping the <img> out for the ♪ placeholder.
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAoiTHmgAAAAASUVORK5CYII=', 'base64');

test.beforeEach(async ({ page }) => {
  sentIntents = [];
  await installApi(page);
  await page.route('**/media/**', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }));
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
  await mockApp(page);
  await page.goto('/companion/artist.html');
});

test('renders the artist name from the live context', async ({ page }) => {
  await expect(page.locator('#ctx-title')).toHaveText('ELO');
});

test('lists all the artist songs grouped by album header, newest album first', async ({ page }) => {
  await expect(page.locator('.song').first()).toBeVisible();
  await expect(page.locator('.album-head')).toHaveText(['Time', 'Out of the Blue']);
  await expect(page.locator('.song')).toHaveCount(5);
  await expect(page.locator('.song .s-label')).toHaveText([
    '1. Twilight', '2. Ticket to the Moon',
    '1. Turn to Stone', '2. Mr. Blue Sky', '3. Sweet Talkin Woman'
  ]);
  await expect(page.locator('.song[data-id="dancing-queen"]')).toHaveCount(0);
});

test('each song row shows its cover art from /media/', async ({ page }) => {
  const cover = page.locator('.song[data-id="ootb-01"] .ph-cover');
  await expect(cover).toHaveCount(1);
  await expect(cover).toHaveAttribute('src', /\/media\/ootb\.jpg$/);
});

test('there is no Play or Shuffle header on the companion artist page', async ({ page }) => {
  await expect(page.locator('.song').first()).toBeVisible();
  await expect(page.locator('#btn-play')).toHaveCount(0);
  await expect(page.locator('#btn-shuffle')).toHaveCount(0);
});

test('tapping a song sends the play intent with the track id (drives the TV)', async ({ page }) => {
  await page.locator('.song[data-id="ootb-01"]').click();
  await expect.poll(() => sentIntents.some(p => p.intent === 'play' && p.params.id === 'ootb-01')).toBe(true);
});

test('the breadcrumb Music crumb teleports the TV back to the Music tab', async ({ page }) => {
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveCount(2);
  await page.locator('#breadcrumb .crumb-link').last().click();
  await expect(page).toHaveURL(/companion\/browse\.html$/);
});

test('FEAT-032: loading the artist page records it on the nav trail (so a child can return here)', async ({ page }) => {
  await expect(page.locator('#ctx-title')).toHaveText('ELO');
  const trail = await page.evaluate(() => JSON.parse(sessionStorage.getItem('grew-tv:nav-trail')));
  expect(trail.some((e) => e.page === 'artist.html' && e.params.artist === 'ELO')).toBe(true);
});

// BUG-021: an artist reached THROUGH a rail records a browse.html rail entry under
// its own artist.html entry — the breadcrumb must show that rail crumb and retrace
// to it, not the generic Music crumb.
test('BUG-021: an artist reached via a rail shows that rail crumb and retraces to it', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([
      { page: 'browse.html', params: { tab: 'music', rail: 'artists' }, label: 'Artists' }
    ]));
  });
  await page.goto('/companion/artist.html');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Artists']);
  const railCrumb = page.locator('#breadcrumb .crumb-link', { hasText: 'Artists' });
  await expect(railCrumb).toHaveAttribute('data-params', /"rail":"artists"/);
  await railCrumb.click();
  await expect(page).toHaveURL(/companion\/browse\.html$/);
});

// FEAT-038 (DSYNC-2c): opening an artist while Browsing. The page self-loads its
// songs from ?id (the TV is elsewhere); the song rows grey out (they drive the TV).
test.describe('desync mode (Browse)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { sessionStorage.setItem('grew-tv:companion-mode', 'desynced'); });
    // Re-point the WS so the TV is NOT on artist — proves the self-load.
    let version = 1;
    await page.routeWebSocket(/:8766/, (ws) => {
      function push() {
        version += 1;
        ws.send(msg('context', { version: version, context_id: 'browse' }));
        ws.send(msg('app_state', { screen: 'home', profile: 'kids', person: 'kids' }));
      }
      ws.onMessage(function(raw) {
        const m = JSON.parse(raw);
        if (m.type === 'intent') sentIntents.push(m.payload);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') push();
      });
    });
    await page.goto('/companion/artist.html?id=ELO');
  });

  test('self-loads the artist songs from ?id (no TV echo); rows grey out', async ({ page }) => {
    await expect(page.locator('#ctx-title')).toHaveText('ELO');
    await expect(page.locator('.song')).toHaveCount(5);
    await expect(page.locator('body')).toHaveClass(/browsing/);
    await expect(page.locator('.song').first()).toHaveClass(/desync-off/);
  });

  // BUG-029: companion browse opens the artist page with the prefixed rail-tile id
  // (`?id=artist:ELO`). The page must strip the prefix — else the title shows
  // "artist:ELO" and albumsByArtist misses (0 albums → "No songs").
  test('BUG-029: a prefixed ?id=artist:<name> resolves to the clean name and its songs', async ({ page }) => {
    await page.goto('/companion/artist.html?id=artist:ELO');
    await expect(page.locator('#ctx-title')).toHaveText('ELO');
    await expect(page.locator('.song')).toHaveCount(5);
  });

  // BUG-035: the breadcrumb/TV path links here with ?artist=<name> (not ?id=).
  test('BUG-035: a ?artist=<name> entry (crumb path) seeds the artist and renders its songs', async ({ page }) => {
    await page.goto('/companion/artist.html?artist=ELO');
    await expect(page.locator('#ctx-title')).toHaveText('ELO');
    await expect(page.locator('.song')).toHaveCount(5);
    await expect(page.locator('.no-actions')).toHaveCount(0);
  });

  test('TASK-243: no Back button — the breadcrumb Home is the local hop to browse', async ({ page }) => {
    await expect(page.locator('.song').first()).toBeVisible();
    await expect(page.locator('#btn-back')).toHaveCount(0);
    await page.locator('#breadcrumb .crumb-link').first().click();
    await page.waitForURL('**/companion/browse.html');
    expect(sentIntents.filter((p) => p.intent === 'back')).toHaveLength(0);
  });
});
