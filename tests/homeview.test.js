const { test, expect } = require('@playwright/test');
const path = require('path');

const MANIFEST_URL = 'http://localhost:8080/grew-tv/content/manifest.json';
const FIXTURE = require('./fixtures/manifest.js');

async function interceptManifest(page, data) {
  await page.route(MANIFEST_URL, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data)
  }));
}

async function interceptManifestError(page) {
  await page.route(MANIFEST_URL, route => route.fulfill({ status: 500 }));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/app/homeview/index.html');
});

test('profile screen shown on load, Kids button focused', async ({ page }) => {
  await expect(page.locator('#screen-profile')).toBeVisible();
  await expect(page.locator('#btn-kids')).toBeFocused();
});

test('click Kids loads browse grid with kids films', async ({ page }) => {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('.film-tile')).toHaveCount(2);
  await expect(page.locator('.tile-title').first()).toContainText('Toy Story');
});

test('click Adults loads browse grid with all films', async ({ page }) => {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-adults').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('.film-tile')).toHaveCount(3);
});

test('Kids profile does not show adults-only films', async ({ page }) => {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  const titles = await page.locator('.tile-title').allTextContents();
  expect(titles).not.toContain('The Dark Knight');
});

test('Adults profile shows all films', async ({ page }) => {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-adults').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  const titles = await page.locator('.tile-title').allTextContents();
  expect(titles).toContain('The Dark Knight');
});

test('manifest 500 shows error screen', async ({ page }) => {
  await interceptManifestError(page);
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-error')).toBeVisible();
  await expect(page.locator('#screen-browse')).not.toBeVisible();
});

test('retry button on error returns to profile select', async ({ page }) => {
  await interceptManifestError(page);
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-error')).toBeVisible();
  await page.locator('#btn-retry').click();
  await expect(page.locator('#screen-profile')).toBeVisible();
});

test('select film shows video screen with src set', async ({ page }) => {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  const src = await page.locator('#video').getAttribute('src');
  expect(src).toBeTruthy();
  expect(src).toContain('toy-story');
});

test('back button returns to browse screen', async ({ page }) => {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.locator('#btn-back-video').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('Escape key returns to browse screen', async ({ page }) => {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.locator('#btn-back-video').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('focus returns to first grid tile after back', async ({ page }) => {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile').first().click();
  await page.locator('#btn-back-video').click();
  await expect(page.locator('.film-tile').first()).toBeFocused();
});

test('Enter on focused tile opens video screen', async ({ page }) => {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
});

test('arrow keys navigate between film tiles', async ({ page }) => {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  const firstTile = page.locator('.film-tile').nth(0);
  const secondTile = page.locator('.film-tile').nth(1);
  await firstTile.focus();
  await expect(firstTile).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(secondTile).toBeFocused();
});
