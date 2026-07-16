const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// Host-agnostic: the app derives its backend from the page origin (BUG-009), so
// match by path glob, not a hardcoded host.
const BROWSE_URL = '**/api/browse**';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/profile.html');
});

test('profile screen shown on load, Kids button focused', async ({ page }) => {
  await expect(page.locator('#screen-profile')).toBeVisible();
  await expect(page.locator('#btn-kids')).toBeFocused();
});

test('click Kids shows the content-type sidebar, landing on Series', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  // No mid-watch -> no Continue tab; tabs follow content present, fixed order.
  await expect(page.locator('.sidebar-tab')).toHaveText(['TV Series', 'Films', 'Home Movies']);
  // Default landing = first tab (Series); its genre rail holds Bluey.
  await expect(page.locator('.sidebar-tab[data-tab="series"]')).toHaveClass(/active/);
  await expect(page.locator('.rail-title')).toHaveText(['Animation']);
  await expect(page.locator('.rail-row[data-rail="genre:animation"] .film-tile[data-id="bluey"]')).toHaveCount(1);
});

test('selecting the Films tab swaps in genre rails (A-Z), a film in each matching genre', async ({ page }) => {
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await expect(page.locator('.rail-title')).toHaveText(['Animation', 'Comedy']);
  // Toy Story (animation+comedy) appears in both rails; Nemo (type fallback) only Animation.
  await expect(page.locator('.rail-row[data-rail="genre:animation"] .film-tile')).toHaveCount(2);
  await expect(page.locator('.rail-row[data-rail="genre:comedy"] .film-tile[data-id="toy-story-main"]')).toHaveCount(1);
});

// Regression (Safari/iOS WebKit): macOS Safari and iOS do NOT give a <button>
// keyboard focus when it is clicked, so the tab's `focus`-driven selectTab never
// fired and the rail silently stayed put. dispatchEvent('click') reproduces that
// here — it runs the click handler WITHOUT the focus that Playwright's real
// .click() triggers (Chrome/Android focus on click and masked the bug). Pre-fix
// this assertion failed: the rail stayed on Series (only ['Animation']).
test('Films tab switches the rail on a focus-less click (Safari/iOS WebKit)', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('.sidebar-tab[data-tab="series"]')).toHaveClass(/active/);
  await page.locator('.sidebar-tab[data-tab="films"]').dispatchEvent('click');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toHaveClass(/active/);
  await expect(page.locator('.rail-title')).toHaveText(['Animation', 'Comedy']);
  await expect(page.locator('.rail-row[data-rail="genre:comedy"] .film-tile[data-id="toy-story-main"]')).toHaveCount(1);
});

test('Home Movies tab shows Collections + Videos structural rails, no person rails (TASK-183)', async ({ page }) => {
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="home-movies"]').click();
  // millie-walk is a standalone home movie -> the Videos rail only (no series
  // collection in the fixture, no person rails).
  await expect(page.locator('.rail-title')).toHaveText(['Videos']);
  await expect(page.locator('.rail-row[data-rail="videos"] .film-tile[data-id="millie-walk"]')).toHaveCount(1);
  await expect(page.locator('.rail-row[data-rail^="person:"]')).toHaveCount(0);
});

test('each content-type tab leads with a Continue Watching rail of its in-progress items (TASK-150)', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [
      { item_id: 'bluey-s1e01', title: 'Daddy Putdown', poster: 'bluey.jpg', position_secs: 200, duration_secs: 420, last_watched: '2026-06-06T00:00:00Z', format: 'tv-series', collection_id: 'bluey', collection_title: 'Bluey' },
      { item_id: 'finding-nemo-main', title: 'Finding Nemo', poster: 'nemo.jpg', position_secs: 1200, duration_secs: 6000, last_watched: '2026-06-05T00:00:00Z', format: 'film', collection_id: null, collection_title: null }
    ] })
  }));
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  // No standalone Continue tab any more — it is a rail inside each tab.
  await expect(page.locator('.sidebar-tab')).toHaveText(['TV Series', 'Films', 'Home Movies']);
  await expect(page.locator('.sidebar-tab[data-tab="continue"]')).toHaveCount(0);

  // Series tab (default landing) leads with a Continue Watching rail showing the
  // in-progress EPISODE (not the series), labelled "{series} · {episode}".
  await expect(page.locator('.rail-title').first()).toHaveText('Continue Watching');
  const seriesCw = page.locator('.rail-row[data-rail="continue"]');
  await expect(seriesCw.locator('.film-tile')).toHaveCount(1);
  await expect(seriesCw.locator('.film-tile[data-id="bluey-s1e01"] .tile-title')).toHaveText('Bluey · Daddy Putdown');
  await expect(seriesCw.locator('.film-tile[data-id="bluey-s1e01"] .tile-progress-fill')).toBeVisible();

  // Films tab leads with its own Continue Watching rail (the film, not the episode).
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  const filmsCw = page.locator('.rail-row[data-rail="continue"]');
  await expect(filmsCw.locator('.film-tile')).toHaveCount(1);
  await expect(filmsCw.locator('.film-tile[data-id="finding-nemo-main"] .tile-progress-fill')).toBeVisible();
});

