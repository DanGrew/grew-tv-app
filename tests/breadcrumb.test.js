const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

const SERIES_TILE = '.film-tile[data-id="bluey"]';
const FILM_TILE = '.film-tile[data-id="toy-story-main"]';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('browse shows a single non-clickable Home crumb', async ({ page }) => {
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveCount(0);
});

test('detail shows Home (clickable) then the series as current', async ({ page }) => {
  await page.locator(SERIES_TILE).click();
  await expect(page.locator('#screen-detail')).toBeVisible();
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Bluey');
});

test('clicking the Home crumb on detail returns to browse', async ({ page }) => {
  await page.locator(SERIES_TILE).click();
  await expect(page.locator('#screen-detail')).toBeVisible();
  await page.locator('#breadcrumb .crumb-link').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('ArrowUp from Play next reaches the Home crumb, Enter navigates home', async ({ page }) => {
  await page.locator(SERIES_TILE).click();
  await expect(page.locator('#screen-detail')).toBeVisible();
  await expect(page.locator('.detail-row').first()).toBeVisible();
  await expect(page.locator('#btn-play-next')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#breadcrumb .crumb-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('series episode shows Home > Series > Episode trail', async ({ page }) => {
  await page.goto('/app/homeview/video.html?video=bluey-s1e03&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Bluey']);
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Hammerbarn');
});

test('clicking the series crumb on the player opens that series detail', async ({ page }) => {
  await page.goto('/app/homeview/video.html?video=bluey-s1e03&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.locator('#breadcrumb .crumb-link', { hasText: 'Bluey' }).click();
  await expect(page.locator('#screen-detail')).toBeVisible();
  await expect(page.locator('#detail-title')).toContainText('Bluey');
});

test('a film player shows Home > Title (no series crumb)', async ({ page }) => {
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(FILM_TILE).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText('Home');
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Toy Story');
});
