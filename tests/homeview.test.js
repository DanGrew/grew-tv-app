const { test, expect } = require('@playwright/test');
const path = require('path');

const MANIFEST_URL = 'http://localhost:8765/manifest.json';
const FIXTURE = require('./fixtures/manifest.js');

async function interceptManifest(page, fixture) {
  await page.route(MANIFEST_URL, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(fixture.manifest)
  }));
}

async function interceptManifestError(page) {
  await page.route(MANIFEST_URL, route => route.fulfill({ status: 500 }));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/app/homeview/profile.html');
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

async function goToVideoScreen(page) {
  await interceptManifest(page, FIXTURE);
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
}

async function mockVideoTime(page, currentTime, duration) {
  await page.evaluate(({ ct, dur }) => {
    const v = document.getElementById('video');
    let _time = ct;
    Object.defineProperty(v, 'duration', { get: () => dur, configurable: true });
    Object.defineProperty(v, 'currentTime', {
      get: () => _time,
      set: val => { _time = val; },
      configurable: true
    });
  }, { ct: currentTime, dur: duration });
}

test('skip row shows two skip buttons', async ({ page }) => {
  await goToVideoScreen(page);
  await expect(page.locator('#btn-skip-back')).toBeVisible();
  await expect(page.locator('#btn-skip-fwd')).toBeVisible();
});

test('clicking skip-fwd opens popup', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-skip-fwd').click();
  await expect(page.locator('.skip-popup')).toBeVisible();
});

test('clicking skip-back opens popup', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-skip-back').click();
  await expect(page.locator('.skip-popup')).toBeVisible();
});

test('popup shows 6 options', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-skip-fwd').click();
  await expect(page.locator('.skip-popup button')).toHaveCount(6);
});

test('popup default focus is 10s option', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-skip-fwd').click();
  await expect(page.locator('.skip-popup button[data-delta="10"]')).toBeFocused();
});

test('forward skip via popup adds delta to currentTime', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-skip-fwd').click();
  await page.locator('.skip-popup button[data-delta="10"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(610);
});

test('back skip via popup subtracts delta from currentTime', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-skip-back').click();
  await page.locator('.skip-popup button[data-delta="-10"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(590);
});

test('back skip clamps to 0', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 5, 3600);
  await page.locator('#btn-skip-back').click();
  await page.locator('.skip-popup button[data-delta="-30"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(0);
});

test('forward skip clamps to duration', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 3590, 3600);
  await page.locator('#btn-skip-fwd').click();
  await page.locator('.skip-popup button[data-delta="30"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(3600);
});

test('selecting popup option closes popup', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-skip-fwd').click();
  await page.locator('.skip-popup button[data-delta="10"]').click();
  await expect(page.locator('.skip-popup')).toHaveCount(0);
});

test('Escape closes popup without seeking', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-skip-fwd').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.skip-popup')).toHaveCount(0);
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(600);
});

test('Backspace closes popup without seeking', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-skip-back').click();
  await page.keyboard.press('Backspace');
  await expect(page.locator('.skip-popup')).toHaveCount(0);
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(600);
});

test('ArrowDown in popup moves focus to next option', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-skip-fwd').click();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.skip-popup button[data-delta="30"]')).toBeFocused();
});

test('ArrowUp in popup moves focus to previous option', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-skip-fwd').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.skip-popup button[data-delta="10"]')).toBeFocused();
});

test('Enter in popup selects focused option and closes', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-skip-fwd').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.skip-popup')).toHaveCount(0);
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(630);
});

test('ArrowRight from skip-back focuses play-pause', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-skip-back').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-play-pause')).toBeFocused();
});

test('ArrowLeft from skip-fwd focuses play-pause', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-skip-fwd').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#btn-play-pause')).toBeFocused();
});

test('ArrowDown from skip row focuses back button', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-skip-back').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-back-video')).toBeFocused();
});

test('ArrowUp from back button focuses play-pause button', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-back-video').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#btn-play-pause')).toBeFocused();
});