test('Adults unlocks with the correct PIN and lands on its genre rails', async ({ page }) => {
  await pickPerson(page, 'adults');
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
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  const titles = await page.locator('.tile-title').allTextContents();
  expect(titles).not.toContain('The Dark Knight');
});

test('the profile control returns to the Who\'s watching picker (BUG-007)', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('#profile-label')).toContainText('Kids');
  // FEAT-033: the bar badges the active person's authored config.json emoji
  // (kids has '🦖'), not the class-default face '🧒' — proving it's person-driven.
  await expect(page.locator('#profile-label')).toContainText('🦖');
  await page.locator('#profile-label').click();
  await expect(page.locator('#screen-profile')).toBeVisible();
});

test('d-pad Up from the top rail reaches the profile control; Enter opens the picker', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.rail-row .film-tile').first().focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#profile-label')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-profile')).toBeVisible();
});

test('switching profile re-requires the PIN to re-enter locked Adults (respect the lock)', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  // #screen-browse can be visible from static markup before the browse module
  // has wired #profile-label's click handler — CI's slower module eval then
  // drops an early click. The label's text is set by renderBrowse (after load),
  // so gating on it guarantees the handler is attached (CI flake fix).
  await expect(page.locator('#profile-label')).toHaveText(/Kids/);
  await page.locator('#profile-label').click();
  await expect(page.locator('#screen-profile')).toBeVisible();
  await pickPerson(page, 'adults');
  await expect(page.locator('#pin-panel')).toHaveClass(/active/);
});

test('browse 500 shows error screen', async ({ page }) => {
  await page.route(BROWSE_URL, route => route.fulfill({ status: 500 }));
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-error')).toBeVisible();
  await expect(page.locator('#screen-browse')).not.toBeVisible();
});

test('retry button on error returns to profile select', async ({ page }) => {
  await page.route(BROWSE_URL, route => route.fulfill({ status: 500 }));
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-error')).toBeVisible();
  // #screen-error renders from static markup before error.html's module attaches
  // #btn-retry's click handler (navTo profile), so under CI load an early click is
  // dropped and the page sits on the error screen. Focus is a FALSE readiness
  // signal here: <button autofocus> focuses #btn-retry before the module runs, so
  // toBeFocused passes too early. No DOM marker distinguishes "module wired" from
  // autofocus, so retry the click until the navigation actually lands.
  await expect(async () => {
    await page.locator('#btn-retry').click();
    await expect(page.locator('#screen-profile')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 5000 });
});

test('select standalone video plays directly with src set', async ({ page }) => {
  await pickPerson(page, 'kids');
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
  await pickPerson(page, 'kids');
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
      { kind: 'video', id: 'toy-story-main', title: 'Toy Story', poster: 'toy-story.jpg', duration: 4860, type: 'animation', section: 'films', genres: ['comedy'], people: null },
      { kind: 'mystery', id: 'weird-x', title: 'Weird', poster: 'weird-x.jpg', type: 'animation', section: 'films', genres: null, people: null }
    ] }) });
  });
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect.poll(function() { return appWs !== null; }).toBe(true);
  await appWs.send(JSON.stringify({ type: 'intent', payload: { intent: 'select', params: { id: 'weird-x' } } }));
  await page.waitForTimeout(200);
  await expect(page).toHaveURL(/browse\.html/);
  expect(errors).toEqual([]);
});

