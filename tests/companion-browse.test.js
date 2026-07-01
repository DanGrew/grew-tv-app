const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

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
  await expect(page.locator('#sections-row .chip')).toHaveText(['TV Series', 'Films', 'Home Movies']);
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
  await expect(page.locator('#sections-row .chip')).toHaveText(['TV Series', 'Films', 'Home Movies']);
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

// FEAT-039 (TASK-236) — the companion create-playlist affordance is a subtle ＋
// chip inside the Music section's rails row (was a standalone section-level
// button, TASK-209). Shown only when the Music section is open and reachable even
// with ZERO playlists (the Playlists rail chip is omitted when empty, so a
// grid-level entry would strand the create-then-delete loop). Music cards are
// injected so the Music section exists; no playlist cards, proving zero-state reach.
test.describe('create-playlist affordance', () => {
  test.beforeEach(async ({ page }) => {
    intents = [];
    await installApi(page);
    await mockApp(page, intents);
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: {}, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
    }));
    await page.goto('/companion/browse.html');
    await expect(page.locator('#sections-row .chip')).toContainText(['Music']);
  });

  test('the create ＋ chip is absent until the Music section is open, then lives in the rails row', async ({ page }) => {
    await expect(page.locator('[data-create-playlist]')).toHaveCount(0);
    await page.locator('.chip[data-section="music"]').click();
    await expect(page.locator('#rails-row [data-create-playlist]')).toBeVisible();
  });

  test('the create ＋ chip opens the companion create page even with zero playlists', async ({ page }) => {
    await page.locator('.chip[data-section="music"]').click();
    await page.locator('#rails-row [data-create-playlist]').click();
    await expect(page).toHaveURL(/companion\/playlist-create\.html/);
  });
});

// FEAT-032 (TASK-218): the companion records its drill position into nav-trail as
// you descend, so returning to browse — Back, or a player's breadcrumb — lands on
// the items you came from, not the sections root. The trail is sessionStorage, so
// it survives the page reload when the companion follows the TV back to browse.
test('FEAT-032: drilling records the grid position in the nav trail', async ({ page }) => {
  await page.locator('.chip[data-section="series"]').click();
  await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
  await expect(page.locator('#grid-wrap')).toBeVisible();
  const trail = await page.evaluate(() => JSON.parse(sessionStorage.getItem('grew-tv:nav-trail')));
  expect(trail).toHaveLength(1);
  expect(trail[0]).toMatchObject({ page: 'browse.html', params: { tab: 'series', rail: 'genre:animation' } });
});

test('FEAT-032: a recorded grid trail restores the grid level on load, not the sections root', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([{ page: 'browse.html', params: { tab: 'series', rail: 'genre:animation' }, label: 'Animation' }]));
  });
  await page.reload();
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"] .nm')).toHaveText('Bluey');
  await expect(page.locator('.chip[data-section="series"]')).toHaveClass(/active/);
  // Restore must DRIVE the TV to the matching rail-grid (not just seed the
  // companion): a tile tap emits `select`, which the TV's rail-grid page routes —
  // if the TV isn't on that rail-grid the tap is dropped. Proves they re-sync.
  await expect.poll(() => intents.filter((i) => i.intent === 'navigate' && i.params.page === 'rail-grid.html' && i.params.params.rail === 'genre:animation').length).toBeGreaterThan(0);
});

test('FEAT-032: collapsing back to the sections root clears the trail (next load starts at top)', async ({ page }) => {
  await page.locator('.chip[data-section="series"]').click();
  await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
  await page.locator('#btn-back').click();
  await page.locator('#btn-back').click();
  await expect(page.locator('#sections-row .chip')).toHaveText(['TV Series', 'Films', 'Home Movies']);
  const trail = await page.evaluate(() => sessionStorage.getItem('grew-tv:nav-trail'));
  expect(trail).toBeNull();
});

test('FEAT-032: a deeper artist entry on top of the browse entry does NOT reset browse (regression)', async ({ page }) => {
  // Returning from the artist page: the trail top is the artist entry, the browse
  // grid entry sits beneath it. Browse must restore from ITS entry, not the top.
  await page.addInitScript(() => {
    sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([
      { page: 'browse.html', params: { tab: 'series', rail: 'genre:animation' }, label: 'Animation' },
      { page: 'artist.html', params: { artist: 'elo' }, label: 'ELO' }
    ]));
  });
  await page.reload();
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"] .nm')).toHaveText('Bluey');
  await expect(page.locator('.chip[data-section="series"]')).toHaveClass(/active/);
});

// FEAT-038 (TASK-230) — companion desync mode. SYNCED is the default (every test
// above). Desynced, the companion browses on its own: it stops emitting nav/
// transport intents and stops following the TV, and opens series/album/playlist/
// artist locally (carrying ?id).
function browseOpt(page) { return page.locator('.seg-opt').filter({ hasText: 'Browse' }); }
function controlOpt(page) { return page.locator('.seg-opt').filter({ hasText: 'Control' }); }

