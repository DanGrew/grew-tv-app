const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

// FEAT-028 / TASK-168 — the companion drill-down browse (replaces the flat
// FEAT-020/TASK-139 tab+rails layout). The companion walks four levels —
// Sections -> Rails -> Grid -> Item — one at a time, driving the TV: each tap
// emits the existing FEAT-017 `navigate`/`select` intent (no new protocol) and
// optimistically renders locally. The pinned section dock (any section, one
// tap) and the always-visible pager (any rail, one tap) reach every
// section/rail directly from the grid (TASK-426 removed Back as redundant).
// The L3 grid is text-only — zero posters. The app side is mocked over the
// WS; the catalog is backend state from /api/browse (installApi fixtures).

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
  await expect(page.locator('#section-dock .dock-tab-label')).toHaveText(['TV Series', 'Films', 'Home Movies']);
});

// TASK-408 — the companion ▲/▼ row-step buttons, a row inside the header's
// popout menu: while synced, they nudge the TV's browse focus one rail row.
test('the ▲/▼ row-step buttons send navigate_up/navigate_down while synced', async ({ page }) => {
  await page.locator('#btn-status').click();
  await page.locator('#row-step .row-step-btn[aria-label="Focus row down"]').click();
  await expect.poll(() => intents.some((i) => i.intent === 'navigate_down')).toBe(true);
  await page.locator('#row-step .row-step-btn[aria-label="Focus row up"]').click();
  await expect.poll(() => intents.some((i) => i.intent === 'navigate_up')).toBe(true);
});

test('L1 shows section chips from the server sections — no rails/grid yet', async ({ page }) => {
  await expect(page.locator('#rails-wrap')).toBeHidden();
  await expect(page.locator('#grid-wrap')).toBeHidden();
});

test('TASK-426: #btn-back never renders on browse.html, at any level', async ({ page }) => {
  await expect(page.locator('#btn-back')).toHaveCount(0);
  await page.locator('.dock-tab[data-section="films"]').click();
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await expect(page.locator('#btn-back')).toHaveCount(0);
  await page.locator('#pager-next').click();
  await expect(page.locator('#btn-back')).toHaveCount(0);
});

test('L1→L2/L3: tapping a section jumps straight to its first rail\'s grid (TASK-411) + emits a navigate intent', async ({ page }) => {
  await page.locator('.dock-tab[data-section="series"]').click();
  await expect(page.locator('.dock-tab[data-section="series"]')).toHaveClass(/active/);
  await expect(page.locator('#rails-wrap')).toBeVisible();
  await expect(page.locator('#pager-name')).toHaveText('Animation');
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"] .nm')).toHaveText('Bluey');
  // Text-only: the L3 grid renders zero images.
  await expect(page.locator('#txtgrid img')).toHaveCount(0);
  expect(intents).toContainEqual(expect.objectContaining({ intent: 'navigate', params: { page: 'rail-grid.html', params: { section: 'series', rail: 'genre:animation' } } }));
});

test('L2→L3: tapping a pager dot for a different rail shows its bare text tiles + emits a fresh open-grid navigate', async ({ page }) => {
  await page.locator('.dock-tab[data-section="films"]').click();
  await expect(page.locator('#txtgrid .ph-txt[data-id="toy-story-main"]')).toBeVisible();
  await page.locator('#pager-dots .pager-dot[data-rail="genre:comedy"]').click();
  await expect(page.locator('#txtgrid .ph-txt')).toHaveText(['Toy Story']);
  expect(intents).toContainEqual(expect.objectContaining({ intent: 'navigate', params: { page: 'rail-grid.html', params: { section: 'films', rail: 'genre:comedy' } } }));
});

test('L3→L4: tapping a tile emits `select` and follows the echoed context to the item screen', async ({ page }) => {
  await page.locator('.dock-tab[data-section="series"]').click();
  await page.locator('#txtgrid .ph-txt[data-id="bluey"]').click();
  await expect.poll(() => intents.map(function(i) { return i.intent; })).toContain('select');
  const sel = intents.find(function(i) { return i.intent === 'select'; });
  expect(sel.params).toEqual({ id: 'bluey' });
  await page.waitForURL('**/companion/detail.html');
});

