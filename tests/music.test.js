const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// FEAT-018/FEAT-027 — music browse + album detail + <audio> player + shuffle.
// The Music tab (titled "Albums"), Continue Listening rollup and routing are
// exercised end-to-end against the fixture album ("Out of the Blue", 3 tracks).
// FEAT-027: the app is type-agnostic — it groups by the server `section`, and a
// track is never a standalone browse card (no Singles rail). Host-agnostic:
// backend derives from the page origin (BUG-009). Music browse cards are injected
// here (not the shared fixture) so the video-only tests keep seeing exactly
// Series/Films/Home Movies.

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

test('a Music tab (titled Albums) appears after the video tabs, only when music is present', async ({ page }) => {
  await enterKids(page);
  await expect(page.locator('.sidebar-tab')).toHaveText(['Series', 'Films', 'Home Movies', 'Albums']);
});

test('Music tab shows a single Albums rail with square (music) tiles, no Singles rail', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await expect(page.locator('.rail-title')).toHaveText(['Albums']);
  // Album = series card with section "music" (square art via data-music); "3 tracks" sub.
  const album = page.locator('.rail-row[data-rail="albums"] .film-tile[data-id="ootb"]');
  await expect(album).toHaveCount(1);
  await expect(album).toHaveAttribute('data-music', '');
  await expect(album.locator('.tile-sub')).toHaveText('3 tracks');
});

test('albums route to the album detail (not series detail)', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await expect(page).toHaveURL(/album-detail\.html/);
  await expect(page.locator('#detail-title')).toHaveText('Out of the Blue');
  // Track rows reuse the series-detail rows, numbered from items[].episode.
  await expect(page.locator('.detail-row')).toHaveCount(3);
  await expect(page.locator('.detail-row[data-id="ootb-01"] .detail-label')).toHaveText('1. Turn to Stone');
  await expect(page.locator('#btn-play-next')).toBeVisible();
  await expect(page.locator('#btn-shuffle')).toBeVisible();
});

test('selecting a track plays it in the <audio> player from {id}.m4a', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-02"]').click();
  await expect(page).toHaveURL(/audio\.html/);
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
  await expect(page.locator('#audio-artist')).toHaveText('ELO');
  const src = await page.locator('#audio').getAttribute('src');
  expect(src).toContain('/media/ootb-02.m4a');
  // Album queue -> prev/next are present (not the single's hidden state).
  await expect(page.locator('#btn-prev')).toBeVisible();
  await expect(page.locator('#btn-next')).toBeVisible();
});

test('Shuffle from album detail starts the player with shuffle engaged', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  // Wait for the album to load — shufflePlay no-ops until items[] is populated, so
  // clicking before the rows render races the load and the player never opens.
  await expect(page.locator('.detail-row')).toHaveCount(3);
  await page.locator('#btn-shuffle').click();
  await expect(page).toHaveURL(/audio\.html/);
  await expect(page.locator('#btn-shuffle.on')).toBeVisible();
});

test('the player Shuffle button toggles the engaged state', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#screen-audio')).toBeVisible();
  // Wait for load to finish (#audio-title populated) — the page's load .then
  // calls setShuffle(shuffleParam), which would otherwise race a too-early click
  // and reset the toggle.
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  await expect(page.locator('#btn-shuffle')).not.toHaveClass(/on/);
  await page.locator('#btn-shuffle').click();
  await expect(page.locator('#btn-shuffle')).toHaveClass(/on/);
  await page.locator('#btn-shuffle').click();
  await expect(page.locator('#btn-shuffle')).not.toHaveClass(/on/);
});

test('Continue Listening rolls in-progress tracks up to ONE album tile, leading the Albums tab', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [
      { item_id: 'ootb-02', title: 'Mr. Blue Sky', poster: 'ootb.jpg', position_secs: 110, duration_secs: 245, last_watched: '2026-06-08T00:00:00Z', format: null, collection_id: 'ootb', collection_title: 'Out of the Blue' },
      { item_id: 'ootb-01', title: 'Turn to Stone', poster: 'ootb.jpg', position_secs: 30, duration_secs: 227, last_watched: '2026-06-07T00:00:00Z', format: null, collection_id: 'ootb', collection_title: 'Out of the Blue' }
    ] })
  }));
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await expect(page.locator('.rail-title').first()).toHaveText('Continue Listening');
  const cl = page.locator('.rail-row[data-rail="continue"]');
  // Two in-progress tracks of one album -> a SINGLE album tile (rollup), opening detail.
  await expect(cl.locator('.film-tile')).toHaveCount(1);
  await expect(cl.locator('.film-tile[data-id="ootb"]')).toHaveCount(1);
  await cl.locator('.film-tile[data-id="ootb"]').click();
  await expect(page).toHaveURL(/album-detail\.html/);
});

test('an in-progress track does not leak into the Films Continue Watching rail', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [
      { item_id: 'ootb-02', title: 'Mr. Blue Sky', poster: 'ootb.jpg', position_secs: 110, duration_secs: 245, last_watched: '2026-06-08T00:00:00Z', format: null, collection_id: 'ootb', collection_title: 'Out of the Blue' },
      { item_id: 'finding-nemo-main', title: 'Finding Nemo', poster: 'nemo.jpg', position_secs: 1200, duration_secs: 6000, last_watched: '2026-06-05T00:00:00Z', format: 'film', collection_id: null, collection_title: null }
    ] })
  }));
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  const filmsCw = page.locator('.rail-row[data-rail="continue"]');
  await expect(filmsCw.locator('.film-tile')).toHaveCount(1);
  await expect(filmsCw.locator('.film-tile[data-id="finding-nemo-main"]')).toHaveCount(1);
  await expect(filmsCw.locator('.film-tile[data-id="ootb-02"]')).toHaveCount(0);
});
