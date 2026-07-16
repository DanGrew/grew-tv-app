const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-322 (FEAT-046) — the artist page is a SONG LIST of all the artist's tracks,
// grouped by album (newest album first, track order within), reusing the album/
// playlist detail rows. Tapping a song plays the ARTIST source from there
// (audio.html?artist=&track= → play-source {artist} + play-track), so playback
// continues through the artist's songs. No Play/Shuffle header (TASK-321). The
// data is assembled client-side (option (b)): albumsByArtist + one /api/album per
// album — ELO has Time (1981) + Out of the Blue (1977) in the fixtures.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

async function enterArtist(page) {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="artist:ELO"]').click();
  await expect(page).toHaveURL(/artist\.html/);
  await expect(page.locator('#detail-title')).toHaveText('ELO');
  // The render signal: the first song row is present (init has wired its handlers).
  await expect(page.locator('.detail-row').first()).toBeVisible();
}

// Story 1 — all the artist's songs, grouped under album headers, newest album first.
test('the artist page lists all the artist songs grouped by album, newest album first', async ({ page }) => {
  await enterArtist(page);
  // Two album headers, newest first (Time 1981 above Out of the Blue 1977).
  await expect(page.locator('.detail-season')).toHaveText(['Time', 'Out of the Blue']);
  // Every ELO track across both albums, in album-then-track order.
  await expect(page.locator('.detail-row')).toHaveCount(5);
  await expect(page.locator('.detail-row .detail-label')).toHaveText([
    '1. Twilight', '2. Ticket to the Moon',
    '1. Turn to Stone', '2. Mr. Blue Sky', '3. Sweet Talkin Woman'
  ]);
  // The first row belongs to the newest album (Time).
  await expect(page.locator('.detail-row').first()).toHaveAttribute('data-id', 'elo-time-01');
});

// Story 3 — no Play/Shuffle button; you tap a song to start (same as album/playlist).
test('there is no Play or Shuffle button on the artist page', async ({ page }) => {
  await enterArtist(page);
  await expect(page.locator('#btn-play')).toHaveCount(0);
  await expect(page.locator('#btn-shuffle')).toHaveCount(0);
});

// Story 2 — tapping a song plays it and continues through the artist's songs.
test('tapping a song plays the artist source from there (play-source artist + play-track)', async ({ page }) => {
  await enterArtist(page);
  const srcPost = page.waitForRequest(r => r.url().includes('/api/playback/play-source') && r.method() === 'POST');
  const trkPost = page.waitForRequest(r => r.url().includes('/api/playback/play-track') && r.method() === 'POST');
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page).toHaveURL(/audio\.html/);
  const url = page.url();
  expect(url).toContain('artist=ELO');
  expect(url).toContain('track=ootb-01');
  expect(url).not.toContain('shuffle');
  const src = JSON.parse((await srcPost).postData());
  expect(src.source_type).toBe('artist');
  expect(src.source_id).toBe('ELO');
  // Shuffle is server-owned per source now (TASK-320) — no client flag.
  expect(src.shuffle).toBeUndefined();
  expect(JSON.parse((await trkPost).postData()).track_id).toBe('ootb-01');
  // now-playing = the tapped song; the artist source follows on (queue mode: ⏭ shown).
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  await expect(page.locator('#audio-artist')).toHaveText('ELO');
  await expect(page.locator('#btn-next')).toBeVisible();
});

// Tapping a song in the SECOND (older) album plays THAT song (not the album top).
test('tapping a song in a later album starts on that song', async ({ page }) => {
  await enterArtist(page);
  await page.locator('.detail-row[data-id="elo-time-02"]').click();
  await expect(page).toHaveURL(/track=elo-time-02/);
  await expect(page.locator('#audio-title')).toHaveText('Ticket to the Moon');
});

// The Artists-rail drill-down still lands here, and Back returns to the Music tab.
test('Back from the artist song list returns to the Music tab', async ({ page }) => {
  await enterArtist(page);
  await page.keyboard.press('Backspace');
  await expect(page).toHaveURL(/tab=music/);
  await expect(page.locator('.rail-row[data-rail="artists"]')).toBeVisible();
});
