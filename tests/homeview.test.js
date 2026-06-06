const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

const BROWSE_URL = 'http://localhost:8765/api/browse**';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.goto('/app/homeview/profile.html');
});

test('profile screen shown on load, Kids button focused', async ({ page }) => {
  await expect(page.locator('#screen-profile')).toBeVisible();
  await expect(page.locator('#btn-kids')).toBeFocused();
});

test('click Kids loads home rails (Series then Films) with kids cards', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  // No mid-watch progress -> Continue Watching omitted; leads with Series.
  await expect(page.locator('.rail-title')).toHaveText(['Series', 'Films']);
  await expect(page.locator('.film-tile')).toHaveCount(3);
  await expect(page.locator('.film-tile[data-id="toy-story-main"] .tile-title')).toContainText('Toy Story');
  await expect(page.locator('.rail-row[data-rail="series"] .film-tile')).toHaveCount(1);
  await expect(page.locator('.rail-row[data-rail="films"] .film-tile')).toHaveCount(2);
});

test('Continue Watching rail leads when a video is mid-watch', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [
      { item_id: 'finding-nemo-main', position_secs: 1200, duration_secs: 6000, last_watched: '2026-06-05T00:00:00Z' }
    ] })
  }));
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('.rail-title')).toHaveText(['Continue Watching', 'Series', 'Films']);
  await expect(page.locator('.rail-row[data-rail="continue"] .film-tile')).toHaveCount(1);
  await expect(page.locator('.rail-row[data-rail="continue"] .film-tile[data-id="finding-nemo-main"] .tile-progress-fill')).toBeVisible();
});

test('Adults unlocks with the correct PIN and loads adults cards', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/active/);
  await page.locator('.key[data-key="1"]').click();
  await page.locator('.key[data-key="2"]').click();
  await page.locator('.key[data-key="3"]').click();
  await page.locator('.key[data-key="4"]').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('.rail-title')).toHaveText(['Films']);
  await expect(page.locator('.film-tile')).toHaveCount(1);
  await expect(page.locator('.film-tile[data-id="dark-knight-main"] .tile-title')).toContainText('The Dark Knight');
});

test('Kids profile request is scoped server-side (no adults content)', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  const titles = await page.locator('.tile-title').allTextContents();
  expect(titles).not.toContain('The Dark Knight');
});

test('browse 500 shows error screen', async ({ page }) => {
  await page.route(BROWSE_URL, route => route.fulfill({ status: 500 }));
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-error')).toBeVisible();
  await expect(page.locator('#screen-browse')).not.toBeVisible();
});

test('retry button on error returns to profile select', async ({ page }) => {
  await page.route(BROWSE_URL, route => route.fulfill({ status: 500 }));
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-error')).toBeVisible();
  await page.locator('#btn-retry').click();
  await expect(page.locator('#screen-profile')).toBeVisible();
});

test('select standalone video plays directly with src set', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /\/media\/toy-story-main\.mp4/);
});

test('Escape key returns to browse screen', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('Backspace key returns to browse screen', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('focus returns to source tile after Escape', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.film-tile[data-id="toy-story-main"]')).toBeFocused();
});

test('Enter on focused video tile opens video screen', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
});

test('arrow keys scroll within a rail', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  const firstFilm = page.locator('.rail-row[data-rail="films"] .film-tile').nth(0);
  const secondFilm = page.locator('.rail-row[data-rail="films"] .film-tile').nth(1);
  await firstFilm.focus();
  await expect(firstFilm).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(secondFilm).toBeFocused();
});

test('arrow down moves from Series rail to Films rail', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.rail-row[data-rail="series"] .film-tile[data-id="bluey"]').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.rail-row[data-rail="films"] .film-tile').first()).toBeFocused();
});

async function goToVideoScreen(page) {
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
}

async function goToSeriesEpisode(page) {
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
}

async function mockVideoTime(page, currentTime, duration) {
  await page.evaluate(({ ct, dur }) => {
    const v = document.getElementById('video');
    let _time = ct;
    Object.defineProperty(v, 'duration', { get: () => dur, configurable: true });
    Object.defineProperty(v, 'currentTime', {
      get: () => _time,
      set: val => { _time = val; },
      configurable: true
    });
  }, { ct: currentTime, dur: duration });
}

test('series transport shows prev / play-pause / next / jump', async ({ page }) => {
  await goToSeriesEpisode(page);
  await expect(page.locator('#btn-prev')).toBeVisible();
  await expect(page.locator('#btn-next')).toBeVisible();
  await expect(page.locator('#btn-jump')).toBeVisible();
});

test('series Next button advances to the next episode immediately', async ({ page }) => {
  await goToSeriesEpisode(page);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);
});

