const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend } = require('./fixtures/api.js');
const { enterBrowse } = require('./fixtures/nav.js');

// TASK-633 (FEAT-526) — the Info help card. One press says what every button
// does on the screen in front of you; a second press puts you back exactly where
// you were, with nothing behind it having moved.
//
// The WORDS themselves are asserted in tests/unit/button-help.test.js, where the
// table lives. What these prove is the behaviour the stories describe: that Info
// reaches every TV screen and no phone screen, that the card reads the row of the
// screen it is actually on, that nothing acts behind it, and that closing gives
// focus back.

const FILM = 'toy-story-main';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.goto('/app/homeview/profile.html');
});

const card = (page) => page.locator('#help-card');
const panel = (page) => page.locator('#help-card .help-panel');

// initPage installs the card as the screen's own module runs, which can be after
// the screen itself is on show — so the card's own mount is the settle signal for
// "Info is wired here", and pressing before it lands is a test-side race.
async function pressInfo(page) {
  await expect(card(page)).toBeAttached();
  await page.keyboard.press('i');
}

async function activeId(page) {
  return page.evaluate(() => document.activeElement.id);
}

test('Info on Browse pops up the card, listing the buttons and what each does here (story 1)', async ({ page }) => {
  await enterBrowse(page, 'kids');
  await pressInfo(page);
  await expect(card(page)).toBeVisible();
  await expect(panel(page)).toHaveAttribute('data-surface', 'browse');
  // Every button on the remote has a line, including the ones that do nothing.
  await expect(page.locator('#help-card .help-row')).toHaveCount(9);
  await expect(page.locator('#help-card [data-button="home"]')).toContainText('Back to the section list');
});

test('a button that does nothing here still gets a line, saying so (story 3)', async ({ page }) => {
  await enterBrowse(page, 'kids');
  await pressInfo(page);
  // The rocker does nothing while browsing — it steps a player's ⏮/⏭.
  await expect(page.locator('#help-card [data-button="minus"]')).toContainText('Does nothing here');
  await expect(page.locator('#help-card [data-button="minus"]')).toHaveClass(/help-none/);
});

// The rails settle after load (the Continue cluster and the channel strip both
// repaint), so focus tests start from a tile that is already drawn rather than a
// control the page may still be rebuilding underneath the assertion.
async function focusFirstFilm(page) {
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  const tile = page.locator('.film-tile').first();
  await expect(tile).toBeVisible();
  await tile.focus();
  return activeId(page);
}

test('Info again closes it, and focus is back where it was (story 4)', async ({ page }) => {
  await enterBrowse(page, 'kids');
  const before = await focusFirstFilm(page);
  await pressInfo(page);
  await expect(card(page)).toBeVisible();
  await pressInfo(page);
  await expect(card(page)).toBeHidden();
  expect(await activeId(page)).toBe(before);
});

test('Home closes it too (story 4)', async ({ page }) => {
  await enterBrowse(page, 'kids');
  const before = await focusFirstFilm(page);
  await pressInfo(page);
  await page.keyboard.press('Escape');
  await expect(card(page)).toBeHidden();
  expect(await activeId(page)).toBe(before);
});