test('section sideways-jump: a different SECTION dock tab swaps to that section\'s own first rail + grid', async ({ page }) => {
  await page.locator('.dock-tab[data-section="series"]').click();
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await page.locator('.dock-tab[data-section="films"]').click();
  await expect(page.locator('.dock-tab[data-section="films"]')).toHaveClass(/active/);
  await expect(page.locator('#pager-name')).toHaveText('Animation');
  await expect(page.locator('#pager-dots .pager-dot')).toHaveCount(2);
  await expect(page.locator('#grid-wrap')).toBeVisible();
  await expect(page.locator('#txtgrid .ph-txt[data-id="toy-story-main"]')).toBeVisible();
});

test('pager dot sideways-jump: a different RAIL dot swaps the grid + emits a fresh open-grid', async ({ page }) => {
  await page.locator('.dock-tab[data-section="films"]').click();
  await expect(page.locator('#txtgrid .ph-txt[data-id="toy-story-main"]')).toBeVisible();
  await page.locator('#pager-dots .pager-dot[data-rail="genre:comedy"]').click();
  await expect(page.locator('#txtgrid .ph-txt')).toHaveText(['Toy Story']);
  await expect(page.locator('.pager-dot[data-rail="genre:comedy"]')).toHaveClass(/active/);
  const opens = intents.filter(function(i) { return i.intent === 'navigate' && i.params.page === 'rail-grid.html'; });
  expect(opens).toHaveLength(2);
});

test('‹ › arrows step one rail at a time and disable at either end', async ({ page }) => {
  await page.locator('.dock-tab[data-section="films"]').click();
  await expect(page.locator('#pager-name')).toHaveText('Animation');
  await expect(page.locator('#pager-prev')).toBeDisabled();
  await expect(page.locator('#pager-next')).toBeEnabled();
  await page.locator('#pager-next').click();
  await expect(page.locator('#pager-name')).toHaveText('Comedy');
  await expect(page.locator('#txtgrid .ph-txt')).toHaveText(['Toy Story']);
  await expect(page.locator('#pager-next')).toBeDisabled();
  await page.locator('#pager-prev').click();
  await expect(page.locator('#pager-name')).toHaveText('Animation');
});

test('Switch profile drives the picker — navigate intent echoes a profile context, companion follows (BUG-007)', async ({ page }) => {
  // TASK-412 — Profile now lives inside the header's popout menu.
  await page.locator('#btn-status').click();
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
  await expect(page.locator('.dock-tab[data-section="series"]')).toBeVisible();
  await page.locator('.dock-tab[data-section="series"]').click();
  await expect(page.locator('#pager-name')).toHaveText('Continue Watching');
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey-s1e01"] .nm')).toHaveText('Bluey · Daddy Putdown');
  await expect(page.locator('#txtgrid .ph-txt[data-id="bluey-s1e01"]')).toHaveClass(/prog/);
});

