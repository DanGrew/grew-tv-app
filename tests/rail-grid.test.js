const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

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
  await page.locator('#btn-kids').click();
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