test('Escape key returns to browse screen', async ({ page }) => {
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('Backspace key returns to browse screen', async ({ page }) => {
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('focus returns to source tile after Escape', async ({ page }) => {
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.film-tile[data-id="toy-story-main"]').first()).toBeFocused();
});

test('Enter on focused video tile opens video screen', async ({ page }) => {
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
});

test('arrow keys scroll within a rail', async ({ page }) => {
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  const first = page.locator('.rail-row[data-rail="genre:animation"] .film-tile').nth(0);
  const second = page.locator('.rail-row[data-rail="genre:animation"] .film-tile').nth(1);
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
});

test('arrow down moves between genre rails', async ({ page }) => {
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.rail-row[data-rail="genre:animation"] .film-tile').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.rail-row[data-rail="genre:comedy"] .film-tile').first()).toBeFocused();
});

test('ArrowLeft at the first column hops into the sidebar; ArrowRight returns to the rails', async ({ page }) => {
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.rail-row[data-rail="genre:animation"] .film-tile').first().focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.rail-row .film-tile').first()).toBeFocused();
});

test('ArrowDown in the sidebar moves to the next tab and swaps the rails', async ({ page }) => {
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="series"]').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeFocused();
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toHaveClass(/active/);
  await expect(page.locator('.rail-title')).toHaveText(['Animation', 'Comedy']);
});

test('ArrowUp from the top tab reaches the collapse toggle; Enter collapses the sidebar', async ({ page }) => {
  await pickPerson(page, 'kids');
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

test('collapsing the sidebar hides the Home breadcrumb so it cannot straddle the narrowed bar', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#breadcrumb')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="series"]').focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  await expect(page.locator('#breadcrumb')).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.locator('#breadcrumb')).toBeVisible();
});

test('from the toggle, ArrowDown returns to the first tab and ArrowUp reaches the profile control', async ({ page }) => {
  await pickPerson(page, 'kids');
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
  await pickPerson(page, 'kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator('.film-tile[data-id="toy-story-main"]').first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  // BUG-031: #screen-video + focus only prove the page INITED (onEnter focuses
  // btn-play-pause synchronously). The <video> and its subtitle <track> are built
  // by a LATER async chain (play-video action -> WS snapshot -> swapVideo ->
  // loadProgress -> playVideo -> setSubtitleTrack). Under parallel CI load the
  // helper returned before that chain primed, so a caller reading
  // `video.textTracks[0].mode` hit undefined -> expect.poll fails fast on the throw
  // (it does NOT retry through an exception) — the ~1/438 subtitles-default flake at
  // l.575. Wait for the real post-nav settle signal: the media src set AND the CC
  // button un-hidden (toy-story-main has subtitles, so its track built => textTracks
  // is populated). Hardens every video test that shares this helper.
  await expect(page.locator('#video')).toHaveAttribute('src', /toy-story-main/);
  await expect(page.locator('#btn-cc')).toBeVisible();
}

// TASK-329 (BUG-031's settle rule, applied to the series helper). #screen-video +
// the play-pause focus only prove onEnter ran — the episode itself is built by a
// LATER async chain (play-video -> WS snapshot -> swapVideo -> /api/next). Callers
// that click #btn-next / #btn-prev or dispatch `ended` straight after were racing
// it: under parallel load Next lands back on the same episode and `ended` fires
// into a handler that doesn't know its successor yet. #video-upnext is the page's
// LAST async signal (set once the Promise.all load AND /api/next have resolved), so
// gating on it proves the page is fully primed. `upnext` is the expected line for
// this episode — 'Start again' at the end of a series.
async function goToEpisode(page, video, upnext) {
  await page.goto('/app/homeview/video.html?video=' + video + '&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await expect(page.locator('#video')).toHaveAttribute('src', new RegExp(video));
  await expect(page.locator('#video-upnext')).toHaveText(upnext);
}

async function goToSeriesEpisode(page) {
  await goToEpisode(page, 'bluey-s1e01', 'Up next: The Weekend');
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

// BUG-046 (BUG-019 auto-hide-disarm family): the video player hides #controls 3s
// after the last input (screen-video-player.js hideControls); #btn-jump lives
// INSIDE #controls, which gets pointer-events:none while hidden (video.html). So
// under parallel load, a slow setup step (mockVideoTime) between screen-entry and
// the click can let the 3s window elapse first — clicking #btn-jump is then a dead
// no-op, the jump popup never opens, and the downstream toBeFocused/toBeVisible
// times out. Summon the controls with a d-pad key first: handleVideoKey
// unconditionally calls showControls() (re-arms the timer + un-hides #controls).
// ArrowDown only cycles transport focus — it never changes video.currentTime — so
// every time assertion downstream still holds. Route ALL jump-popup opens through
// this so no sibling regresses into the same race.
async function openJumpPopup(page) {
  await page.keyboard.press('ArrowDown');
  await page.locator('#btn-jump').click();
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

// BUG-005: an episode opened from a Continue Watching tile (not via the series
// detail) used to launch with no series context, so Next/Prev were dead. The CW
// tile now carries its owning series so the player can advance from a tile launch.
test('Next works on an episode opened from a Continue Watching tile (BUG-005)', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ person: 'kids', content: [
      { item_id: 'bluey-s1e01', title: 'Daddy Putdown', poster: 'bluey.jpg', position_secs: 200, duration_secs: 420, last_watched: '2026-06-06T00:00:00Z', collection_id: 'bluey', collection_title: 'Bluey' }
    ] })
  }));
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.rail-row[data-rail="continue"] .film-tile[data-id="bluey-s1e01"]').click();
  // Launched WITH series context threaded from the tile (the bug: this was absent).
  await expect(page).toHaveURL(/video\.html\?.*series=bluey/);
  await expect(page.locator('#screen-video')).toBeVisible();
  // Series transport is live (not a seriesless standalone) and Next advances.
  await expect(page.locator('#btn-next')).not.toHaveClass(/hidden/);
  // Flake: under load Next occasionally lands back on s1e01 instead of advancing
  // to s1e02 (observed src null -> s1e01, never s1e02) — Next is clicked before the
  // video page has finished priming. The up-next line is the page's last async
  // signal (set after the Promise.all load + /api/next resolve), so gating on it
  // guarantees the page is fully primed before we manually advance.
  await expect(page.locator('#video-upnext')).toHaveText('Up next: The Weekend');
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);
});