test.describe('desync mode', () => {
  test('Control/Browse segmented switch flips', async ({ page }) => {
    await expect(controlOpt(page)).toHaveClass(/on/);
    await expect(browseOpt(page)).not.toHaveClass(/on/);
    await browseOpt(page).click();
    await expect(browseOpt(page)).toHaveClass(/on/);
    await expect(controlOpt(page)).not.toHaveClass(/on/);
  });

  test('Browse mode drills locally and emits NO intents (TV untouched)', async ({ page }) => {
    await browseOpt(page).click();
    await page.locator('.chip[data-section="series"]').click();
    await expect(page.locator('#rails-wrap')).toBeVisible();
    await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
    await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"]')).toBeVisible();
    expect(intents.filter((i) => i.intent === 'navigate')).toHaveLength(0);
  });

  test('Browse mode tile tap opens detail locally with ?id (no select intent)', async ({ page }) => {
    await browseOpt(page).click();
    await page.locator('.chip[data-section="series"]').click();
    await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
    await page.locator('#txtgrid .ph-txt[data-id="bluey"]').click();
    await page.waitForURL('**/companion/detail.html?id=bluey');
    expect(intents.filter((i) => i.intent === 'select')).toHaveLength(0);
  });

  // FEAT-038 (DSYNC-2c): tapping Control = "jump to where the TV is", so it must
  // clear the local drill trail. Otherwise the reloaded synced browse restores +
  // re-drives the companion's old spot onto the TV (the stray rail-grid nav that
  // jumped the TV to the Playlists rail + 404'd). After Control the trail is gone.
  test('Control clears the local drill trail (follows the TV, does not drive it)', async ({ page }) => {
    await browseOpt(page).click();
    await page.locator('.chip[data-section="series"]').click();
    await page.locator('#rails-row .chip[data-rail="genre:animation"]').click();
    await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"]')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('grew-tv:nav-trail'))).not.toBeNull();
    await controlOpt(page).click();   // -> reSync: clearTrail() + reload
    await expect(page.locator('#sections-row .chip').first()).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('grew-tv:nav-trail'))).toBeNull();
  });

  test('switch-profile greys out in Browse mode (no dead click)', async ({ page }) => {
    await expect(page.locator('#switch-profile')).not.toHaveClass(/desync-off/);
    await browseOpt(page).click();
    await expect(page.locator('#switch-profile')).toHaveClass(/desync-off/);
  });
});

// FEAT-040/TASK-255 — the MUSIC "♪ Music Queue (N)" button beside the video one:
// shown only when the music override ("Play Next") queue is non-empty (count from
// GET /api/playback), drives the TV audio page to start the queue head
// (audio.html?playQueue), and greys while desynced (Browse) like the video/profile
// controls. A dedicated WS mock carries a `person` in app_state (the top-level mock
// omits it, so the queue is never fetched there) + routes the GET snapshot.
test.describe('music Play Queue button', () => {
  function musicMock(page, intents2, playNext) {
    return page.routeWebSocket(/:8766/, (ws) => {
      ws.onMessage(function(raw) {
        const m = JSON.parse(raw);
        if (m.type === 'intent') intents2.push(m.payload);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') { ws.send(msg('context', { version: 2, context_id: 'browse' })); ws.send(msg('app_state', { screen: 'home', profile: 'kids', person: 'kids' })); }
      });
    }).then(() => page.route(/\/api\/playback\?/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ person_id: 'kids', play_next: playNext }) })));
  }

  test('hidden when the music queue is empty', async ({ page }) => {
    await musicMock(page, [], []);
    await page.goto('/companion/browse.html');
    await expect(page.locator('#sections-row .chip').first()).toBeVisible();  // settled
    await expect(page.locator('#btn-play-queue-music')).toBeHidden();
  });

  test('shows the count and drives the TV audio queue head', async ({ page }) => {
    const intents2 = [];
    await musicMock(page, intents2, [{ track_id: 'a' }, { track_id: 'b' }]);
    await page.goto('/companion/browse.html');
    await expect(page.locator('#btn-play-queue-music')).toHaveText('🎵 Music Queue (2)');
    await page.locator('#btn-play-queue-music').click();
    await expect.poll(() => {
      const nav = intents2.find((i) => i.intent === 'navigate' && i.params.page === 'audio.html');
      return nav && nav.params.params.playQueue;
    }).toBe(1);
  });

  test('greys out in Browse mode (no dead click)', async ({ page }) => {
    await musicMock(page, [], [{ track_id: 'a' }]);
    await page.goto('/companion/browse.html');
    await expect(page.locator('#btn-play-queue-music')).toBeVisible();
    await expect(page.locator('#btn-play-queue-music')).not.toHaveClass(/desync-off/);
    await page.locator('.seg-opt').filter({ hasText: 'Browse' }).click();
    await expect(page.locator('#btn-play-queue-music')).toHaveClass(/desync-off/);
  });
});
