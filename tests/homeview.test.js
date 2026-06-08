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

test('click Kids shows the content-type sidebar, landing on Series', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  // No mid-watch -> no Continue tab; tabs follow content present, fixed order.
  await expect(page.locator('.sidebar-tab')).toHaveText(['Series', 'Films', 'Home Movies']);
  // Default landing = first tab (Series); its genre rail holds Bluey.
  await expect(page.locator('.sidebar-tab[data-tab="series"]')).toHaveClass(/active/);
  await expect(page.locator('.rail-title')).toHaveText(['Animation']);
  await expect(page.locator('.rail-row[data-rail="genre:animation"] .film-tile[data-id="bluey"]')).toHaveCount(1);
});

test('selecting the Films tab swaps in genre rails (A-Z), a film in each matching genre', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await expect(page.locator('.rail-title')).toHaveText(['Animation', 'Comedy']);
  // Toy Story (animation+comedy) appears in both rails; Nemo (type fallback) only Animation.
  await expect(page.locator('.rail-row[data-rail="genre:animation"] .film-tile')).toHaveCount(2);
  await expect(page.locator('.rail-row[data-rail="genre:comedy"] .film-tile[data-id="toy-story-main"]')).toHaveCount(1);
});

test('Home Movies tab shows person rails', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="home-movies"]').click();
  await expect(page.locator('.rail-title')).toHaveText(['Millie']);
  await expect(page.locator('.rail-row[data-rail="person:millie"] .film-tile[data-id="millie-walk"]')).toHaveCount(1);
});

test('Continue tab leads and is the default landing when a video is mid-watch', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [
      { item_id: 'finding-nemo-main', position_secs: 1200, duration_secs: 6000, last_watched: '2026-06-05T00:00:00Z' }
    ] })
  }));
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('.sidebar-tab')).toHaveText(['Continue Watching', 'Series', 'Films', 'Home Movies']);
  await expect(page.locator('.sidebar-tab[data-tab="continue"]')).toHaveClass(/active/);
  await expect(page.locator('.rail-row[data-rail="continue"] .film-tile')).toHaveCount(1);
  await expect(page.locator('.rail-row[data-rail="continue"] .film-tile[data-id="finding-nemo-main"] .tile-progress-fill')).toBeVisible();
});

test('Adults unlocks with the correct PIN and lands on its genre rails', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/active/);
  await page.locator('.key[data-key="1"]').click();
  await page.locator('.key[data-key="2"]').click();
  await page.locator('.key[data-key="3"]').click();
  await page.locator('.key[data-key="4"]').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('.sidebar-tab')).toHaveText(['Films']);
  await expect(page.locator('.rail-title')).toHaveText(['Action']);
  await expect(page.locator('.film-tile[data-id="dark-knight-main"] .tile-title')).toContainText('The Dark Knight');
});

test('Kids profile request is scoped server-side (no adults content)', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  const titles = await page.locator('.tile-title').allTextContents();
  expect(titles).not.toContain('The Dark Knight');
});

test('the profile control returns to the Who\'s watching picker (BUG-007)', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('#profile-label')).toContainText('Kids');
  await page.locator('#profile-label').click();
  await expect(page.locator('#screen-profile')).toBeVisible();
});

test('d-pad Up from the top rail reaches the profile control; Enter opens the picker', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.rail-row .film-tile').first().focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#profile-label')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-profile')).toBeVisible();
});

test('switching profile re-requires the PIN to re-enter locked Adults (respect the lock)', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  // #screen-browse can be visible from static markup before the browse module
  // has wired #profile-label's click handler — CI's slower module eval then
  // drops an early click. The label's text is set by renderBrowse (after load),
  // so gating on it guarantees the handler is attached (CI flake fix).
  await expect(page.locator('#profile-label')).toHaveText(/Kids/);
  await page.locator('#profile-label').click();
  await expect(page.locator('#screen-profile')).toBeVisible();
  await page.locator('#btn-adults').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/active/);
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
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /\/media\/toy-story-main\.mp4/);
});

// BUG-008: a companion `select` carries only an id and its tab is decoupled
// from the app's, so the chosen card is often absent from the live DOM. The old
// handler fell back to clicking document.activeElement — re-opening the focused
// (last-watched) tile. Reproduce the trap: sit on the Films tab with a film
// focused, then select an off-tab Series id over the WS. It must open that
// series' detail, not replay the focused film.
test('companion select resolves an off-tab series to its detail, not the focused film (BUG-008)', async ({ page }) => {
  let appWs = null;
  await page.routeWebSocket(/:8766/, function(ws) { appWs = ws; });
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().focus();
  await expect(page.locator('.film-tile[data-id="bluey"]')).toHaveCount(0);
  await expect.poll(function() { return appWs !== null; }).toBe(true);
  await appWs.send(JSON.stringify({ type: 'intent', payload: { intent: 'select', params: { id: 'bluey' } } }));
  await expect(page).toHaveURL(/detail\.html\?series=bluey/);
});

