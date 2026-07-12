const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// FEAT-048 (TASK-324) — the TV app search overlay. A 🔍 button in the topbar opens
// a modal panel (Videos|Music toggle · the REUSED create-playlist on-screen
// keyboard · ranked results) that is a SEPARATE surface over browse: opening,
// typing and closing never re-render the rails, so closing leaves browse where it
// was. A result tap routes via the same onSelect (cardRoute) a tile tap uses.
// Shares core/search-rank with the companion (mirror invariant).

function withMusic(page) {
  return page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: { animation: 'Animation', comedy: 'Comedy' }, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
}

// Type a word on the on-screen keyboard by clicking its letter cells (uppercase
// labels; ranking is case-insensitive).
async function typeKeys(page, word) {
  for (const ch of word.toUpperCase().split('')) {
    const label = ch === ' ' ? 'Space' : ch;
    await page.locator('#search-keys .sk-key', { hasText: new RegExp('^' + label + '$') }).click();
  }
}

async function openBrowse(page) {
  await page.goto('/app/homeview/profile.html');
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
});

test('Story 6 — 🔍 opens the panel with the on-screen keyboard + Videos|Music toggle', async ({ page }) => {
  await openBrowse(page);
  await expect(page.locator('#search-panel')).toBeHidden();
  await page.locator('#btn-search').click();
  await expect(page.locator('#search-panel')).toBeVisible();
  await expect(page.locator('#search-seg .seg-opt')).toHaveText(['Videos', 'Music']);
  // The reused on-screen keyboard: A-Z + 0-9 + Space/⌫/Clear.
  await expect(page.locator('#search-keys .sk-key')).toHaveCount(36 + 3);
  await expect(page.locator('#search-query')).toHaveClass(/placeholder/);
});

test('Story 6/2 — typing on the on-screen keyboard filters; a result has a thumbnail + tag; tap opens its detail', async ({ page }) => {
  await openBrowse(page);
  await page.locator('#btn-search').click();
  await typeKeys(page, 'blu');
  await expect(page.locator('#search-query')).toHaveText('BLU');
  const row = page.locator('.sr-row', { hasText: 'Bluey' });
  await expect(row).toBeVisible();
  await expect(row.locator('.sr-thumb')).toBeVisible();
  await expect(row.locator('.sr-tag')).toHaveText('SERIES');
  await row.click();
  await expect(page).toHaveURL(/detail\.html\?series=bluey/);
});

test('empty query shows nothing; a no-match shows nothing', async ({ page }) => {
  await openBrowse(page);
  await page.locator('#btn-search').click();
  await expect(page.locator('.sr-row')).toHaveCount(0);
  await typeKeys(page, 'zqx');
  await expect(page.locator('.sr-row')).toHaveCount(0);
});

test('Story 7 — closing the panel leaves browse exactly where it was', async ({ page }) => {
  await openBrowse(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await expect(page.locator('.rail-title')).toHaveText(['Animation', 'Comedy']);
  await page.locator('#btn-search').click();
  await expect(page.locator('#search-panel')).toBeVisible();
  await page.locator('#btn-search-close').click();
  await expect(page.locator('#search-panel')).toBeHidden();
  // Browse is untouched — still the Films tab and its rails.
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toHaveClass(/active/);
  await expect(page.locator('.rail-title')).toHaveText(['Animation', 'Comedy']);
});

test.describe('Music search', () => {
  test.beforeEach(async ({ page }) => { await withMusic(page); });

  test('Story 3/5 — Music + an artist name shows mixed TRACK/ALBUM/ARTIST results, artist first', async ({ page }) => {
    await openBrowse(page);
    await page.locator('#btn-search').click();
    await page.locator('#search-seg .seg-opt[data-domain="music"]').click();
    await expect(page.locator('#search-seg .seg-opt.on')).toHaveText('Music');
    await typeKeys(page, 'elo');
    await expect(page.locator('.sr-row:has(.sr-tag:text-is("ARTIST"))')).toHaveCount(1);
    await expect(page.locator('.sr-row:has(.sr-tag:text-is("ALBUM"))').first()).toBeVisible();
    await expect(page.locator('.sr-row:has(.sr-tag:text-is("TRACK"))').first()).toBeVisible();
    await expect(page.locator('.sr-row').first().locator('.sr-tag')).toHaveText('ARTIST');
  });

  test('Story 4 — tapping a TRACK opens its album; ARTIST opens the artist page', async ({ page }) => {
    await openBrowse(page);
    await page.locator('#btn-search').click();
    await page.locator('#search-seg .seg-opt[data-domain="music"]').click();
    await typeKeys(page, 'blue sky');
    const track = page.locator('.sr-row', { hasText: 'Mr. Blue Sky' });
    await expect(track.locator('.sr-tag')).toHaveText('TRACK');
    await expect(track.locator('.sr-sub')).toHaveText('ELO · Out of the Blue');
    await track.click();
    await expect(page).toHaveURL(/album-detail\.html\?album=ootb/);
  });

  test('Story 4 — tapping an ARTIST opens the artist page', async ({ page }) => {
    await openBrowse(page);
    await page.locator('#btn-search').click();
    await page.locator('#search-seg .seg-opt[data-domain="music"]').click();
    await typeKeys(page, 'abba');
    const artist = page.locator('.sr-row:has(.sr-tag:text-is("ARTIST"))');
    await expect(artist.locator('.sr-title')).toHaveText('ABBA');
    await artist.click();
    await expect(page).toHaveURL(/artist\.html\?artist=ABBA/);
  });
});

// d-pad reachability (TV gate): the keyboard grid is arrow-navigable and Enter
// types; a typed query surfaces results reachable by ArrowDown into the list.
test('the on-screen keyboard is d-pad navigable (arrow to a letter, Enter types it)', async ({ page }) => {
  await openBrowse(page);
  await page.locator('#btn-search').click();
  // Panel opens focused on the first key ('A'); ArrowRight then Enter types 'B'.
  await expect(page.locator('#search-keys .sk-key').first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#search-query')).toHaveText('B');
});
