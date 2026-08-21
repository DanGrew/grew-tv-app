const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-486 (revision, owner 2026-08-21) — a Play All rail tile now opens a
// plain clip LIST first, like a boxset/series (screen-detail-page.js), rather
// than starting playback directly. The list is assembled client-side from the
// SAME /api/browse cards the Home Movies rails already load (home-rails.js
// homeMoviesListItems) — no backend endpoint. The header "▶ Play All" button
// and each row both hand off to video.html's existing homeMoviesAll/
// homeMoviesPerson entry (tests/video-home-movies.test.js covers what that
// entry itself does).

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/profile.html');
});

async function enterList(page, tileId) {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="home-movies"]').click();
  await page.locator('.film-tile[data-id="' + tileId + '"]').click();
  await expect(page).toHaveURL(/home-movies-list\.html/);
  await expect(page.locator('.detail-row').first()).toBeVisible();
}

test('the All tile opens a list of every home-movie clip', async ({ page }) => {
  await enterList(page, 'play-all:All');
  await expect(page.locator('#detail-title')).toHaveText('All');
  await expect(page.locator('.detail-row')).toHaveCount(2);
  await expect(page.locator('#detail-meta')).toHaveText('Home videos · 2 clips');
});

test('a kid tile opens a list scoped to that kid\'s clips', async ({ page }) => {
  await enterList(page, 'play-all:Millie');
  await expect(page.locator('#detail-title')).toHaveText('Millie');
  await expect(page.locator('.detail-row')).toHaveCount(2);
});

// TASK-491 — both fixture clips are captured in January 2026 (tests/fixtures/api.js),
// so the month tile's own list is the same two-item scope as the kid tile above.
test('a month tile opens a list scoped to that month\'s clips', async ({ page }) => {
  await enterList(page, 'play-all:Jan 2026');
  await expect(page.locator('#detail-title')).toHaveText('Jan 2026');
  await expect(page.locator('.detail-row')).toHaveCount(2);
});

test('the header Play All button starts the scoped source, unshuffled, from the top', async ({ page }) => {
  await enterList(page, 'play-all:Millie');
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.locator('#btn-play-next').click();
  await expect(page).toHaveURL(/video\.html\?.*homeMoviesPerson=millie/);
  expect(JSON.parse((await playSource).postData())).toEqual({ source_type: 'home-movies-by-person', source_id: 'millie', item_id: null });
});

test('tapping a row plays that specific clip via item_id', async ({ page }) => {
  await enterList(page, 'play-all:All');
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.locator('.detail-row[data-id="beach-day"]').click();
  await expect(page).toHaveURL(/video\.html\?.*video=beach-day/);
  expect(JSON.parse((await playSource).postData())).toEqual({ source_type: 'home-movies-all', item_id: 'beach-day' });
});

// TASK-491 — the month tile's own header Play All button, mirroring the kid
// tile's own test above.
test('the header Play All button starts the month-scoped source, unshuffled, from the top', async ({ page }) => {
  await enterList(page, 'play-all:Jan 2026');
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.locator('#btn-play-next').click();
  await expect(page).toHaveURL(/video\.html\?.*homeMoviesMonth=2026-01/);
  expect(JSON.parse((await playSource).postData())).toEqual({ source_type: 'home-movie-month', source_id: '2026-01', item_id: null });
});

// TASK-491 — a tapped row in a month-scoped list, mirroring the All-scoped test above.
test('tapping a row in a month-scoped list plays that specific clip via item_id', async ({ page }) => {
  await enterList(page, 'play-all:Jan 2026');
  const playSource = page.waitForRequest(function(req) {
    return req.url().includes('/api/video-playback/play-source') && req.method() === 'POST';
  });
  await page.locator('.detail-row[data-id="beach-day"]').click();
  await expect(page).toHaveURL(/video\.html\?.*video=beach-day/);
  expect(JSON.parse((await playSource).postData())).toEqual({ source_type: 'home-movie-month', source_id: '2026-01', item_id: 'beach-day' });
});

test('Back from the list returns to the Home Movies tab', async ({ page }) => {
  await enterList(page, 'play-all:All');
  await page.keyboard.press('Backspace');
  await expect(page).toHaveURL(/tab=home-movies/);
  await expect(page.locator('.rail-row[data-rail="home-movies-play-all"]')).toBeVisible();
});
