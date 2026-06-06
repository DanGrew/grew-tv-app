const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// Progress is keyed by video id in v3 (matching /api/progress).
const VIDEO_ID = 'toy-story-main';
const RESUME_KEY = `grew-tv:position:${VIDEO_ID}`;

async function goToBrowse(page) {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
}

async function setResumePosition(page, seconds) {
  await page.evaluate(({ key, val }) => localStorage.setItem(key, val), { key: RESUME_KEY, val: String(seconds) });
}

async function mockVideoReady(page) {
  await page.evaluate(() => {
    const v = document.getElementById('video');
    Object.defineProperty(v, 'readyState', { get: () => 1, configurable: true });
    v.play = () => Promise.resolve();
  });
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.goto('/app/homeview/profile.html');
});

// --- prompt visibility ---

test('no saved position — video plays directly without resume prompt', async ({ page }) => {
  await goToBrowse(page);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#screen-resume')).not.toBeVisible();
});

test('saved position > 5s — resume prompt shown instead of video', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 300);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await expect(page.locator('#screen-resume')).toBeVisible();
  await expect(page.locator('#screen-video')).not.toBeVisible();
});

test('saved position <= 5s — treated as no position, plays directly', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 4);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#screen-resume')).not.toBeVisible();
});

// --- prompt content ---

test('resume prompt shows formatted saved time', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 125);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await expect(page.locator('#screen-resume')).toBeVisible();
  await expect(page.locator('#resume-time')).toHaveText('2:05');
});

test('resume prompt focuses Resume button on enter', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 300);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await expect(page.locator('#btn-resume')).toBeFocused();
});

// --- Restart ---

test('Restart shows video screen', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 300);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await page.locator('#btn-restart').click();
  await expect(page.locator('#screen-video')).toBeVisible();
});

test('Restart clears saved position from localStorage', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 300);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await page.locator('#btn-restart').click();
  const saved = await page.evaluate(key => localStorage.getItem(key), RESUME_KEY);
  expect(saved).toBeNull();
});

// --- Resume ---

test('Resume shows video screen', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 300);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await mockVideoReady(page);
  await page.locator('#btn-resume').click();
  await expect(page.locator('#screen-video')).toBeVisible();
});

test('Resume seeks video to saved position', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 300);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await mockVideoReady(page);
  await page.locator('#btn-resume').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(300);
});

// --- keyboard navigation ---

test('ArrowRight moves focus from Resume to Restart', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 300);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await expect(page.locator('#btn-resume')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-restart')).toBeFocused();
});

test('ArrowLeft moves focus from Restart to Resume', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 300);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await page.locator('#btn-restart').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#btn-resume')).toBeFocused();
});

test('Escape from resume prompt acts as Restart', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 300);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await expect(page.locator('#screen-resume')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-video')).toBeVisible();
  const saved = await page.evaluate(key => localStorage.getItem(key), RESUME_KEY);
  expect(saved).toBeNull();
});

test('Backspace from resume prompt acts as Restart', async ({ page }) => {
  await goToBrowse(page);
  await setResumePosition(page, 300);
  await page.locator(`.film-tile[data-id=${VIDEO_ID}]`).click();
  await expect(page.locator('#screen-resume')).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(page.locator('#screen-video')).toBeVisible();
});

// --- detail screen indicator ---

test('detail row shows position indicator when saved position exists', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('grew-tv:position:bluey-s1e01', '125'));
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile[data-id="bluey"]').click();
  await expect(page.locator('.detail-resume').first()).toContainText('2:05');
});

test('detail row shows no indicator when no saved position', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile[data-id="bluey"]').click();
  await expect(page.locator('.detail-resume')).toHaveCount(0);
});
