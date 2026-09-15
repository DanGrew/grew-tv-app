const { test, expect } = require('@playwright/test');
const {
  installApi,
  installVideoPlaybackBackend,
  installQueuePlaybackBackend,
  BROWSE,
  MUSIC_VIDEO_CARDS,
  CHANNEL_ON_AIR
} = require('./fixtures/api.js');

// TASK-595 (FEAT-526) — browse's floating bottom-right cluster from the couch.
// Search, the ▶ play menu and the Guide were click-only, and `btn-search` is the
// only way into Search, so from the remote that whole surface was unreachable.
//
// Two ways in, both on presses that did NOTHING before (owner, 2026-09-10): ▼ off
// the last rail and ▶ on the profile pill. Story 10 is the guard — browse is the
// most-used screen and no move that already worked may change.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grew-tv-person', 'kids'));
});

// Every Continue button reads its own snapshot to decide whether it is live, so a
// test seeding one type must answer for the other four too.
async function routeEmptyQueue(page, mediaType) {
  await page.route(new RegExp('/api/queue/' + mediaType + '\\?'), (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ person_id: 'kids', media_type: mediaType, queue: [], next: [], coming_up: [] })
    }));
}
async function routeAllEmpty(page) {
  for (const t of ['series', 'film', 'home-movie', 'music', 'music-video']) {
    await routeEmptyQueue(page, t);
  }
}

async function withChannels(page, channels) {
  await page.route('**/api/channels**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ channels: channels })
  }));
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

async function openFilms(page) {
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await expect(page.locator('.film-tile[data-id="finding-nemo-main"]')).toBeVisible();
}

// A tab click leaves focus on the tab; start every walk from the rails, where the
// screen itself puts focus on load.
async function focusFirstTile(page) {
  await page.locator('.rail-row .film-tile').first().focus();
}

// rails-1 presses reach the last rail, and the next one leaves it for the cluster.
async function downToCluster(page) {
  const rails = await page.locator('.rail-row').count();
  for (let i = 0; i < rails; i++) await page.keyboard.press('ArrowDown');
}

function focusedId(page) {
  return page.evaluate(() => document.activeElement.id);
}

// ── stories 1 & 2: the two ways in ──────────────────────────────────────────

test('Story 1 — ▼ off the bottom rail lands on the cluster', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await openFilms(page);
  await focusFirstTile(page);
  await downToCluster(page);
  await expect(page.locator('#btn-search')).toBeFocused();
});

test('Story 2 — ▶ on the profile pill lands on the cluster', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await openFilms(page);
  await page.locator('#profile-label').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-search')).toBeFocused();
});

// ── story 3: walking the cluster, and back out of it ────────────────────────

test('Story 3 — ◀▶ walk the cluster and ▲ returns to the bottom rail', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await openFilms(page);
  await focusFirstTile(page);
  await downToCluster(page);
  await expect(page.locator('#btn-search')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-queue-menu')).toBeFocused();
  // The right-hand edge holds rather than wrapping.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-queue-menu')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#btn-search')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.rail-row').last().locator('.film-tile').first()).toBeFocused();
});

test('Story 3 — ▲ hands focus back to the column ▼ left from, not the start of the row', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  // Music Videos, because its bottom rail (an artist with two videos) is the one
  // tab in the fixture holding a rail wide enough to leave from a column that
  // isn't 0 — every Films rail is a single tile.
  await withMusicVideos(page);
  await openFilms(page);
  await page.locator('.sidebar-tab[data-tab="music-videos"]').click();
  await focusFirstTile(page);
  const lastRail = page.locator('.rail-row').last();
  expect(await lastRail.locator('.film-tile').count()).toBeGreaterThan(1);
  await lastRail.locator('.film-tile').nth(1).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-search')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(lastRail.locator('.film-tile').nth(1)).toBeFocused();
});

// ── stories 4 & 5: Search opens, and hands focus back when it closes ────────

test('Story 4 — OK on Search opens the panel on its keyboard', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await openFilms(page);
  await focusFirstTile(page);
  await downToCluster(page);
  await expect(page.locator('#search-panel')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.locator('#search-panel')).toBeVisible();
  await expect(page.locator('#search-keys .sk-key').first()).toBeFocused();
});

test('Story 5 — Home closes Search, focus returns to 🔍, and the d-pad moves again', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await openFilms(page);
  await focusFirstTile(page);
  await downToCluster(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('#search-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#search-panel')).toBeHidden();
  await expect(page.locator('#btn-search')).toBeFocused();
  // Focus used to be left on a now-hidden key cell, so browse's d-pad found no
  // zone and every arrow did nothing until the mouse rescued it.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-queue-menu')).toBeFocused();
});

// ── stories 6 & 7: the play menu, walked and closed like an overlay ─────────

// Films and music videos have something to carry on with; the other three do not,
// so one seeding proves both the landing stop and the skip.
async function openMenuWithTwoLive(page) {
  await installApi(page);
  await routeAllEmpty(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('queue-item', { item_id: 'finding-nemo-main' });
  await page.route(new RegExp('/api/queue/music-video\\?'), (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ person_id: 'kids', media_type: 'music-video', queue: [{ item_id: 'mv-03' }], next: [], coming_up: [] })
  }));
  await openFilms(page);
  await focusFirstTile(page);
  await downToCluster(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-queue-menu')).toBeFocused();
  await page.keyboard.press('Enter');
}