// FEAT-039 (TASK-236) — the companion create-playlist affordance is a ＋
// button in the pager head (TASK-411 moved it off the old rails chip row).
// Shown only when the Music section is open and reachable even with ZERO
// playlists — it's keyed off `state.section`, not which rail is currently
// active, so an empty (omitted) Playlists rail can't strand the
// create-then-delete loop. Music cards are injected so the Music section
// exists; no playlist cards, proving zero-state reach.
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
    await expect(page.locator('#section-dock .dock-tab')).toContainText(['Music']);
  });

  test('the create ＋ button is absent until the Music section is open, then lives in the bottom bar', async ({ page }) => {
    await expect(page.locator('[data-create-playlist]')).toBeHidden();
    await page.locator('.dock-tab[data-section="music"]').click();
    await expect(page.locator('#pager-create')).toBeVisible();
  });

  test('the create ＋ button opens the companion create page even with zero playlists', async ({ page }) => {
    await page.locator('.dock-tab[data-section="music"]').click();
    await page.locator('#pager-create').click();
    await expect(page).toHaveURL(/companion\/playlist-create\.html/);
  });

  // TASK-424 — the button is scoped to the Playlists rail, not the whole Music
  // section: stepping onto Artists (music's 2nd rail — Playlists/Artists/Albums,
  // no Recently Played with zero recents) hides it, stepping back re-shows it.
  test('the create ＋ button hides off the Playlists rail and reappears stepping back onto it', async ({ page }) => {
    await page.locator('.dock-tab[data-section="music"]').click();
    await expect(page.locator('#pager-create')).toBeVisible();
    await page.locator('#pager-next').click();
    await expect(page.locator('#pager-name')).toHaveText('Artists');
    await expect(page.locator('#pager-create')).toBeHidden();
    await page.locator('#pager-prev').click();
    await expect(page.locator('#pager-name')).toHaveText('Playlists');
    await expect(page.locator('#pager-create')).toBeVisible();
  });

  // TASK-424 — the wobble fix: ＋ lives in #bottom-bar, nowhere near
  // .pager-head, so #pager-prev/#pager-next must land at the exact same screen
  // position whether ＋ is showing (Playlists) or hidden (Artists) — not just
  // "roughly close".
  test('toggling the create ＋ button never shifts #pager-prev/#pager-next, even by a pixel', async ({ page }) => {
    await page.locator('.dock-tab[data-section="music"]').click();
    await expect(page.locator('#pager-create')).toBeVisible();
    const prevShown = await page.locator('#pager-prev').boundingBox();
    const nextShown = await page.locator('#pager-next').boundingBox();
    await page.locator('#pager-next').click();
    await expect(page.locator('#pager-create')).toBeHidden();
    const prevHidden = await page.locator('#pager-prev').boundingBox();
    const nextHidden = await page.locator('#pager-next').boundingBox();
    expect(prevHidden).toEqual(prevShown);
    expect(nextHidden).toEqual(nextShown);
  });
});

// TASK-378 — the same ＋ button lives on the Music Videos section too, and
// carries collectionType=music-video-playlist so the companion create page
// mints the right kind (core/app-api.createPlaylist's 4th arg). Music's own
// button carries no collectionType (regression, covered above).
test.describe('create-playlist affordance on Music Videos (TASK-378)', () => {
  test.beforeEach(async ({ page }) => {
    intents = [];
    await installApi(page);
    await mockApp(page, intents);
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: {}, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    }));
    await page.goto('/companion/browse.html');
    await expect(page.locator('#section-dock .dock-tab')).toContainText(['Music Videos']);
  });

  test('the create ＋ button lives in the bottom bar on Music Videos too', async ({ page }) => {
    await page.locator('.dock-tab[data-section="music-videos"]').click();
    await expect(page.locator('#pager-create')).toBeVisible();
  });

  test('the create ＋ button carries collectionType=music-video-playlist', async ({ page }) => {
    await page.locator('.dock-tab[data-section="music-videos"]').click();
    await page.locator('#pager-create').click();
    await expect(page).toHaveURL(/companion\/playlist-create\.html\?.*collectionType=music-video-playlist/);
  });

  // TASK-424 — same rail-scoping as Music: mv-playlists leads (musicVideoRails
  // always puts it first), stepping onto the next (an artist) rail hides ＋.
  test('the create ＋ button hides off the mv-playlists rail', async ({ page }) => {
    await page.locator('.dock-tab[data-section="music-videos"]').click();
    await expect(page.locator('#pager-create')).toBeVisible();
    await page.locator('#pager-next').click();
    await expect(page.locator('#pager-name')).not.toHaveText('Playlists');
    await expect(page.locator('#pager-create')).toBeHidden();
  });
});

// FEAT-045 (TASK-318, Story 8) — the companion Music browse shows the SAME
// "Recently Played" rail as the TV (shared core/home-rails). It leads the
// Music section's rail list — TASK-411 auto-lands a section pick on its first
// rail, so opening Music lands straight on this one — and its grid lists the
// recents tiles newest-first — an artist source maps by name to its
// 'artist:' tile, an album by id. `recents` rides the /api/continue-watching
// response (TASK-317).
test.describe('Recently Played rail (companion mirror)', () => {
  test.beforeEach(async ({ page }) => {
    intents = [];
    await installApi(page);
    await mockApp(page, intents);
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: {}, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
    }));
    await page.route('**/api/continue-watching**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', content: [], recents: [
        { source_type: 'artist', source_id: 'ELO',  last_played: 2 },
        { source_type: 'album',  source_id: 'ootb', last_played: 1 }
      ] })
    }));
    await page.goto('/companion/browse.html');
    await expect(page.locator('#section-dock .dock-tab')).toContainText(['Music']);
  });

  test('the Music section leads with a Recently Played rail; its grid lists the recents newest-first', async ({ page }) => {
    await page.locator('.dock-tab[data-section="music"]').click();
    await expect(page.locator('#pager-name')).toHaveText('Recently Played');
    await expect(page.locator('#txtgrid .ph-txt')).toHaveCount(2);
    await expect(page.locator('#txtgrid .ph-txt').nth(0)).toHaveAttribute('data-id', 'artist:ELO');
    await expect(page.locator('#txtgrid .ph-txt').nth(1)).toHaveAttribute('data-id', 'ootb');
  });
});