// BUG-009: SELECT[card.kind](card) threw a TypeError for any kind outside
// video/series. The backend only emits those two, so this guards a
// malformed/future card — selecting one is a silent no-op (stays on browse, no
// uncaught error), not a thrown handler. Inject a bogus-kind card into the
// catalog and select it over the WS.
test('onSelect ignores an unknown card kind without throwing (BUG-009)', async ({ page }) => {
  var errors = [];
  page.on('pageerror', function(e) { errors.push(e.message); });
  let appWs = null;
  await page.routeWebSocket(/:8766/, function(ws) { appWs = ws; });
  await page.route('**/api/browse**', function(route) {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: 'kids', content: [
      { kind: 'video', id: 'toy-story-main', title: 'Toy Story', poster: 'toy-story.jpg', duration: 4860, type: 'animation', format: 'film', genres: ['comedy'], people: null },
      { kind: 'mystery', id: 'weird-x', title: 'Weird', poster: 'weird-x.jpg', type: 'animation', format: 'film', genres: null, people: null }
    ] }) });
  });
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect.poll(function() { return appWs !== null; }).toBe(true);
  await appWs.send(JSON.stringify({ type: 'intent', payload: { intent: 'select', params: { id: 'weird-x' } } }));
  await page.waitForTimeout(200);
  await expect(page).toHaveURL(/browse\.html/);
  expect(errors).toEqual([]);
});

test('Escape key returns to browse screen', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('Backspace key returns to browse screen', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('focus returns to source tile after Escape', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.film-tile[data-id="toy-story-main"]').first()).toBeFocused();
});

test('Enter on focused video tile opens video screen', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
});

test('arrow keys scroll within a rail', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  const first = page.locator('.rail-row[data-rail="genre:animation"] .film-tile').nth(0);
  const second = page.locator('.rail-row[data-rail="genre:animation"] .film-tile').nth(1);
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
});

test('arrow down moves between genre rails', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.rail-row[data-rail="genre:animation"] .film-tile').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.rail-row[data-rail="genre:comedy"] .film-tile').first()).toBeFocused();
});

test('ArrowLeft at the first column hops into the sidebar; ArrowRight returns to the rails', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.rail-row[data-rail="genre:animation"] .film-tile').first().focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.rail-row .film-tile').first()).toBeFocused();
});

test('ArrowDown in the sidebar moves to the next tab and swaps the rails', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="series"]').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeFocused();
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toHaveClass(/active/);
  await expect(page.locator('.rail-title')).toHaveText(['Animation', 'Comedy']);
});

test('ArrowUp from the top tab reaches the collapse toggle; Enter collapses the sidebar', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="series"]').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.sidebar-toggle')).toBeFocused();
  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  // Toggle again to expand.
  await page.keyboard.press('Enter');
  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
});

test('from the toggle, ArrowDown returns to the first tab and ArrowUp reaches the profile control', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="series"]').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.sidebar-toggle')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.sidebar-tab[data-tab="series"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#profile-label')).toBeFocused();
});

async function goToVideoScreen(page) {
  await page.locator('#btn-kids').click();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().click();
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
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="finding-nemo-main"]').click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-cc')).toHaveClass(/hidden/);
});

test('subtitles show by default on first play, backend unset (BUG-003)', async ({ page }) => {
  await goToVideoScreen(page);
  // FEAT-023: captions are server-backed; the legacy localStorage key is never written.
  expect(await page.evaluate(() => localStorage.getItem('grew-tv:captions'))).toBeNull();
  await expect(page.locator('#btn-cc')).not.toHaveClass(/cc-off/);
  await expect.poll(() => page.evaluate(() => document.getElementById('video').textTracks[0].mode)).toBe('showing');
});

test('CC preference is sticky across videos via the backend', async ({ page }) => {
  await goToVideoScreen(page);
  await expect(page.locator('#btn-cc')).not.toHaveClass(/cc-off/);
  await page.locator('#btn-cc').click();
  await expect(page.locator('#btn-cc')).toHaveClass(/cc-off/);
  // No localStorage write — the toggle persisted to the backend (fixture state).
  expect(await page.evaluate(() => localStorage.getItem('grew-tv:captions'))).toBeNull();
  await page.goto('/app/homeview/video.html?video=bluey-s1e01');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-cc')).not.toHaveClass(/hidden/);
  await expect(page.locator('#btn-cc')).toHaveClass(/cc-off/);   // seeded from backend on boot
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
