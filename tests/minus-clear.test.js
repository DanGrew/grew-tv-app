const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-526/TASK-643 — the couch remote's − sends `-`. On Browse it clears the
// focused tile's watch progress, two presses to do it: the first arms the tile
// ("Clear progress?"), the second clears, and moving off disarms. A press that
// should clear nothing is proved by watching for the DELETE that never comes.

// Finding Nemo is part-watched by the kids: it is on Films' Continue Watching
// rail AND on its genre rail with a bar. The rows are this test's own, and a
// DELETE drops the row the way the backend does, so a reload reads the clear.
async function seedProgress(page) {
  const rows = [{ item_id: 'finding-nemo-main', title: 'Finding Nemo', poster: 'nemo.jpg', collection_id: null, collection_title: null, position_secs: 600, duration_secs: 6000, last_watched: 1 }];
  const deleted = [];
  await page.route('**/api/continue-watching**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ person: 'kids', content: rows, recents: [] })
  }));
  await page.route('**/api/progress/*', (route) => {
    const req = route.request();
    if (req.method() !== 'DELETE') return route.fallback();
    const url = new URL(req.url());
    deleted.push(url.pathname.split('/').pop() + '?person=' + url.searchParams.get('person'));
    rows.splice(0, rows.length, ...rows.filter((r) => r.item_id !== url.pathname.split('/').pop()));
    return route.fulfill({ status: 204, body: '' });
  });
  return deleted;
}

const cwNemo = (page) => page.locator('.rail-row[data-rail="continue"] .film-tile[data-id="finding-nemo-main"]');
const railNemo = (page) => page.locator('.rail-row:not([data-rail="continue"]) .film-tile[data-id="finding-nemo-main"]');

async function openFilms(page) {
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await expect(cwNemo(page)).toBeVisible();
}

async function minusOn(page, locator) {
  await locator.focus();
  await page.keyboard.press('-');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grew-tv-person', 'kids'));
  await installApi(page);
});

// Story 1
test('− on a tile with progress arms it to read "Clear progress?", and clears nothing yet', async ({ page }) => {
  const deleted = await seedProgress(page);
  await openFilms(page);
  await minusOn(page, cwNemo(page));
  await expect(cwNemo(page).locator('.tile-armed')).toHaveText('Clear progress?');
  await expect(cwNemo(page)).toBeFocused();
  await expect(page).toHaveURL(/browse\.html/);
  expect(deleted).toEqual([]);
});

// Story 2
test('− again clears it: it leaves Continue Watching and its bar goes from every rail', async ({ page }) => {
  const deleted = await seedProgress(page);
  await openFilms(page);
  await expect(railNemo(page).locator('.tile-progress')).toBeVisible();
  await minusOn(page, cwNemo(page));
  await page.keyboard.press('-');
  await expect(page.locator('.rail-row[data-rail="continue"]')).toHaveCount(0);
  await expect(railNemo(page).locator('.tile-progress')).toHaveCount(0);
  expect(deleted).toEqual(['finding-nemo-main?person=kids']);
  // Focus is not lost with the rail it was on.
  await expect(page.locator('.rail-row .film-tile').first()).toBeFocused();
  // And it stays cleared: the next load reads it from the backend.
  await page.reload();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await expect(railNemo(page)).toBeVisible();
  await expect(page.locator('.rail-row[data-rail="continue"]')).toHaveCount(0);
  await expect(railNemo(page).locator('.tile-progress')).toHaveCount(0);
});

// Story 2 — a genre-rail tile clears the same way, and keeps focus where it was.
test('− twice on the same film on its genre rail clears it too, and focus stays on it', async ({ page }) => {
  const deleted = await seedProgress(page);
  await openFilms(page);
  await minusOn(page, railNemo(page));
  await expect(railNemo(page).locator('.tile-armed')).toHaveText('Clear progress?');
  await page.keyboard.press('-');
  await expect(page.locator('.rail-row[data-rail="continue"]')).toHaveCount(0);
  await expect(railNemo(page).locator('.tile-progress')).toHaveCount(0);
  await expect(railNemo(page)).toBeFocused();
  expect(deleted).toEqual(['finding-nemo-main?person=kids']);
});

