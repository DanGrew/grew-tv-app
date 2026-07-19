const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// FEAT-028 (TASK-167) — the L3 "rail grid" page: a full poster grid of one
// (section, rail), styled to the existing browse, breadcrumb Home > Section >
// Rail, tile select routes to the existing item detail/player.

// kids/films/genre:animation = Toy Story (genres animation,comedy) + Finding Nemo
// (genres null -> [type]=['animation']). kids/series/genre:animation = Bluey.
const FILMS_ANIMATION = '/app/homeview/rail-grid.html?section=films&rail=genre:animation';
const SERIES_ANIMATION = '/app/homeview/rail-grid.html?section=series&rail=genre:animation';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('renders every item in the rail as a tile', async ({ page }) => {
  await page.goto(FILMS_ANIMATION);
  await expect(page.locator('#screen-rail-grid')).toBeVisible();
  await expect(page.locator('#rail-grid .film-tile')).toHaveCount(2);
  await expect(page.locator('.film-tile[data-id="toy-story-main"]')).toBeVisible();
  await expect(page.locator('.film-tile[data-id="finding-nemo-main"]')).toBeVisible();
});

test('shows the section and rail in the title', async ({ page }) => {
  await page.goto(FILMS_ANIMATION);
  await expect(page.locator('#grid-title')).toHaveText('Films · Animation');
});

test('breadcrumb is Home > Section > Rail, each ancestor clickable', async ({ page }) => {
  await page.goto(FILMS_ANIMATION);
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Films']);
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Animation');
});

test('the section crumb returns to browse on that section tab', async ({ page }) => {
  await page.goto(FILMS_ANIMATION);
  await page.locator('#breadcrumb .crumb-link', { hasText: 'Films' }).click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('.sidebar-tab.active')).toHaveText('Films');
});

test('selecting a film tile routes to the player', async ({ page }) => {
  await page.goto(FILMS_ANIMATION);
  await page.locator('.film-tile[data-id="toy-story-main"]').click();
  await page.waitForURL(/video\.html\?video=toy-story-main/);
  await expect(page.locator('#screen-video')).toBeVisible();
});

test('selecting a series tile routes to its detail', async ({ page }) => {
  await page.goto(SERIES_ANIMATION);
  await expect(page.locator('#rail-grid .film-tile')).toHaveCount(1);
  await page.locator('.film-tile[data-id="bluey"]').click();
  await page.waitForURL(/detail\.html\?series=bluey/);
  await expect(page.locator('#screen-detail')).toBeVisible();
});

test('d-pad: ArrowRight moves focus across tiles, ArrowUp reaches the breadcrumb', async ({ page }) => {
  await page.goto(FILMS_ANIMATION);
  // Rail items sort A-Z, so Finding Nemo lands before Toy Story.
  await expect(page.locator('.film-tile[data-id="finding-nemo-main"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.film-tile[data-id="toy-story-main"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#breadcrumb .crumb-link').first()).toBeFocused();
});

test('tiles are real posters (this is the TV grid, not the text companion)', async ({ page }) => {
  await page.goto(FILMS_ANIMATION);
  await expect(page.locator('#rail-grid .film-tile .film-poster').first()).toBeAttached();
});

// TASK-360 — a grid holds far more tiles than fit on screen, and each poster costs
// a download AND a main-thread JPEG decode. Both attributes are one-line deletions
// that break nothing observable: the grid still renders, it just goes back to
// eagerly fetching and decoding art nobody scrolled to, which is what bogs down the
// weak TV client. Only this assertion notices.
test('posters defer off-screen loading and decode off the critical path', async ({ page }) => {
  await page.goto(FILMS_ANIMATION);
  const poster = page.locator('#rail-grid .film-tile .film-poster').first();
  await expect(poster).toHaveAttribute('loading', 'lazy');
  await expect(poster).toHaveAttribute('decoding', 'async');
});

// BUG-049 — the Music "Recently Played" rail must build on the TV rail-grid page,
// the same as browse. It's the L3 the companion drives when you drill into Recently
// Played; the page must pass `recents` (off the continue-watching response) into
// buildTabRails. Without it the rail comes back empty ("Nothing here yet"), and its
// synthesised artist tile never lands in the page's `catalog`, so a companion
// `select` on an artist-source recent is a silent no-op (no navigation).
test.describe('BUG-049: Recently Played rail on the rail-grid (recents threaded)', () => {
  const RECENT = '/app/homeview/rail-grid.html?section=music&rail=recent';
  test.beforeEach(async ({ page }) => {
    // Music + playlist cards in the catalog so recents can resolve album/playlist/
    // artist tiles, and populated recents on the CW response (newest-first: an
    // artist "play all", a playlist, an album).
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS) })
    }));
    await page.route('**/api/continue-watching**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', content: [], recents: [
        { source_type: 'artist',   source_id: 'ELO',         last_played: 3 },
        { source_type: 'playlist', source_id: 'pl-roadtrip', last_played: 2 },
        { source_type: 'album',    source_id: 'ootb',        last_played: 1 }
      ] })
    }));
  });

  test('renders the recents tiles (not "Nothing here yet")', async ({ page }) => {
    await page.goto(RECENT);
    await expect(page.locator('#screen-rail-grid')).toBeVisible();
    await expect(page.locator('#rail-grid .home-empty')).toHaveCount(0);
    await expect(page.locator('#grid-title')).toHaveText('Music · Recently Played');
    // Newest-first, order preserved: artist:ELO, pl-roadtrip, ootb.
    await expect(page.locator('#rail-grid .film-tile')).toHaveCount(3);
    await expect(page.locator('.film-tile[data-id="artist:ELO"]')).toBeVisible();
    await expect(page.locator('.film-tile[data-id="pl-roadtrip"]')).toBeVisible();
    await expect(page.locator('.film-tile[data-id="ootb"]')).toBeVisible();
  });

  test('selecting the artist-source recent routes to the artist page', async ({ page }) => {
    await page.goto(RECENT);
    await page.locator('.film-tile[data-id="artist:ELO"]').click();
    await page.waitForURL(/artist\.html\?artist=ELO/);
    await expect(page.locator('#screen-artist')).toBeVisible();
  });

  test('selecting the playlist recent routes to the playlist detail', async ({ page }) => {
    await page.goto(RECENT);
    await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
    await page.waitForURL(/playlist-detail\.html\?playlist=pl-roadtrip/);
  });
});