test('no other button acts behind the card (story 5)', async ({ page }) => {
  await enterBrowse(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  const tile = page.locator('.film-tile').first();
  await tile.focus();
  const before = await activeId(page);
  await pressInfo(page);
  await expect(card(page)).toBeVisible();
  // Arrows would walk the rail, OK would open the tile: neither may happen.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await pressInfo(page);
  expect(await activeId(page)).toBe(before);
});

// The panel opens on a listener mountSearch wires as it builds its keyboard, so
// a click before the keys exist lands on nothing — wait for one key first.
async function openSearch(page) {
  await expect(page.locator('#search-keys .sk-key').first()).toBeAttached();
  await page.locator('#btn-search').click();
  await expect(page.locator('#search-panel')).toHaveClass(/open/);
}

test('Home does not reach the screen behind the card either (story 5)', async ({ page }) => {
  await enterBrowse(page, 'kids');
  await openSearch(page);
  await pressInfo(page);
  // Home closes the CARD; the Search panel underneath stays open.
  await page.keyboard.press('Escape');
  await expect(card(page)).toBeHidden();
  await expect(page.locator('#search-panel')).toHaveClass(/open/);
});

test('over Search, the card reads the Search row, not the Browse one', async ({ page }) => {
  await enterBrowse(page, 'kids');
  await openSearch(page);
  await pressInfo(page);
  await expect(panel(page)).toHaveAttribute('data-surface', 'search');
  await expect(page.locator('#help-card [data-button="home"]')).toContainText('Close Search');
});

test.describe('on a player', () => {
  test.beforeEach(async ({ page }) => {
    await installQueuePlaybackBackend(page, 'film');
  });

  async function openFilm(page) {
    await enterBrowse(page, 'kids');
    await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeVisible();
    await page.locator('.sidebar-tab[data-tab="films"]').click();
    await expect(page.locator(`.film-tile[data-id="${FILM}"]`).first()).toBeVisible();
    await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
    await expect(page.locator('#screen-video')).toBeVisible();
    await expect(page.locator('#video')).toHaveAttribute('src', /toy-story-main\.mp4/);
  }

  test('the card says what the buttons do while watching, not what they do on Browse (story 2)', async ({ page }) => {
    await openFilm(page);
    await pressInfo(page);
    await expect(panel(page)).toHaveAttribute('data-surface', 'video');
    await expect(page.locator('#help-card [data-button="leftright"]')).toContainText('Skip back / forward 10 seconds');
    await expect(page.locator('#help-card [data-button="burger"]')).toContainText('Night Mode');
    await expect(page.locator('#help-card [data-button="minus"]')).toContainText('Previous');
    await expect(page.locator('#help-card [data-button="plus"]')).toContainText('Next');
  });

  test('the film keeps playing underneath (story 6)', async ({ page }) => {
    await openFilm(page);
    // The fixture serves no real media, so `paused` says nothing about whether
    // the card interfered — what would break the story is the card pausing or
    // unloading what is playing, so that is what is counted.
    await page.locator('#video').evaluate((v) => {
      window.__pauses = 0;
      const realPause = v.pause.bind(v);
      v.pause = function() { window.__pauses++; return realPause(); };
    });
    const wasPaused = await page.locator('#video').evaluate((v) => v.paused);
    await pressInfo(page);
    await expect(card(page)).toBeVisible();
    expect(await page.evaluate(() => window.__pauses)).toBe(0);
    expect(await page.locator('#video').evaluate((v) => v.paused)).toBe(wasPaused);
    await expect(page.locator('#video')).toHaveAttribute('src', /toy-story-main\.mp4/);
  });

  test('an arrow behind the card does not scrub the film (story 5)', async ({ page }) => {
    await openFilm(page);
    await page.locator('#screen-video').click();
    await pressInfo(page);
    const at = await page.locator('#video').evaluate((v) => v.currentTime);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('#video').evaluate((v) => v.currentTime)).toBeCloseTo(at, 1);
  });

  test('over the Queue, the card reads the Queue row', async ({ page }) => {
    await openFilm(page);
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
    await pressInfo(page);
    await expect(panel(page)).toHaveAttribute('data-surface', 'queue');
    await expect(page.locator('#help-card [data-button="home"]')).toContainText('Close the Queue');
  });
});

test('Info on the phone does nothing — the card is the TV\'s (story 7)', async ({ page }) => {
  // Deliberately NOT pressInfo: the phone has no card to wait for, which is the
  // point. The companion pages have their own initPage and never reach the TV
  // registry, so nothing wires `i` there.
  await page.goto('/companion/browse.html?profile=kids&person=kids');
  await expect(page.locator('#section-dock')).toBeVisible();
  await page.keyboard.press('i');
  await expect(page.locator('#help-card')).toHaveCount(0);
});