// Story 3
test('− once then moving off puts the tile back to normal, and clears nothing', async ({ page }) => {
  const deleted = await seedProgress(page);
  await openFilms(page);
  await minusOn(page, railNemo(page));
  await expect(railNemo(page).locator('.tile-armed')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(railNemo(page)).not.toBeFocused();
  await expect(railNemo(page).locator('.tile-armed')).toHaveCount(0);
  await expect(railNemo(page)).not.toHaveClass(/armed/);
  // Back on it, one − only arms again — it does not clear.
  await page.keyboard.press('ArrowLeft');
  await expect(railNemo(page)).toBeFocused();
  await page.keyboard.press('-');
  await expect(railNemo(page).locator('.tile-armed')).toBeVisible();
  await expect(cwNemo(page)).toBeVisible();
  expect(deleted).toEqual([]);
});

// Story 4
test('− on a tile with no progress does nothing', async ({ page }) => {
  const deleted = await seedProgress(page);
  await openFilms(page);
  const toyStory = page.locator('.film-tile[data-id="toy-story-main"]').first();
  await minusOn(page, toyStory);
  await page.keyboard.press('-');
  await expect(toyStory.locator('.tile-armed')).toHaveCount(0);
  await expect(toyStory).toBeFocused();
  await expect(cwNemo(page)).toBeVisible();
  expect(deleted).toEqual([]);
});

// Story 4 — a series tile shows its furthest episode's bar, but it is not one
// item's progress, so − leaves it alone.
test('− on a series tile does nothing', async ({ page }) => {
  const deleted = await seedProgress(page);
  await openFilms(page);
  await page.locator('.sidebar-tab[data-tab="series"]').click();
  const bluey = page.locator('.film-tile[data-id="bluey"]');
  await minusOn(page, bluey);
  await page.keyboard.press('-');
  await expect(bluey.locator('.tile-armed')).toHaveCount(0);
  expect(deleted).toEqual([]);
});

// A clear the backend refuses is not drawn as done.
test('a clear the backend refuses leaves the progress, disarms the tile and says so', async ({ page }) => {
  await seedProgress(page);
  await page.route('**/api/progress/*', (route) => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 500, body: '' })
    : route.fallback());
  await openFilms(page);
  await minusOn(page, cwNemo(page));
  await page.keyboard.press('-');
  await expect(page.locator('#queue-status')).toHaveText('Could not clear progress.');
  await expect(cwNemo(page)).toBeVisible();
  await expect(cwNemo(page).locator('.tile-armed')).toHaveCount(0);
  await expect(railNemo(page).locator('.tile-progress')).toBeVisible();
});

// Story 5
test('Info on Browse lists − as clearing the focused item\'s progress', async ({ page }) => {
  await seedProgress(page);
  await openFilms(page);
  await cwNemo(page).focus();
  await page.keyboard.press('i');
  await expect(page.locator('.help-row[data-button="minus"] .help-words')).toHaveText("Clear the focused item's progress (press twice)");
});

// Story 6 — off Browse, − is what it was: nothing on a series page.
test('− on a series page clears nothing', async ({ page }) => {
  const deleted = await seedProgress(page);
  await page.goto('/app/homeview/detail.html?series=bluey&profile=kids');
  await expect(page.locator('.detail-row')).toHaveCount(3);
  await minusOn(page, page.locator('.detail-row[data-id="bluey-s1e01"]'));
  await page.keyboard.press('-');
  await expect(page.locator('.tile-armed')).toHaveCount(0);
  await expect(page).toHaveURL(/detail\.html/);
  expect(deleted).toEqual([]);
});