test('series Prev button steps back in order (wraps)', async ({ page }) => {
  await goToSeriesEpisode(page);
  await page.locator('#btn-prev').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e03/);
});

test('standalone film hides prev / next (no episodes)', async ({ page }) => {
  await goToVideoScreen(page);
  await expect(page.locator('#btn-prev')).toHaveClass(/hidden/);
  await expect(page.locator('#btn-next')).toHaveClass(/hidden/);
  await expect(page.locator('#btn-jump')).toBeVisible();
});

test('clicking Jump opens the jump popup', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-jump').click();
  await expect(page.locator('.jump-popup')).toBeVisible();
});

test('jump popup shows 10 graduated options', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-jump').click();
  await expect(page.locator('.jump-popup .jump-grid button')).toHaveCount(10);
});

test('jump popup default focus is +10s', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-jump').click();
  await expect(page.locator('.jump-popup button[data-delta="10"]')).toBeFocused();
});

test('forward jump adds exact delta to currentTime', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-jump').click();
  await page.locator('.jump-popup button[data-delta="120"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(720);
});

test('back jump subtracts exact delta from currentTime', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-jump').click();
  await page.locator('.jump-popup button[data-delta="-30"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(570);
});

test('back jump clamps to 0', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 5, 3600);
  await page.locator('#btn-jump').click();
  await page.locator('.jump-popup button[data-delta="-1800"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(0);
});

test('forward jump clamps to duration', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 3590, 3600);
  await page.locator('#btn-jump').click();
  await page.locator('.jump-popup button[data-delta="1800"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(3600);
});

test('selecting a jump option closes the popup', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-jump').click();
  await page.locator('.jump-popup button[data-delta="10"]').click();
  await expect(page.locator('.jump-popup')).toHaveCount(0);
});

test('Escape closes jump popup without seeking', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-jump').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.jump-popup')).toHaveCount(0);
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(600);
});

test('ArrowRight in jump popup moves focus one cell', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-jump').click();
  await expect(page.locator('.jump-popup button[data-delta="10"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.jump-popup button[data-delta="30"]')).toBeFocused();
});

test('ArrowUp in jump popup moves focus one row', async ({ page }) => {
  await goToVideoScreen(page);
  await page.locator('#btn-jump').click();
  await expect(page.locator('.jump-popup button[data-delta="10"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.jump-popup button[data-delta="-10"]')).toBeFocused();
});

test('Enter in jump popup selects focused option and closes', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.locator('#btn-jump').click();
  await expect(page.locator('.jump-popup button[data-delta="10"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.jump-popup')).toHaveCount(0);
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(610);
});

test('d-pad Right quick-skips +10s without a popup', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.jump-popup')).toHaveCount(0);
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(610);
});

test('d-pad Left quick-skips -10s without a popup', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await page.keyboard.press('ArrowLeft');
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(590);
});

test('ArrowDown cycles transport focus play-pause -> next', async ({ page }) => {
  await goToSeriesEpisode(page);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-next')).toBeFocused();
});

test('ArrowUp cycles transport focus play-pause -> prev', async ({ page }) => {
  await goToSeriesEpisode(page);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#btn-prev')).toBeFocused();
});

test('CC button shows for a video with subtitles', async ({ page }) => {
  await goToVideoScreen(page);
  await expect(page.locator('#btn-cc')).not.toHaveClass(/hidden/);
});

test('CC button hidden for a video without subtitles', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.film-tile[data-id="finding-nemo-main"]').click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-cc')).toHaveClass(/hidden/);
});

test('CC preference is sticky across videos', async ({ page }) => {
  await goToVideoScreen(page);
  await expect(page.locator('#btn-cc')).toHaveClass(/cc-off/);
  await page.locator('#btn-cc').click();
  await expect(page.locator('#btn-cc')).not.toHaveClass(/cc-off/);
  expect(await page.evaluate(() => localStorage.getItem('grew-tv:captions'))).toBe('on');
  await page.goto('/app/homeview/video.html?video=bluey-s1e01');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-cc')).not.toHaveClass(/hidden/);
  await expect(page.locator('#btn-cc')).not.toHaveClass(/cc-off/);
});

test('standalone film at end returns to its origin', async ({ page }) => {
  await goToVideoScreen(page);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('series at 100% shows an Up next countdown', async ({ page }) => {
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#upnext-overlay')).toBeVisible();
  await expect(page.locator('#upnext-text')).toContainText('The Weekend');
});

test('Up next countdown is cancellable and returns to detail', async ({ page }) => {
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#upnext-overlay')).toBeVisible();
  await page.locator('#btn-upnext-cancel').click();
  await expect(page).toHaveURL(/detail\.html/);
});