// BUG-005 decision: Next at the last episode loops back to the first (no stop).
test('Next loops last->first at the end of the series (BUG-005)', async ({ page }) => {
  await goToEpisode(page, 'bluey-s1e03', 'Start again');
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
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
  await openJumpPopup(page);
  await expect(page.locator('.jump-popup')).toBeVisible();
});

test('jump popup shows 10 graduated options', async ({ page }) => {
  await goToVideoScreen(page);
  await openJumpPopup(page);
  await expect(page.locator('.jump-popup .jump-grid button')).toHaveCount(10);
});

test('jump popup default focus is +10s', async ({ page }) => {
  await goToVideoScreen(page);
  await openJumpPopup(page);
  await expect(page.locator('.jump-popup button[data-delta="10"]')).toBeFocused();
});

test('forward jump adds exact delta to currentTime', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await openJumpPopup(page);
  await page.locator('.jump-popup button[data-delta="120"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(720);
});

test('back jump subtracts exact delta from currentTime', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await openJumpPopup(page);
  await page.locator('.jump-popup button[data-delta="-30"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(570);
});

test('back jump clamps to 0', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 5, 3600);
  await openJumpPopup(page);
  await page.locator('.jump-popup button[data-delta="-1800"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(0);
});

test('forward jump clamps to duration', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 3590, 3600);
  await openJumpPopup(page);
  await page.locator('.jump-popup button[data-delta="1800"]').click();
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(3600);
});

test('selecting a jump option closes the popup', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await openJumpPopup(page);
  await page.locator('.jump-popup button[data-delta="10"]').click();
  await expect(page.locator('.jump-popup')).toHaveCount(0);
});

test('Escape closes jump popup without seeking', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await openJumpPopup(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.jump-popup')).toHaveCount(0);
  const time = await page.evaluate(() => document.getElementById('video').currentTime);
  expect(time).toBe(600);
});

