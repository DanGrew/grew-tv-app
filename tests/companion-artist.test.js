const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// FEAT-029 follow-up — the companion artist context: mirrors the TV's artist
// drill-down (one artist's album grid). Before this page existed the companion
// navigated to /companion/artist.html on the app's `context_id:'artist'` push
// and got a raw 404 error JSON (the bug this fixes). The app side is mocked over
// the WS; the album catalog is backend state from /api/browse (MUSIC_CARDS: ELO
// x2, ABBA x1). The mock echoes a `select` intent back as the album-detail
// context, exactly the app↔companion teleport contract.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

const CTX_FOR = { 'album-detail': 'detail' };

// Intents the companion sends this test — the mock records them so the Play /
// Shuffle header (TASK-214) can be asserted (those drive the TV, not the
// companion, so there's no companion URL change to observe).
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
      if (m.type === 'intent') sentIntents.push(m.payload.intent);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') pushCtx();
      // select teleports the TV to album detail; the app echoes its `detail` context.
      if (m.type === 'intent' && m.payload.intent === 'select') { ctx = 'detail'; pushCtx(); }
      if (m.type === 'intent' && m.payload.intent === 'navigate') {
        const p = m.payload.params.page.replace('.html', '');
        ctx = CTX_FOR[p] || p;
        pushCtx();
      }
    });
  });
}

test.beforeEach(async ({ page }) => {
  sentIntents = [];
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
  await mockApp(page);
  await page.goto('/companion/artist.html');
});

test('renders the artist name and label from the live context', async ({ page }) => {
  await expect(page.locator('#ctx-label')).toHaveText('Artist');
  await expect(page.locator('#ctx-title')).toHaveText('ELO');
});

test('lists only this artist’s albums (ELO x2), not the other artist', async ({ page }) => {
  await expect(page.locator('.ph-txt')).toHaveCount(2);
  await expect(page.locator('.ph-txt[data-id="ootb"] .nm')).toHaveText('Out of the Blue');
  await expect(page.locator('.ph-txt[data-id="elo-time"] .nm')).toHaveText('Time');
  await expect(page.locator('.ph-txt[data-id="abba-arrival"]')).toHaveCount(0);
});

test('tapping an album teleports the TV — the companion follows to the album detail', async ({ page }) => {
  await page.locator('.ph-txt[data-id="ootb"]').click();
  await expect(page).toHaveURL(/companion\/detail\.html$/);
});

test('the breadcrumb Music crumb teleports the TV back to the Music tab', async ({ page }) => {
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveCount(2);
  await page.locator('#breadcrumb .crumb-link').last().click();
  await expect(page).toHaveURL(/companion\/browse\.html$/);
});

test('Play header sends the playArtist intent — drives the TV to the artist player', async ({ page }) => {
  await page.locator('#btn-play').click();
  await expect.poll(() => sentIntents).toContain('playArtist');
});

test('Shuffle header sends the shuffle intent', async ({ page }) => {
  await page.locator('#btn-shuffle').click();
  await expect.poll(() => sentIntents).toContain('shuffle');
});

test('FEAT-032: loading the artist page records it on the nav trail (so a child can return here)', async ({ page }) => {
  await expect(page.locator('#ctx-title')).toHaveText('ELO');
  const trail = await page.evaluate(() => JSON.parse(sessionStorage.getItem('grew-tv:nav-trail')));
  expect(trail.some((e) => e.page === 'artist.html' && e.params.artist === 'ELO')).toBe(true);
});

// FEAT-038 (DSYNC-2c): opening an artist while Browsing. The page self-loads its
// albums from ?id (the TV is elsewhere); album tiles open album detail LOCALLY
// (they stay live — browsing into them is the point); play/shuffle grey out.
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
        if (m.type === 'intent') sentIntents.push(m.payload.intent);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') push();
      });
    });
    await page.goto('/companion/artist.html?id=ELO');
  });

  test('self-loads the artist albums from ?id (no TV echo)', async ({ page }) => {
    await expect(page.locator('#ctx-title')).toHaveText('ELO');
    await expect(page.locator('.ph-txt')).toHaveCount(2);
    await expect(page.locator('body')).toHaveClass(/browsing/);
  });

  test('tapping an album opens detail locally (no select intent to the TV)', async ({ page }) => {
    await page.locator('.ph-txt[data-id="ootb"]').click();
    await page.waitForURL('**/companion/detail.html?id=ootb');
    expect(sentIntents.filter((i) => i === 'select')).toHaveLength(0);
  });

  test('TASK-243: no Back button — the breadcrumb Home is the local hop to browse', async ({ page }) => {
    await expect(page.locator('.ph-txt').first()).toBeVisible();
    await expect(page.locator('#btn-back')).toHaveCount(0);
    await page.locator('#breadcrumb .crumb-link').first().click();
    await page.waitForURL('**/companion/browse.html');
    expect(sentIntents.filter((i) => i === 'back')).toHaveLength(0);
  });
});