// FEAT-032 (TASK-218): the companion records its drill position into nav-trail as
// you descend, so returning to browse — Back, or a player's breadcrumb — lands on
// the items you came from, not the sections root. The trail is sessionStorage, so
// it survives the page reload when the companion follows the TV back to browse.
test('FEAT-032: drilling records the grid position in the nav trail', async ({ page }) => {
  await page.locator('.dock-tab[data-section="series"]').click();
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
  await expect(page.locator('.dock-tab[data-section="series"]')).toHaveClass(/active/);
  // Restore must DRIVE the TV to the matching rail-grid (not just seed the
  // companion): a tile tap emits `select`, which the TV's rail-grid page routes —
  // if the TV isn't on that rail-grid the tap is dropped. Proves they re-sync.
  await expect.poll(() => intents.filter((i) => i.intent === 'navigate' && i.params.page === 'rail-grid.html' && i.params.params.rail === 'genre:animation').length).toBeGreaterThan(0);
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
  await expect(page.locator('.dock-tab[data-section="series"]')).toHaveClass(/active/);
});

// FEAT-038 (TASK-230) — companion desync mode. SYNCED is the default (every test
// above). Desynced, the companion browses on its own: it stops emitting nav/
// transport intents and stops following the TV, and opens series/album/playlist/
// artist locally (carrying ?id).
function browseOpt(page) { return page.locator('.seg-opt').filter({ hasText: 'Browse' }); }
function controlOpt(page) { return page.locator('.seg-opt').filter({ hasText: 'Control' }); }

test.describe('desync mode', () => {
  // TASK-412 — the Control/Browse switch now lives inside the header's popout
  // menu; open it before every test in this block interacts with it.
  test.beforeEach(async ({ page }) => {
    await page.locator('#btn-status').click();
  });

  test('Control/Browse segmented switch flips', async ({ page }) => {
    await expect(controlOpt(page)).toHaveClass(/on/);
    await expect(browseOpt(page)).not.toHaveClass(/on/);
    await browseOpt(page).click();
    await expect(browseOpt(page)).toHaveClass(/on/);
    await expect(controlOpt(page)).not.toHaveClass(/on/);
  });

  test('Browse mode drills locally and emits NO intents (TV untouched)', async ({ page }) => {
    await browseOpt(page).click();
    await page.locator('.dock-tab[data-section="series"]').click();
    await expect(page.locator('#rails-wrap')).toBeVisible();
    await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"]')).toBeVisible();
    expect(intents.filter((i) => i.intent === 'navigate')).toHaveLength(0);
  });

  test('Browse mode tile tap opens detail locally with ?id (no select intent)', async ({ page }) => {
    await browseOpt(page).click();
    await page.locator('.dock-tab[data-section="series"]').click();
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
    await page.locator('.dock-tab[data-section="series"]').click();
    await expect(page.locator('#txtgrid .ph-txt[data-id="bluey"]')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('grew-tv:nav-trail'))).not.toBeNull();
    await controlOpt(page).click();   // -> reSync: clearTrail() + reload
    await expect(page.locator('#section-dock .dock-tab').first()).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('grew-tv:nav-trail'))).toBeNull();
  });

  test('switch-profile greys out in Browse mode (no dead click)', async ({ page }) => {
    await expect(page.locator('#switch-profile')).not.toHaveClass(/desync-off/);
    await browseOpt(page).click();
    await expect(page.locator('#switch-profile')).toHaveClass(/desync-off/);
  });

  // TASK-408 story 4 — desynced, the row-step control reads as inactive (the
  // whole row dims, label included) and emits nothing.
  test('the ▲/▼ row-step row greys out and emits nothing in Browse mode', async ({ page }) => {
    await expect(page.locator('#row-step')).not.toHaveClass(/desync-off/);
    await browseOpt(page).click();
    await expect(page.locator('#row-step')).toHaveClass(/desync-off/);
    await page.locator('#row-step .row-step-btn[aria-label="Focus row down"]').click({ force: true });
    expect(intents.filter((i) => i.intent === 'navigate_down')).toHaveLength(0);
  });
});

