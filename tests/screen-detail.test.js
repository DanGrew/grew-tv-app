const { test, expect } = require('@playwright/test');

const MANIFEST_URL = 'http://localhost:8765/manifest.json';
const FIXTURE = require('./fixtures/manifest-multi.js');

async function interceptManifest(page) {
  await page.route(MANIFEST_URL, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(FIXTURE.manifest)
  }));
}

test.beforeEach(async ({ page }) => {
  await interceptManifest(page);
  await page.goto('/app/homeview/profile.html');
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

async function openDetail(page) {
  await page.locator('.film-tile').nth(1).click();
  await expect(page.locator('#screen-detail')).toBeVisible();
  await expect(page.locator('.detail-row').first()).toBeVisible();
}

test('multi-item tile opens detail screen, not video', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('#screen-video')).not.toBeVisible();
  await expect(page.locator('#detail-title')).toContainText('Test Series');
});

test('detail onEnter focuses first available row', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('.detail-row').first()).toBeFocused();
});

test('detail renders all items as rows', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('.detail-row')).toHaveCount(3);
});

test('ArrowDown moves focus to next detail row', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.detail-row').nth(1)).toBeFocused();
});

test('ArrowUp moves focus to previous detail row', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').nth(1).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.detail-row').first()).toBeFocused();
});

test('ArrowUp at first row does not move focus', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.detail-row').first()).toBeFocused();
});

test('Escape from detail returns to browse', async ({ page }) => {
  await openDetail(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('#screen-detail')).not.toBeVisible();
});

test('Backspace from detail returns to browse', async ({ page }) => {
  await openDetail(page);
  await page.keyboard.press('Backspace');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('back button from detail returns to browse', async ({ page }) => {
  await openDetail(page);
  await page.locator('#btn-back-detail').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('browse source tile is re-focused on back from detail', async ({ page }) => {
  const secondTile = page.locator('.film-tile').nth(1);
  await secondTile.focus();
  await secondTile.click();
  await expect(page.locator('#screen-detail')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(secondTile).toBeFocused();
});

test('Enter on detail row plays video', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
});

test('Escape from video after detail returns to detail', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.locator('#btn-back-video').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-detail')).toBeVisible();
});

test('Escape on browse does not crash or navigate away', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('video onEnter focuses play-pause button', async ({ page }) => {
  await page.locator('.film-tile').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
});

test.describe('error screen entry', () => {
  test('error onEnter focuses retry button', async ({ page }) => {
    await page.route(MANIFEST_URL, route => route.fulfill({ status: 500 }));
    await page.goto('/app/homeview/profile.html');
    await page.locator('#btn-kids').click();
    await expect(page.locator('#screen-error')).toBeVisible();
    await expect(page.locator('#btn-retry')).toBeFocused();
  });
});