test('ArrowRight in jump popup moves focus one cell', async ({ page }) => {
  await goToVideoScreen(page);
  await openJumpPopup(page);
  await expect(page.locator('.jump-popup button[data-delta="10"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.jump-popup button[data-delta="30"]')).toBeFocused();
});

test('ArrowUp in jump popup moves focus one row', async ({ page }) => {
  await goToVideoScreen(page);
  await openJumpPopup(page);
  await expect(page.locator('.jump-popup button[data-delta="10"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.jump-popup button[data-delta="-10"]')).toBeFocused();
});

test('Enter in jump popup selects focused option and closes', async ({ page }) => {
  await goToVideoScreen(page);
  await mockVideoTime(page, 600, 3600);
  await openJumpPopup(page);
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

test('subtitle track loads from the page origin, not a hardcoded host (BUG-009)', async ({ page }) => {
  await goToVideoScreen(page);
  var origin = new URL(page.url()).origin;
  var src = await page.locator('#video track').getAttribute('src');
  // Same-origin .vtt: a cross-origin track (hardcoded localhost while the page is
  // on 0.0.0.0/LAN) is blocked by the browser and subtitles never render.
  expect(new URL(src).origin).toBe(origin);
});

test('CC button hidden for a video without subtitles', async ({ page }) => {
  await pickPerson(page, 'kids');
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
  // BUG-026 settle-signal class: return-to-origin is an async screen swap; under
  // parallel CPU load the default 5s toBeVisible can miss it. Give round-trip headroom.
  await expect(page.locator('#screen-browse')).toBeVisible({ timeout: 10000 });
});

// TASK-329: this test WAS the 2026-07-13 flake instance — `ended` was dispatched
// as soon as #screen-video went visible, which only proves onEnter ran. `ended` is
// a fire-ONCE event: dispatch it before /api/next has resolved and the handler has
// no successor to count down to, so no overlay is ever built and the toBeVisible
// just burns its (generous) timeout. The old fix reached for headroom (10s);
// headroom can't rescue an event that fired too early. goToEpisode awaits the real
// settle signal instead, so `ended` lands on a primed player every time.
test('series at 100% shows an Up next countdown', async ({ page }) => {
  await goToEpisode(page, 'bluey-s1e01', 'Up next: The Weekend');
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#upnext-overlay')).toBeVisible();
  await expect(page.locator('#upnext-text')).toContainText('The Weekend');
});

// Same `ended`-before-primed race as the countdown test above (TASK-329).
test('Up next countdown is cancellable and returns to detail', async ({ page }) => {
  await goToEpisode(page, 'bluey-s1e01', 'Up next: The Weekend');
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#upnext-overlay')).toBeVisible();
  await page.locator('#btn-upnext-cancel').click();
  await expect(page).toHaveURL(/detail\.html/);
});

test('player up-next line names the next episode (TASK-136)', async ({ page }) => {
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#video-upnext')).toHaveText('Up next: The Weekend');
});

test('player up-next reads "Start again" at the end of a series (TASK-136)', async ({ page }) => {
  await page.goto('/app/homeview/video.html?video=bluey-s1e03&series=bluey&from=detail');
  await expect(page.locator('#video-upnext')).toHaveText('Start again');
});

// Regression (iOS/Safari audio): WebKit blocks play()-with-sound without a user
// gesture in the video document, so the player fell back to muted and never
// recovered (no sound on iPad). chromium does not enforce that policy, so we
// stub play() to reject while unmuted — mimicking iOS — and assert the prompt
// shows + the first gesture unmutes. Pre-fix there was no prompt and no unmute.
test('iOS: blocked play-with-sound shows a sound prompt that a gesture clears (autoplay policy)', async ({ page }) => {
  await page.addInitScript(() => {
    window.HTMLMediaElement.prototype.play = function () {
      return this.muted ? Promise.resolve() : Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    };
  });
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  // Sound blocked -> muted fallback + visible prompt.
  await expect(page.locator('#sound-prompt')).toBeVisible();
  await expect(page.locator('#video')).toHaveJSProperty('muted', true);
  // First real gesture in this document unmutes and dismisses the prompt.
  await page.locator('#screen-video').dispatchEvent('pointerdown');
  await expect(page.locator('#video')).toHaveJSProperty('muted', false);
  await expect(page.locator('#sound-prompt')).toHaveClass(/hidden/);
});