// FEAT-040/TASK-255 — the MUSIC "🎵 (N)" queue button beside the video one (TASK-258
// compact label, de-purpled to match the video button):
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
    await expect(page.locator('#section-dock .dock-tab').first()).toBeVisible();  // settled
    await expect(page.locator('#btn-play-queue-music')).toBeHidden();
  });

  test('shows the count and drives the TV audio queue head', async ({ page }) => {
    const intents2 = [];
    await musicMock(page, intents2, [{ track_id: 'a' }, { track_id: 'b' }]);
    await page.goto('/companion/browse.html');
    await expect(page.locator('#btn-play-queue-music')).toHaveText('🎵 (2)');
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
    // TASK-412 — Mode now lives inside the header's popout menu.
    await page.locator('#btn-status').click();
    await page.locator('.seg-opt').filter({ hasText: 'Browse' }).click();
    await expect(page.locator('#btn-play-queue-music')).toHaveClass(/desync-off/);
  });

  // TASK-258 (3): the music queue button carries no purple `--accent` tint — its
  // border matches the video button + every other button (the white --focus).
  test('is de-purpled — its border matches the other buttons, not the accent', async ({ page }) => {
    await musicMock(page, [], [{ track_id: 'a' }]);
    await page.goto('/companion/browse.html');
    await expect(page.locator('#btn-play-queue-music')).toBeVisible();
    const border = await page.locator('#btn-play-queue-music').evaluate(el => getComputedStyle(el).borderTopColor);
    expect(border).toBe('rgb(255, 255, 255)');       // --focus white, NOT rgb(185, 140, 255) accent
  });
});

// TASK-258 (2): the VIDEO queue button reads a compact "🎬 (N)" — media icon +
// bracketed count, no "Video" word or list icon (mirrors the music button). A
// dedicated mock carries a `person` in app_state (the top-level mock omits it, so
// the queue is never fetched) + routes the GET video-playback snapshot's queue.
test.describe('video Play Queue button label (TASK-258)', () => {
  function videoMock(page, queue) {
    return page.routeWebSocket(/:8766/, (ws) => {
      ws.onMessage(function(raw) {
        const m = JSON.parse(raw);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') { ws.send(msg('context', { version: 2, context_id: 'browse' })); ws.send(msg('app_state', { screen: 'home', profile: 'kids', person: 'kids' })); }
      });
    }).then(() => page.route(/\/api\/video-playback\?/, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ person_id: 'kids', override_queue: queue }) })));
  }

  test('shows just the icon and bracketed count — no "Video" word', async ({ page }) => {
    await videoMock(page, [{ entry_id: 'e1' }, { entry_id: 'e2' }, { entry_id: 'e3' }]);
    await page.goto('/companion/browse.html');
    await expect(page.locator('#btn-play-queue')).toHaveText('🎬 (3)');
  });
});

