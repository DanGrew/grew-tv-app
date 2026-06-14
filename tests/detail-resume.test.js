const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-017 / TASK-118: the standalone resume/restart prompt is gone. Progress
// is backend state (/api/progress + /api/continue-watching), not localStorage.
// A film resumes silently; a series episode shows its resume on the detail row
// (a mini progress bar + a Restart secondary control) and resumes by default.

const FILM = 'toy-story-main';
const EP1 = 'bluey-s1e01';

function cwRoute(content) {
  return route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: content })
  });
}

const MID_WATCH = [{ item_id: EP1, position_secs: 200, duration_secs: 420, last_watched: 1000 }];

async function goToBrowse(page) {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
}

async function openBluey(page) {
  await goToBrowse(page);
  await page.locator('.film-tile[data-id="bluey"]').click();
  await expect(page.locator('#screen-detail')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.goto('/app/homeview/profile.html');
});

test('film plays directly — no resume/restart prompt exists', async ({ page }) => {
  await goToBrowse(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#screen-resume')).toHaveCount(0);
});

test('mid-watch episode row shows a progress bar and a Restart control', async ({ page }) => {
  await page.route('**/api/continue-watching**', cwRoute(MID_WATCH));
  await openBluey(page);
  const row = page.locator(`.detail-row[data-id="${EP1}"]`);
  await expect(row.locator('.detail-progress')).toBeVisible();
  await expect(row.locator('.detail-restart')).toBeVisible();
});

test('mid-watch episode row carries a RESUME tag with the time left (TASK-136)', async ({ page }) => {
  await page.route('**/api/continue-watching**', cwRoute(MID_WATCH));
  await openBluey(page);
  await expect(page.locator(`.detail-row[data-id="${EP1}"] .detail-tag`)).toHaveText('RESUME · 3:40 left');
});

test('header action reads "Continue" for a mid-watch episode (TASK-136)', async ({ page }) => {
  await page.route('**/api/continue-watching**', cwRoute(MID_WATCH));
  await openBluey(page);
  await expect(page.locator('#btn-play-next')).toContainText('Continue — "Daddy Putdown" (1)');
});

test('fresh episode row has no progress bar or Restart control', async ({ page }) => {
  await openBluey(page);
  const row = page.locator('.detail-row[data-id="bluey-s1e02"]');
  await expect(row.locator('.detail-progress')).toHaveCount(0);
  await expect(row.locator('.detail-restart')).toHaveCount(0);
  await expect(row.locator('.detail-reset')).toHaveCount(0);
});

test('mid-watch row shows a Reset control next to Restart (TASK-142)', async ({ page }) => {
  await page.route('**/api/continue-watching**', cwRoute(MID_WATCH));
  await openBluey(page);
  await expect(page.locator(`.detail-row[data-id="${EP1}"] .detail-reset`)).toBeVisible();
});

test('Reset needs two presses: first arms, second clears progress (TASK-142)', async ({ page }) => {
  // CW reports the episode mid-watch until the reset DELETE fires (browse AND
  // detail both fetch CW, so a call-counter is wrong — gate on the delete). After
  // the DELETE the refresh re-pulls CW empty, so the row re-renders unwatched.
  let deleted = false;
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: deleted ? [] : MID_WATCH })
  }));
  let deleteMethod = null;
  await page.route('**/api/progress/**', route => {
    deleteMethod = route.request().method();
    deleted = true;
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ item_id: EP1, position_secs: 0, duration_secs: null, completed: false, last_watched: null })
    });
  });
  await openBluey(page);
  const reset = page.locator(`.detail-row[data-id="${EP1}"] .detail-reset`);
  // First press arms the confirm — no DELETE yet.
  await reset.click();
  await expect(reset).toHaveText('Reset?');
  expect(deleteMethod).toBeNull();
  // Second press fires the DELETE and the row clears.
  await reset.click();
  expect(deleteMethod).toBe('DELETE');
  const row = page.locator(`.detail-row[data-id="${EP1}"]`);
  await expect(row.locator('.detail-progress')).toHaveCount(0);
  await expect(row.locator('.detail-restart')).toHaveCount(0);
  await expect(row.locator('.detail-reset')).toHaveCount(0);
});

test('blurring an armed Reset disarms it (TASK-142)', async ({ page }) => {
  await page.route('**/api/continue-watching**', cwRoute(MID_WATCH));
  await openBluey(page);
  const reset = page.locator(`.detail-row[data-id="${EP1}"] .detail-reset`);
  await reset.click();
  await expect(reset).toHaveText('Reset?');
  await page.locator('#btn-play-next').focus();
  await expect(reset).toHaveText('Reset');
});

test('ArrowRight steps row → Restart → Reset (TASK-142)', async ({ page }) => {
  await page.route('**/api/continue-watching**', cwRoute(MID_WATCH));
  await openBluey(page);
  const row = page.locator(`.detail-row[data-id="${EP1}"]`);
  await row.focus();
  await page.keyboard.press('ArrowRight');
  await expect(row.locator('.detail-restart')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(row.locator('.detail-reset')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(row.locator('.detail-restart')).toBeFocused();
});

test('Restart control on a mid-watch row plays the episode', async ({ page }) => {
  await page.route('**/api/continue-watching**', cwRoute(MID_WATCH));
  await openBluey(page);
  await page.locator(`.detail-row[data-id="${EP1}"] .detail-restart`).click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', new RegExp(EP1));
});

test('Play next header action plays an episode', async ({ page }) => {
  await openBluey(page);
  await expect(page.locator('#btn-play-next')).toBeFocused();
  await page.locator('#btn-play-next').click();
  await expect(page.locator('#screen-video')).toBeVisible();
});