test('Story 6 — OK on ▶ opens the menu focused on the first button with something to play', async ({ page }) => {
  await openMenuWithTwoLive(page);
  await expect(page.locator('#queue-menu')).toBeVisible();
  await expect(page.locator('#btn-continue-film')).toBeFocused();
});

test('Story 6 — ▲▼ walk the menu and skip the dimmed buttons', async ({ page }) => {
  await openMenuWithTwoLive(page);
  await expect(page.locator('#btn-continue-film')).toBeFocused();
  // Home Movies, Music and TV Series sit between the two live ones and are all
  // disabled-but-visible, so the walk steps straight over them.
  await expect(page.locator('#btn-continue-home-movie')).toBeDisabled();
  await expect(page.locator('#btn-continue-music')).toBeDisabled();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-continue-music-video')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-continue-music-video')).toBeFocused();   // the edge holds
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#btn-continue-film')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#btn-continue-film')).toBeFocused();          // and so does this one
});

test('Story 7 — Home closes the menu and focus is back on ▶', async ({ page }) => {
  await openMenuWithTwoLive(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#queue-menu')).toBeHidden();
  await expect(page.locator('#btn-queue-menu')).toBeFocused();
  // Still in the cluster, still walking.
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#btn-search')).toBeFocused();
});

test('Story 7 — OK on ▶ again closes the menu and focus is back on ▶', async ({ page }) => {
  await openMenuWithTwoLive(page);
  await page.locator('#btn-queue-menu').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#queue-menu')).toBeHidden();
  await expect(page.locator('#btn-queue-menu')).toBeFocused();
});

// ── story 8: Play All is in the menu on a tab that has one ──────────────────

test('Story 8 — on Music Videos Play All is walked and OK plays everything', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await withMusicVideos(page);
  await openFilms(page);
  await page.locator('.sidebar-tab[data-tab="music-videos"]').click();
  await focusFirstTile(page);
  await downToCluster(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#btn-play-all')).toBeVisible();
  await expect(page.locator('#btn-play-all')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/video\.html\?.*musicVideoAll=1/);
});

test('Story 8 — on a tab with no Play All it is not walked', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await withMusicVideos(page);
  await openFilms(page);
  await focusFirstTile(page);
  await downToCluster(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#btn-play-all')).toBeHidden();
  // Nothing is queued anywhere either, so the menu holds no stop at all and
  // focus stays where the press was made rather than landing on a hidden button.
  await expect(page.locator('#btn-queue-menu')).toBeFocused();
});

// ── story 9: the Guide, on Channels only ───────────────────────────────────

test('Story 9 — on Channels the Guide is in the cluster and OK opens it', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await withChannels(page, [CHANNEL_ON_AIR]);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('.sidebar-tab.active')).toHaveText('Channels');
  await page.locator('.rail-row .channel-tile').first().focus();
  await downToCluster(page);
  // The Guide is the leftmost control, so it is where the cluster is entered.
  await expect(page.locator('#btn-guide')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-search')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/guide\.html/);
});

test('Story 9 — on any other tab the Guide is not in the cluster', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await withChannels(page, [CHANNEL_ON_AIR]);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await expect(page.locator('#btn-guide')).toBeHidden();
  await focusFirstTile(page);
  await downToCluster(page);
  await expect(page.locator('#btn-search')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#btn-search')).toBeFocused();
});

// ── story 10: the guard ────────────────────────────────────────────────────

test('Story 10 — walking tiles, rails and the sidebar is exactly as it was', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await openFilms(page);
  await focusFirstTile(page);
  const firstRail = page.locator('.rail-row').first();
  // ◀▶ along a rail.
  await page.keyboard.press('ArrowRight');
  await expect(firstRail.locator('.film-tile').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(firstRail.locator('.film-tile').nth(0)).toBeFocused();
  // ◀ at column 0 hops into the sidebar; ▶ comes back to the rails.
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sidebar-tab.active')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(firstRail.locator('.film-tile').first()).toBeFocused();
  // ▼ steps a rail keeping the column; ▲ steps back.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.rail-row').nth(1).locator('.film-tile').first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(firstRail.locator('.film-tile').first()).toBeFocused();
  // ▲ off the top rail still rises to the profile pill, and ◀ from there still
  // drops into the sidebar.
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#profile-label')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sidebar-tab.active')).toBeFocused();
  // ▼ from the pill still enters the rails at the first tile.
  await page.locator('#profile-label').focus();
  await page.keyboard.press('ArrowDown');
  await expect(firstRail.locator('.film-tile').first()).toBeFocused();
});

test('Story 10 — the cluster is not reached from a rail that has one below it', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await openFilms(page);
  await focusFirstTile(page);
  expect(await page.locator('.rail-row').count()).toBeGreaterThan(1);
  await page.keyboard.press('ArrowDown');
  await expect(await focusedId(page)).not.toBe('btn-search');
  await expect(page.locator('.rail-row').nth(1).locator('.film-tile').first()).toBeFocused();
});