// TASK-421 — the Music Videos twin of the companion film ＋ Queue control
// (tests/companion-film-queue.test.js): a music-video grid tile (an artist's
// rail, e.g. mv-01 on the QOTSA rail) gains the same ＋ Queue cell, wired to
// the SEPARATE music-video engine (FEAT-418) — never the film queue this same
// cell posts to for a plain video tile (story 3: the two engines stay apart).
test.describe('music-video ＋ Queue control (TASK-421)', () => {
  function mvMockApp(page) {
    return page.routeWebSocket(/:8766/, (ws) => {
      ws.onMessage(function(raw) {
        const m = JSON.parse(raw);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') { ws.send(msg('context', { version: 2, context_id: 'browse' })); ws.send(msg('app_state', { screen: 'home', profile: 'kids', person: 'kids' })); }
      });
    });
  }
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await mvMockApp(page);
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: {}, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    }));
    await page.goto('/companion/browse.html');
    await page.locator('.dock-tab[data-section="music-videos"]').click();
    await page.locator('#pager-next').click();               // mv-playlists -> Muse (A-Z before QOTSA)
    await page.locator('#pager-next').click();               // Muse -> the QOTSA artist rail
    await expect(page.locator('#pager-name')).toHaveText('QOTSA');
    await expect(page.locator('#txtgrid .ph-txt[data-id="mv-01"]')).toBeVisible();
  });

  test('a music-video grid tile carries a ＋ Queue control', async ({ page }) => {
    await expect(page.locator('.ph-txt-cell .ph-cell-queue[data-queue="mv-01"]')).toHaveText('＋');
  });

  test('＋ Queue POSTs to the music-video engine, not the film queue, and confirms with a toast', async ({ page }) => {
    let filmQueued = false;
    await page.route('**/api/video-playback/queue-video**', route => { filmQueued = true; return route.fulfill({ status: 204, body: '' }); });
    await page.route('**/api/music-video-playback/queue-video**', route => route.fulfill({ status: 204, body: '' }));
    const queued = page.waitForRequest(req =>
      req.url().includes('/api/music-video-playback/queue-video') && req.method() === 'POST');
    await page.locator('.ph-cell-queue[data-queue="mv-01"]').click();
    const req = await queued;
    expect(req.url()).toContain('person=kids');
    expect(JSON.parse(req.postData())).toEqual({ video_id: 'mv-01' });
    await expect(page.locator('#queue-status')).toHaveText('Queued to Play Next');
    expect(filmQueued).toBe(false);
  });

  // BUG (found in real-device testing after TASK-421 shipped): a real touch tap
  // is almost never pixel-stationary — a few px of incidental jitter between
  // touchstart/touchend is normal. The #txtgrid swipe-pager (TASK-411) armed its
  // click-swallow guard (settleDrag -> guardClick) off `d.active`, which only
  // needs ACTIVATE_THRESHOLD (8px) — far short of the 40px SWIPE_THRESHOLD a
  // drag needs to actually change rail. So an 8-39px jitter never paged
  // anywhere, yet still ate that same tap's own click, making the ＋ Queue
  // badge (and any tile) need a 2nd, steadier press most of the time.
  test('a jittery-but-stationary tap (8-39px, never enough to page) still queues on the FIRST press', async ({ page }) => {
    await page.route('**/api/music-video-playback/queue-video**', route => route.fulfill({ status: 204, body: '' }));
    const queued = page.waitForRequest(req =>
      req.url().includes('/api/music-video-playback/queue-video') && req.method() === 'POST');
    const box = await page.locator('.ph-cell-queue[data-queue="mv-01"]').boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 9, y + 2, { steps: 5 }); // 9px horizontal jitter, below the 40px page threshold
    await page.mouse.up();
    const req = await queued;
    expect(req.url()).toContain('person=kids');
    // The rail must NOT have paged away (9px never reaches SWIPE_THRESHOLD).
    await expect(page.locator('#pager-name')).toHaveText('QOTSA');
  });

  // BUG (found in real-device testing AFTER the jitter fix above shipped): a
  // real TOUCH drag that actually pages never fires a trailing `click` at all
  // — browsers suppress the synthesized click once a touch gesture reads as a
  // drag/scroll; only a MOUSE always fires one on release, regardless of
  // movement (confirmed live: a real CDP-dispatched touch swipe against the
  // dev server produced zero `click` events on #txtgrid). guardClick() arms a
  // { once: true } listener hoping to swallow THAT click, but on a real touch
  // drag no such click ever arrives to consume it — so it stays armed and
  // silently eats the caller's NEXT, entirely unrelated tap instead (e.g. a
  // ＋ Queue press right after paging to the rail that press landed on),
  // needing a 2nd press to register. Reproduced here with raw PointerEvents
  // (deterministic, no dependency on a given browser's own touch/click
  // suppression heuristics) — drag past SWIPE_THRESHOLD with NO trailing
  // click, exactly what a real touch drag leaves behind, then a normal
  // (mouse) click on the landed rail's ＋ Queue badge, which must not be eaten.
  test('a drag that pages but leaves no trailing click must not eat the caller\'s NEXT tap', async ({ page }) => {
    await page.route('**/api/music-video-playback/queue-video**', route => route.fulfill({ status: 204, body: '' }));

    await page.evaluate(() => {
      var el = document.getElementById('txtgrid');
      function fire(type, x) {
        el.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: 0, bubbles: true, cancelable: true }));
      }
      fire('pointerdown', 100);
      fire('pointermove', 130); // past ACTIVATE_THRESHOLD, activates the drag
      fire('pointermove', 190); // past SWIPE_THRESHOLD (+90px, rightward = prev)
      fire('pointerup', 190);
      // Deliberately no 'click' dispatched — this is what a real touch drag leaves behind.
    });
    await expect(page.locator('#pager-name')).toHaveText('Muse'); // the drag paged, exactly as intended (QOTSA -> prev)

    const queued = page.waitForRequest(req =>
      req.url().includes('/api/music-video-playback/queue-video') && req.method() === 'POST');
    await page.locator('.ph-cell-queue[data-queue="mv-03"]').click(); // a normal, later tap on the landed rail
    const req = await queued; // must queue on this FIRST tap, not need a 2nd
    expect(req.url()).toContain('person=kids');
  });

  // BUG-438 (found in real-device testing after the two guardClick fixes
  // above shipped): a tap landing on the JUST-PAGED rail's own tile, before
  // the slide-out/slide-in transition (TASK-433, var(--dur) ~180ms) finishes,
  // still went nowhere — a DIFFERENT mechanism than guardClick. slideToRail
  // pinned the incoming layer a fixed screen-width away (dir*100%) regardless
  // of how far the live drag had already carried the outgoing #txtgrid, so
  // the two layers didn't tile: the incoming layer had strictly farther left
  // to travel than the outgoing layer's remaining distance, in the SAME fixed
  // duration, leaving a real gap neither layer painted for part of the
  // transition — a tap there hit #txtgrid-viewport itself, not a tile.
  // Compounding it: that same tap's own pointerdown (bubbling to #grid-wrap)
  // was treated as a fresh drag-gesture start regardless, and its
  // unconditional `#txtgrid.style.transition = 'none'` froze the outgoing
  // layer's OWN transition mid-flight while the incoming layer kept
  // animating — breaking the tiling all over again even after the first fix.
  // Reproduced at a FIXED pre-drag screen coordinate (the landing rail's tile
  // occupies the same single-column slot) shortly after release, well inside
  // var(--dur) — a real "swipe, then immediately tap" gesture. The assertion
  // is deliberately loose about WHICH tile a that-early tap lands on (the
  // outgoing rail's own tile is still legitimately live mid-transition, same
  // as any animating UI) — the bug this guards is landing on NOTHING at all.
  test('a tap on the landed rail while the slide transition is still animating must not be swallowed', async ({ page }) => {
    await page.route('**/api/music-video-playback/queue-video**', route => route.fulfill({ status: 204, body: '' }));
    const box = await page.locator('.ph-txt[data-id="mv-01"]').boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.evaluate(() => {
      var el = document.getElementById('txtgrid');
      function fire(type, cx) {
        el.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: cx, clientY: 0, bubbles: true, cancelable: true }));
      }
      fire('pointerdown', 100);
      fire('pointermove', 130); // past ACTIVATE_THRESHOLD, activates the drag
      fire('pointermove', 190); // past SWIPE_THRESHOLD (+90px, rightward = prev), QOTSA -> Muse
      fire('pointerup', 190);
    });

    const hitPromise = page.evaluate(() => new Promise((resolve) => {
      document.addEventListener('click', function(e) {
        resolve(!!e.target.closest('button'));
      }, { capture: true, once: true });
    }));
    await page.waitForTimeout(30); // a real finger's fastest realistic re-press, still well inside var(--dur)
    await page.mouse.click(x, y);
    const hitARealButton = await hitPromise;
    expect(hitARealButton).toBe(true); // must land on SOME tile, never the bare #txtgrid-viewport/#grid-wrap
  });
});
