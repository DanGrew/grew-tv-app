const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// FEAT-031 (TASK-214) — the artist screen's Play-all / Shuffle header. TASK-187
// wired the `audio.html?artist=` plumbing (play-source { source_type: 'artist' });
// the two header buttons open the player on the artist source. TASK-320/321:
// shuffle is server-owned per source now, so play-source no longer carries a
// client shuffle flag (the artist header buttons remain — their re-scope is
// TASK-316). The faithful playback fixture resolves an artist source to every
// audio track by that artist (ELO -> ootb-01..03), so now-playing paints the
// first track.

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
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="artist:ELO"]').click();
  await expect(page).toHaveURL(/artist\.html/);
  await expect(page.locator('#grid-title')).toHaveText('ELO');
}

test('the artist page shows Play and Shuffle header buttons', async ({ page }) => {
  await enterArtist(page);
  await expect(page.locator('#btn-play')).toBeVisible();
  await expect(page.locator('#btn-shuffle')).toBeVisible();
});

test('Play opens the player on the artist source (ordered), now-playing = first track', async ({ page }) => {
  await enterArtist(page);
  const post = page.waitForRequest(r => r.url().includes('/api/playback/play-source') && r.method() === 'POST');
  await page.locator('#btn-play').click();
  await expect(page).toHaveURL(/audio\.html/);
  const body = JSON.parse((await post).postData());
  expect(body.source_type).toBe('artist');
  expect(body.source_id).toBe('ELO');
  // TASK-320/321: play-source carries no client shuffle flag — the backend owns
  // shuffle per source now (the source's stored pref governs order).
  expect(body.shuffle).toBeUndefined();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  await expect(page.locator('#audio-artist')).toHaveText('ELO');
});

// TASK-320/321: the artist Shuffle button still opens the artist player, but the
// client no longer sends a shuffle flag on play-source — shuffle is server-owned
// per source (the artist header-button re-scope is TASK-316). The player carries
// no shuffle pill to reflect it either.
test('Shuffle on the artist source sends no client shuffle flag (backend owns it)', async ({ page }) => {
  await enterArtist(page);
  const post = page.waitForRequest(r => r.url().includes('/api/playback/play-source') && r.method() === 'POST');
  await page.locator('#btn-shuffle').click();
  await expect(page).toHaveURL(/audio\.html/);
  const body = JSON.parse((await post).postData());
  expect(body.source_type).toBe('artist');
  expect(body.shuffle).toBeUndefined();
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#btn-shuffle')).toHaveCount(0);
});

test('the grid is reachable below the header — Up from the first tile lands on the actions', async ({ page }) => {
  await enterArtist(page);
  await page.locator('#rail-grid .film-tile').first().focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#btn-play')).toBeFocused();
});
