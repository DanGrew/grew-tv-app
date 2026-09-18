const { test, expect } = require('@playwright/test');
const {
  installApi,
  installVideoPlaybackBackend,
  installQueuePlaybackBackend,
  BROWSE,
  MUSIC_VIDEO_CARDS,
  CHANNEL_ON_AIR
} = require('./fixtures/api.js');

// TASK-594 (FEAT-526) — Home on Browse is one layer up. From a rail, or from the
// bottom-right cluster, it lands on the lit section tab; the sidebar is the
// ceiling, so from there (and from the toggle and the profile control) it does
// nothing. The profile picker is reached by pressing the profile control, never
// by pressing Home once too often.
//
// Stories 6 (OK on the profile control opens the picker) and 7 (Home on the
// picker) are the existing guards in homeview.test.js and profile.test.js.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grew-tv-person', 'kids'));
});

async function routeAllEmpty(page) {
  for (const t of ['series', 'film', 'home-movie', 'music', 'music-video']) {
    await page.route(new RegExp('/api/queue/' + t + '\\?'), (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ person_id: 'kids', media_type: t, queue: [], next: [], coming_up: [] })
    }));
  }
}

async function withMusicVideos(page) {
  await page.route('**/api/browse**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      profile: 'kids',
      genreLabels: BROWSE.kids.genreLabels,
      content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS)
    })
  }));
}

async function withChannels(page) {
  await page.route('**/api/channels**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ channels: [CHANNEL_ON_AIR] })
  }));
}

// A seeded route is registered after installApi's defaults, since the most
// recently registered route wins.
async function openBrowse(page, seed) {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  if (seed) await seed(page);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#profile-label')).toHaveText(/Kids/);
}

async function openTab(page, tabId) {
  await page.locator('.sidebar-tab[data-tab="' + tabId + '"]').click();
  await expect(page.locator('.sidebar-tab.active')).toHaveAttribute('data-tab', tabId);
}

async function downToCluster(page) {
  await page.locator('.rail-row .film-tile').first().focus();
  const rails = await page.locator('.rail-row').count();
  for (let i = 0; i < rails; i++) await page.keyboard.press('ArrowDown');
}

// ── story 1: from a rail ───────────────────────────────────────────────────

test('Story 1 — Home on a tile deep in a rail lands on the lit section tab, rails untouched', async ({ page }) => {
  await openBrowse(page, withMusicVideos);
  await openTab(page, 'music-videos');
  const lastRail = page.locator('.rail-row').last();
  expect(await lastRail.locator('.film-tile').count()).toBeGreaterThan(1);
  const railsBefore = await page.locator('.rail-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-rail')));
  await lastRail.locator('.film-tile').nth(1).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar-tab[data-tab="music-videos"]')).toBeFocused();
  await expect(page.locator('.sidebar-tab.active')).toHaveAttribute('data-tab', 'music-videos');
  const railsAfter = await page.locator('.rail-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-rail')));
  expect(railsAfter).toEqual(railsBefore);
});

// ── story 2: from the cluster ──────────────────────────────────────────────

test('Story 2 — Home on Search lands on the lit section tab', async ({ page }) => {
  await openBrowse(page);
  await openTab(page, 'films');
  await downToCluster(page);
  await expect(page.locator('#btn-search')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeFocused();
});

test('Story 2 — Home on the play menu button lands on the lit section tab', async ({ page }) => {
  await openBrowse(page);
  await openTab(page, 'films');
  await downToCluster(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-queue-menu')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeFocused();
});

test('Story 2 — Home on the Guide lands on the lit section tab', async ({ page }) => {
  await openBrowse(page, withChannels);
  await expect(page.locator('.sidebar-tab.active')).toHaveText('Channels');
  await page.locator('.rail-row .channel-tile').first().focus();
  const rails = await page.locator('.rail-row').count();
  for (let i = 0; i < rails; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-guide')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar-tab.active')).toBeFocused();
});

test('Search open — Home only closes it, focus stays on 🔍', async ({ page }) => {
  await openBrowse(page);
  await openTab(page, 'films');
  await downToCluster(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#search-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#search-panel')).toBeHidden();
  await expect(page.locator('#btn-search')).toBeFocused();
});

// ── story 3: the play menu open ────────────────────────────────────────────

test('Story 3 — Home with the play menu open closes it onto ▶; the next press goes to the tab', async ({ page }) => {
  await installApi(page);
  await routeAllEmpty(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('queue-item', { item_id: 'finding-nemo-main' });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#profile-label')).toHaveText(/Kids/);
  await openTab(page, 'films');
  await downToCluster(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#btn-continue-film')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#queue-menu')).toBeHidden();
  await expect(page.locator('#btn-queue-menu')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeFocused();
});

// ── story 4: the ceiling ───────────────────────────────────────────────────

test('Story 4 — Home on a section tab does nothing', async ({ page }) => {
  await openBrowse(page);
  await openTab(page, 'films');
  await page.locator('.sidebar-tab[data-tab="films"]').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeFocused();
  await expect(page).toHaveURL(/browse\.html/);
});

test('Story 4 — Home on the collapse toggle does nothing', async ({ page }) => {
  await openBrowse(page);
  await page.locator('.sidebar-toggle').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar-toggle')).toBeFocused();
  await expect(page).toHaveURL(/browse\.html/);
});

test('Story 4 — Home on the profile control does nothing', async ({ page }) => {
  await openBrowse(page);
  await page.locator('#profile-label').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#profile-label')).toBeFocused();
  await expect(page).toHaveURL(/browse\.html/);
});

// ── story 5: never the picker ──────────────────────────────────────────────

test('Story 5 — however many times Home is pressed, Browse never leaves for the picker', async ({ page }) => {
  await openBrowse(page);
  await openTab(page, 'films');
  await page.locator('.rail-row .film-tile').first().focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeFocused();
  await expect(page).toHaveURL(/browse\.html/);
  await expect(page.locator('#screen-browse')).toBeVisible();
});
