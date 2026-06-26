const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

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
  await installPlaybackBackend(page);
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

test('Music tab shows an Artists rail then an Albums rail with square (music) tiles, no Singles rail', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await expect(page.locator('.rail-title')).toHaveText(['Artists', 'Albums']);
  // Album = series card with section "music" (square art via data-music); "3 tracks" sub.
  const album = page.locator('.rail-row[data-rail="albums"] .film-tile[data-id="ootb"]');
  await expect(album).toHaveCount(1);
  await expect(album).toHaveAttribute('data-music', '');
  await expect(album.locator('.tile-sub')).toHaveText('3 tracks');
});

test('Artists rail has one square tile per artist (A-Z), labelled with the album count (FEAT-029)', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  const tiles = page.locator('.rail-row[data-rail="artists"] .film-tile');
  await expect(tiles).toHaveCount(2); // ABBA, ELO
  await expect(tiles.locator('.tile-title')).toHaveText(['ABBA', 'ELO']); // A-Z
  const elo = page.locator('.rail-row[data-rail="artists"] .film-tile[data-id="artist:ELO"]');
  await expect(elo).toHaveAttribute('data-music', ''); // square art
  await expect(elo.locator('.tile-sub')).toHaveText('2 albums');
  await expect(page.locator('.film-tile[data-id="artist:ABBA"] .tile-sub')).toHaveText('1 album');
});

test('selecting an artist drills into a grid of just that artist’s albums; an album opens its detail', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="artist:ELO"]').click();
  await expect(page).toHaveURL(/artist\.html/);
  await expect(page.locator('#grid-title')).toHaveText('ELO');
  // ELO's two albums, newest first by year (Time 1981 before Out of the Blue 1977);
  // ABBA's Arrival is absent.
  const tiles = page.locator('#rail-grid .film-tile');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.locator('.tile-title')).toHaveText(['Time', 'Out of the Blue']);
  await expect(page.locator('#rail-grid .film-tile[data-id="abba-arrival"]')).toHaveCount(0);
  // Breadcrumb: Home › Albums › ELO.
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('ELO');
  await page.locator('#rail-grid .film-tile[data-id="ootb"]').click();
  await expect(page).toHaveURL(/album-detail\.html/);
  await expect(page.locator('#detail-title')).toHaveText('Out of the Blue');
});

test('Back from an artist page returns to the Music tab', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="artist:ELO"]').click();
  await expect(page).toHaveURL(/artist\.html/);
  // Wait for the page module to register its key handlers (the grid render is the
  // ready signal) before the Backspace, else it races the navigation.
  await expect(page.locator('#grid-title')).toHaveText('ELO');
  await page.keyboard.press('Backspace');
  await expect(page).toHaveURL(/tab=music/);
  await expect(page.locator('.rail-row[data-rail="artists"]')).toBeVisible();
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

// REGRESSION (TASK-187): playback is server-authoritative — Next must POST the
// `next` action and let the returning snapshot advance now-playing, NOT mutate a
// local queue. Fails on pre-187 code (which advanced via core/queue.js and never
// hit /api/playback).
test('Next POSTs the server action and the snapshot advances now-playing (no client queue)', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  const nextPost = page.waitForRequest(r => r.url().includes('/api/playback/next') && r.method() === 'POST');
  await page.locator('#btn-next').click();
  await nextPost;
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
});

// The transport reports position via the server `position` action (playback_state
// is the audio resume source now), not the legacy /api/progress write.
test('position is reported to the playback position action', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  const posPost = page.waitForRequest(r => r.url().includes('/api/playback/position') && r.method() === 'POST');
  await page.evaluate(() => {
    const a = document.getElementById('audio');
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => 42 });
    Object.defineProperty(a, 'duration', { configurable: true, get: () => 227 });
    a.dispatchEvent(new Event('timeupdate'));
  });
  const req = await posPost;
  expect(JSON.parse(req.postData()).current_position).toBe(42);
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

// BUG-016: open the <audio> player on the first album track.
async function openPlayer(page) {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
}

// BUG-016 (relayout): the six pills live on their own row BELOW the progress bar,
// in the order queue, jump, shuffle, repeat, lyrics, reset. The transport row keeps
// only prev/play/next + the progress bar + time. Red on the old single-row markup.
test('the pills sit on their own row below the progress bar in the BUG-016 order', async ({ page }) => {
  await openPlayer(page);
  const ids = await page.locator('#pill-row button').evaluateAll(els => els.map(e => e.id));
  expect(ids).toEqual(['btn-queue', 'btn-jump', 'btn-shuffle', 'btn-repeat', 'btn-lyrics', 'btn-reset']);
  // Progress bar + time stay on the transport row; no pills there.
  await expect(page.locator('#transport #progress')).toHaveCount(1);
  await expect(page.locator('#transport #time-display')).toHaveCount(1);
  await expect(page.locator('#transport .pill')).toHaveCount(0);
});

// BUG-016 (dead clicks): the bar auto-hides after the idle window and sets
// pointer-events:none. Before the fix only a d-pad key could summon it, so a mouse
// could never wake it and every click was dead. Pointer activity must now wake the
// bar (re-enabling clicks) and re-arm the timer. Red on the old key-only summon.
test('after the idle window pointer activity wakes the bar so controls are clickable again', async ({ page }) => {
  await openPlayer(page);
  await expect(page.locator('#controls')).toHaveClass(/controls-hidden/, { timeout: 6000 });
  await page.mouse.move(400, 400);
  await expect(page.locator('#controls')).not.toHaveClass(/controls-hidden/);
  // And a control now fires (server-authoritative shuffle echoes the on state).
  await page.locator('#btn-shuffle').click();
  await expect(page.locator('#btn-shuffle')).toHaveClass(/on/);
});
