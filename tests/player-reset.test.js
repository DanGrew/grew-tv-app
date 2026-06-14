const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// TASK-142: a single Reset control in the player clears this item's backend
// progress for the active person, then exits. Covers films/episodes (video
// player) and tracks (audio player) — everything direct-play goes through a
// player, so one button per player covers it all. Two-press confirm (arm ->
// "Reset?" -> fire) guards a mis-tap; the reset DELETEs and navigates away.

const FILM = 'toy-story-main';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

async function enterKids(page) {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
}

// Capture the method hitting /api/progress and answer 200 zero-state. Returns a
// getter so the test can assert the DELETE fired (and not before).
async function captureProgress(page) {
  const calls = [];
  await page.route('**/api/progress/**', route => {
    calls.push(route.request().method());
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ item_id: 'x', position_secs: 0, duration_secs: null, completed: false, last_watched: null })
    });
  });
  return () => calls;
}

test('video player shows a Reset control', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-reset')).toBeVisible();
});

test('video Reset needs two presses, DELETEs progress, then exits the player', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  const methods = await captureProgress(page);
  // Keep the controls up before interacting (they auto-hide after a few seconds).
  await page.locator('#screen-video').click();
  const reset = page.locator('#btn-reset');
  await reset.click();
  await expect(reset).toHaveText('Reset?');
  expect(methods()).not.toContain('DELETE');
  await reset.click();
  expect(methods()).toContain('DELETE');
  // Reset exits the player back to where it came from.
  await expect(page.locator('#screen-video')).not.toBeVisible();
});

test('blurring an armed video Reset disarms it', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.locator('#screen-video').click();
  const reset = page.locator('#btn-reset');
  await reset.click();
  await expect(reset).toHaveText('Reset?');
  await page.locator('#btn-play-pause').focus();
  await expect(reset).toHaveText('Reset');
});

test('audio player shows a Reset control', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-02"]').click();
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#btn-reset')).toBeVisible();
});

test('audio Reset needs two presses, DELETEs progress, then exits the player', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-02"]').click();
  await expect(page.locator('#screen-audio')).toBeVisible();
  const methods = await captureProgress(page);
  const reset = page.locator('#btn-reset');
  await reset.click();
  await expect(reset).toHaveText('Reset?');
  expect(methods()).not.toContain('DELETE');
  await reset.click();
  expect(methods()).toContain('DELETE');
  await expect(page.locator('#screen-audio')).not.toBeVisible();
});
