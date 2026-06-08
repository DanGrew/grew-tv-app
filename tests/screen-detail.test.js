const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// Host-agnostic: the app derives its backend from the page origin (BUG-009).
const BROWSE_URL = '**/api/browse**';

// Home rails (TASK-117): tiles are addressed by data-id, not grid position.
const SERIES_TILE = '.film-tile[data-id="bluey"]';
const VIDEO_TILE = '.film-tile[data-id="toy-story-main"]';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.goto('/app/homeview/profile.html');
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

async function openDetail(page) {
  await page.locator(SERIES_TILE).click();
  await expect(page.locator('#screen-detail')).toBeVisible();
  await expect(page.locator('.detail-row').first()).toBeVisible();
}

test('series tile opens detail screen, not video', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('#screen-video')).not.toBeVisible();
  await expect(page.locator('#detail-title')).toContainText('Bluey');
});

test('detail onEnter focuses the Play next action', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('#btn-play-next')).toBeFocused();
});

test('detail renders all series items as rows', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('.detail-row')).toHaveCount(3);
});

test('detail header shows the series poster art (TASK-121)', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('#detail-header-poster')).toHaveAttribute('src', /bluey\.jpg$/);
});

test('detail groups episodes under a season header', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('.detail-season')).toHaveCount(1);
  await expect(page.locator('.detail-season').first()).toContainText('Season 1');
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

test('ArrowUp from first row moves focus to Play next', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#btn-play-next')).toBeFocused();
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
  const seriesTile = page.locator(SERIES_TILE);
  await seriesTile.focus();
  await seriesTile.click();
  await expect(page.locator('#screen-detail')).toBeVisible();
  await expect(page.locator('.detail-row').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(seriesTile).toBeFocused();
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
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-detail')).toBeVisible();
});

test('series video shows Up next countdown then advances on end', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#upnext-overlay')).toBeVisible();
  await expect(page.locator('#upnext-text')).toContainText('The Weekend');
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/, { timeout: 8000 });
});

test('last episode end returns to detail (no next)', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').nth(2).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e03/);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#screen-detail')).toBeVisible();
});

test('Escape on browse does not crash or navigate away', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('video onEnter focuses play-pause button', async ({ page }) => {
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(VIDEO_TILE).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
});

test.describe('error screen entry', () => {
  test('error onEnter focuses retry button', async ({ page }) => {
    await page.route(BROWSE_URL, route => route.fulfill({ status: 500 }));
    await page.goto('/app/homeview/profile.html');
    await page.locator('#btn-kids').click();
    await expect(page.locator('#screen-error')).toBeVisible();
    await expect(page.locator('#btn-retry')).toBeFocused();
  });
});
