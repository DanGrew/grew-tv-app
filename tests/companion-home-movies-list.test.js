const { test, expect } = require('@playwright/test');
const { installApi, BROWSE } = require('./fixtures/api.js');

// TASK-486 (revision) — the companion mirror of screen-home-movies-list-page.js
// (FEAT-017/028 mirror invariant): the same scoped clip list (All or a kid),
// built off the SAME core/home-rails.js homeMoviesListItems/homeMoviesListTitle
// the TV screen uses. A "▶ Play All" header button (mirrors companion-detail's
// Play-next) plus one row per clip with a ＋ Queue control; tapping a row or the
// header drives the TV via `play`/`play_next` intents. Home Movies is in the
// default BROWSE fixture (millie-walk + beach-day, both people:['millie']).

function msg(type, payload) { return JSON.stringify({ type, payload }); }

let sentIntents;

// TASK-491 — homeMoviesMonth mirrors homeMoviesPerson: the TV screen's own
// sendContext/sendAppState now carry both scope fields together, one real
// (a string, or null for All) and the other null/absent per entry.
function mockApp(page, homeMoviesPerson, homeMoviesMonth) {
  let version = 1;
  let ctx = 'home-movies-list';
  const st = { screen: 'home-movies-list', homeMoviesPerson: homeMoviesPerson, homeMoviesMonth: homeMoviesMonth, profile: 'kids', person: 'kids' };
  return page.routeWebSocket(/:8766/, (ws) => {
    function pushState() { ws.send(msg('app_state', st)); }
    function pushCtx() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: ctx, home_movies_person: homeMoviesPerson, home_movies_month: homeMoviesMonth }));
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

test.beforeEach(async ({ page }) => {
  sentIntents = [];
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content })
  }));
});

test.describe('synced (drives the TV)', () => {
  test.beforeEach(async ({ page }) => {
    await mockApp(page, 'millie');
    await page.goto('/companion/home-movies-list.html');
  });

  test('renders the scoped title from the live context', async ({ page }) => {
    await expect(page.locator('#ctx-title')).toHaveText('Millie');
  });

  test('lists the scoped clips with a leading Play All button', async ({ page }) => {
    await expect(page.locator('.tile-btn').first()).toBeVisible();
    await expect(page.locator('.play-next-btn')).toHaveText('▶ Play All');
    await expect(page.locator('.tile-btn')).toHaveCount(2);
  });

  test('tapping the header Play All button sends play_next (drives the TV)', async ({ page }) => {
    await expect(page.locator('.tile-btn').first()).toBeVisible();
    await page.locator('.play-next-btn').click();
    await expect.poll(() => sentIntents.some(p => p.intent === 'play_next')).toBe(true);
  });

  test('tapping a clip sends the play intent with its id (drives the TV)', async ({ page }) => {
    await page.locator('.tile-btn[data-id="beach-day"]').click();
    await expect.poll(() => sentIntents.some(p => p.intent === 'play' && p.params.id === 'beach-day')).toBe(true);
  });

  test('＋ Queue POSTs queue-video for the clip', async ({ page }) => {
    const queued = page.waitForRequest(r => r.url().includes('/api/video-playback/queue-video') && r.method() === 'POST');
    await page.locator('.detail-track-row:has(.tile-btn[data-id="beach-day"]) .detail-queue-btn').click();
    const req = await queued;
    expect(req.url()).toContain('person=kids');
    expect(JSON.parse(req.postData())).toEqual({ video_id: 'beach-day' });
    await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
  });

  test('the Home Movies breadcrumb crumb teleports the TV back to that tab', async ({ page }) => {
    await expect(page.locator('#breadcrumb .crumb-link')).toHaveCount(2);
    await page.locator('#breadcrumb .crumb-link').last().click();
    await expect(page).toHaveURL(/companion\/browse\.html$/);
  });
});

test.describe('the All scope', () => {
  test('renders "All" and every home-movie clip', async ({ page }) => {
    await mockApp(page, null);
    await page.goto('/companion/home-movies-list.html');
    await expect(page.locator('#ctx-title')).toHaveText('All');
    await expect(page.locator('.tile-btn')).toHaveCount(2);
  });
});

// TASK-491 — a month scope, mirroring the synced kid-scope block above. Both
// fixture clips are captured in January 2026 (tests/fixtures/api.js).
test.describe('the month scope (synced, drives the TV)', () => {
  test.beforeEach(async ({ page }) => {
    await mockApp(page, null, '2026-01');
    await page.goto('/companion/home-movies-list.html');
  });

  test('renders the month label from the live context', async ({ page }) => {
    await expect(page.locator('#ctx-title')).toHaveText('Jan 2026');
  });

  test('lists the scoped clips with a leading Play All button', async ({ page }) => {
    await expect(page.locator('.tile-btn').first()).toBeVisible();
    await expect(page.locator('.play-next-btn')).toHaveText('▶ Play All');
    await expect(page.locator('.tile-btn')).toHaveCount(2);
  });

  test('tapping the header Play All button sends play_next (drives the TV)', async ({ page }) => {
    await expect(page.locator('.tile-btn').first()).toBeVisible();
    await page.locator('.play-next-btn').click();
    await expect.poll(() => sentIntents.some(p => p.intent === 'play_next')).toBe(true);
  });
});

// FEAT-038 (DSYNC-2c): opening the list while Browsing. The page self-loads
// from ?homeMoviesPerson (companion-browse.js openItemLocal's own navParams,
// not the generic ?id= other desync pages read); the rows grey out (play-only).
test.describe('desync mode (Browse)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { sessionStorage.setItem('grew-tv:companion-mode', 'desynced'); });
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
    await page.goto('/companion/home-movies-list.html?homeMoviesPerson=millie');
  });

  test('self-loads the scoped clips from ?homeMoviesPerson (no TV echo); rows grey out', async ({ page }) => {
    await expect(page.locator('#ctx-title')).toHaveText('Millie');
    await expect(page.locator('.tile-btn')).toHaveCount(2);
    await expect(page.locator('.tile-btn').first()).toHaveClass(/desync-off/);
    await expect(page.locator('.play-next-btn')).toHaveClass(/desync-off/);
  });

  test('tapping a clip while desynced emits no intent (greyed, play-only)', async ({ page }) => {
    await expect(page.locator('.tile-btn').first()).toBeVisible();
    await page.locator('.tile-btn').first().click({ force: true });
    expect(sentIntents.filter(p => p.intent === 'play')).toHaveLength(0);
  });
});

// TASK-491 — the same desync entry, but via ?homeMoviesMonth (companion-browse.js
// openItemLocal's own navParams for a month tile) instead of ?homeMoviesPerson.
test.describe('desync mode (Browse), month scope', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { sessionStorage.setItem('grew-tv:companion-mode', 'desynced'); });
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
    await page.goto('/companion/home-movies-list.html?homeMoviesMonth=2026-01');
  });

  test('self-loads the scoped clips from ?homeMoviesMonth (no TV echo); rows grey out', async ({ page }) => {
    await expect(page.locator('#ctx-title')).toHaveText('Jan 2026');
    await expect(page.locator('.tile-btn')).toHaveCount(2);
    await expect(page.locator('.tile-btn').first()).toHaveClass(/desync-off/);
    await expect(page.locator('.play-next-btn')).toHaveClass(/desync-off/);
  });
});
