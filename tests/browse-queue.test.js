const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend, installQueuePlaybackBackend, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

// FEAT-040 (TV browse queue affordances): film tiles carry a ＋ badge (queue the
// film to Play Next). TASK-259 replaced the single "▶ Play Queue (N)" pill with TWO
// adjacent icon+count buttons bottom-right — 🎬 video → video.html?playQueue and
// 🎵 music → audio.html?playQueue — each shown only when ITS OWN override queue is
// non-empty (icon+`(N)` style matching the companion, TASK-258). Backend (queue-video
// / GET snapshots / play-queue) already merged. The companion mirror shipped in #163/#164.

// The active person is the device's picked person (localStorage), not a URL param.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grew-tv-person', 'kids'));
});

async function openFilms(page) {
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await expect(page.locator('.film-tile[data-id="finding-nemo-main"]')).toBeVisible();
}

test('film tiles carry a ＋ Queue badge; series tiles do not', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await openFilms(page);
  await expect(page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue')).toHaveText('＋');
  await page.locator('.sidebar-tab[data-tab="series"]').click();
  await expect(page.locator('.film-tile[data-id="bluey"]')).toBeVisible();
  await expect(page.locator('.film-tile[data-id="bluey"] .tile-queue')).toHaveCount(0);
});

// TASK-503: a film ＋Queue POSTs to the TASK-498 unified queue engine
// (/api/queue/film/queue-item), not the old video-playback engine — a film
// player never reads that old engine's queue once cut over, so queueing there
// silently queued to nothing. TASK-516 — the confirmation is the media type's
// own wording from core/queue-shell-config.js: a film is APPENDED to the
// unified queue, so "Added to Queue"; a music video still means play-next on
// its own engine, and still says so.
test('tapping ＋ queues the film (POST /api/queue/film/queue-item) without opening the player', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.route('**/api/queue/film/queue-item**', route => route.fulfill({ status: 204, body: '' }));
  await openFilms(page);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/queue-item') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue').click();
  const req = await queued;
  expect(req.url()).toContain('person=kids');
  expect(JSON.parse(req.postData())).toEqual({ item_id: 'finding-nemo-main' });
  await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
  await expect(page).toHaveURL(/browse\.html/);          // did NOT open the player
});

// TASK-516's home-movie twin of the film test above used to live here, tapping
// ＋ on a clip tile in the Home Movies browse rails. TASK-502 removed those
// rails, so Home Movies browse holds only Play All / Play All by month action
// tiles and there is no clip tile to tap. The same ＋, on the same unified
// engine, is covered where a clip tile now lives: the Play All clip list
// (`home-movies-list.test.js`, "＋ Queue appends the clip to the unified
// home-movie queue"), which also holds the old-engine-untouched assertion.

test('tapping the film tile body (not the ＋) opens the player', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await openFilms(page);
  await page.locator('.film-tile[data-id="finding-nemo-main"]').click();
  await expect(page).toHaveURL(/video\.html/);
});

// ── TASK-501: Continue, one button per media type ───────────────────────────
// The two 🎬/🎵 play-the-queue pills are gone. Browse's bottom-right is now
// Search + a ▶ icon opening a play menu (the shape the companion has had since
// TASK-445), holding Play All and four Continue buttons — films, music, home
// movies, music videos. A press carries on with that type via the engine's own
// advance (`next`): the queue front, else the next item of the source it was
// last playing.

// Every type reads its own snapshot to decide whether its button is live, so a
// test seeding one type must answer for the other three too.
async function routeEmptyQueue(page, mediaType) {
  await page.route(new RegExp('/api/queue/' + mediaType + '\\?'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ person_id: 'kids', media_type: mediaType, queue: [], next: [], coming_up: [] }) }));
}
async function routeQueued(page, mediaType, queued) {
  await page.route(new RegExp('/api/queue/' + mediaType + '\\?'), (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ person_id: 'kids', media_type: mediaType, queue: queued, next: [], coming_up: [] }) }));
}
async function routeAllEmpty(page) {
  await routeEmptyQueue(page, 'series');
  await routeEmptyQueue(page, 'film');
  await routeEmptyQueue(page, 'home-movie');
  await routeEmptyQueue(page, 'music');
  await routeEmptyQueue(page, 'music-video');
}
async function openPlayMenu(page) {
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeVisible();   // settled
  await page.locator('#btn-queue-menu').click();
}

// Story 3 — the cluster does not shift. Nothing queued and no source anywhere
// still shows every button, disabled-but-visible (the FEAT-497 transport rule),
// where the old pills vanished entirely. TASK-542 made it five.
test('all five Continue buttons are visible with nothing to continue, and do nothing', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await openPlayMenu(page);
  await expect(page.locator('#queue-menu .continue-btn')).toHaveCount(5);
  for (const id of ['btn-continue-series', 'btn-continue-film', 'btn-continue-home-movie', 'btn-continue-music', 'btn-continue-music-video']) {
    await expect(page.locator('#' + id)).toBeVisible();
    await expect(page.locator('#' + id)).toBeDisabled();
    await expect(page.locator('#' + id)).toHaveClass(/is-disabled/);
  }
  await expect(page.locator('#btn-continue-film')).toHaveText('▶ Continue Films');
});

// Story 1 — a type with things queued: its button wakes, and pressing it opens
// that type's player on the continue entry.
test('Continue Films is live with a film queued, and opens the video player on the film continue entry', async ({ page }) => {
  await installApi(page);
  await routeAllEmpty(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('queue-item', { item_id: 'finding-nemo-main' });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await openPlayMenu(page);
  await expect(page.locator('#btn-continue-film')).toBeEnabled();
  await page.locator('#btn-continue-film').click();
  await expect(page).toHaveURL(/video\.html\?.*continueType=film/);
});

test('Continue Music is live with a track queued, and opens the audio player on its continue entry', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await routeQueued(page, 'music', [{ entry_id: 'e1', item_id: 'a' }, { entry_id: 'e2', item_id: 'b' }]);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await openPlayMenu(page);
  await expect(page.locator('#btn-continue-music')).toBeEnabled();
  await page.locator('#btn-continue-music').click();
  await expect(page).toHaveURL(/audio\.html\?.*continueType=music/);
});

// Story 2 — nothing queued, but a source mid-play: Continue still carries on,
// which is what the old pills could not do (they counted the queue alone).
test('Continue is live on an empty queue when the source has more ahead', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await routeQueued(page, 'home-movie', []);
  await page.route(/\/api\/queue\/home-movie\?/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ person_id: 'kids', media_type: 'home-movie', queue: [], next: [{ entry_id: 'e9', item_id: 'hm-02' }], coming_up: [], source_type: 'home-movies-all' }) }));
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await openPlayMenu(page);
  await expect(page.locator('#btn-continue-home-movie')).toBeEnabled();
  await page.locator('#btn-continue-home-movie').click();
  await expect(page).toHaveURL(/video\.html\?.*continueType=home-movie/);
});

// TASK-542 — the button the media-type split had to add. An episode used to be
// a film-engine item, so Continue Films carried on with a part-watched series;
// once an episode advances on its own engine, Films cannot reach one, and this
// is the only way back into a series from browse.
test('Continue TV Series is live with an episode queued, and opens the video player on the series continue entry', async ({ page }) => {
  await installApi(page);
  await routeAllEmpty(page);
  const backend = await installQueuePlaybackBackend(page, 'series');
  backend.seed('queue-item', { item_id: 'bluey-s1e02' });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await openPlayMenu(page);
  await expect(page.locator('#btn-continue-series')).toBeEnabled();
  await page.locator('#btn-continue-series').click();
  await expect(page).toHaveURL(/video\.html\?.*continueType=series/);
});

// The buttons are independent — one type's queue never wakes another's. A
// queued FILM leaving Continue TV Series dark is the split itself, read off
// browse: before TASK-542 the two shared one engine and woke together.
test('a queued film wakes only Continue Films', async ({ page }) => {
  await installApi(page);
  await routeAllEmpty(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('queue-item', { item_id: 'finding-nemo-main' });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await openPlayMenu(page);
  await expect(page.locator('#btn-continue-film')).toBeEnabled();
  await expect(page.locator('#btn-continue-series')).toBeDisabled();
  await expect(page.locator('#btn-continue-music')).toBeDisabled();
  await expect(page.locator('#btn-continue-home-movie')).toBeDisabled();
  await expect(page.locator('#btn-continue-music-video')).toBeDisabled();
});

// TASK-517's live-refresh behaviour, now across all four: queueing the first
// thing of a type wakes its button without a reload.
test('queueing a film from browse wakes Continue Films straight away', async ({ page }) => {
  await installApi(page);
  await routeAllEmpty(page);
  await installQueuePlaybackBackend(page, 'film');
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await openPlayMenu(page);
  await expect(page.locator('#btn-continue-film')).toBeDisabled();
  await page.locator('#btn-queue-menu').click();                                 // close, so tiles are reachable
  await openFilms(page);
  await page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue').click();
  await expect(page.locator('#btn-continue-film')).toBeEnabled();
});

// The play menu is a popout off its own icon, like the companion's: closed
// until pressed, and closing again on a second press.
test('the play menu opens and closes on its own ▶ icon', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeVisible();   // settled
  await expect(page.locator('#btn-continue-film')).toBeHidden();
  await page.locator('#btn-queue-menu').click();
  await expect(page.locator('#btn-continue-film')).toBeVisible();
  await page.locator('#btn-queue-menu').click();
  await expect(page.locator('#btn-continue-film')).toBeHidden();
});

// TASK-421: a music video gets its own ＋ Queue badge, wired to the SEPARATE
// music-video engine (FEAT-418) — never the film queue this same badge posts
// to for a plain video tile (story 3: the two engines stay apart).
// TASK-505 story 3 — the ＋ press keeps the music-video queue apart from the
// film one (its own media_type), but it now APPENDS to the end and says so,
// where it used to jump the line and say "Queued to Play Next".
test('a music-video tile carries a ＋ Queue badge that appends to the music-video queue', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  var filmQueued = false;
  await page.route('**/api/queue/film/queue-item*', function(route) { filmQueued = true; return route.fulfill({ status: 204, body: '' }); });
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  await page.route('**/api/queue/music-video/queue-item*', function(route) { return route.fulfill({ status: 204, body: '' }); });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="music-videos"]').click();
  await expect(page.locator('.film-tile[data-id="mv-01"]')).toBeVisible();
  await expect(page.locator('.film-tile[data-id="mv-01"] .tile-queue')).toHaveText('＋');
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/queue-item') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="mv-01"] .tile-queue').click();
  const req = await queued;
  expect(req.url()).toContain('person=kids');
  expect(JSON.parse(req.postData())).toEqual({ item_id: 'mv-01' });
  await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
  expect(filmQueued).toBe(false);
});

// BUG-531 — the ITEM decides which Queue a ＋ press fills, never the screen it
// was pressed on. This card is a music video shelved on the Films rail: the
// press must reach the music-video Queue and leave the film one alone. The old
// producer read the card's browse SECTION (and fell back to 'films' for a card
// with none at all), so it filed this under Films.
test('a ＋ press goes by the item\'s own type, not the rail it is sitting on', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  var filmQueued = false;
  await page.route('**/api/queue/film/queue-item*', function(route) { filmQueued = true; return route.fulfill({ status: 204, body: '' }); });
  await page.route('**/api/queue/music-video/queue-item*', function(route) { return route.fulfill({ status: 204, body: '' }); });
  await page.route('**/api/browse**', function(route) {
    var stray = { kind: 'video', id: 'mv-99', title: 'Stray Video', poster: 'mv-01.jpg', duration: 200, section: 'films', itemType: 'music-video', artist: 'QOTSA' };
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat([stray]) })
    });
  });
  await openFilms(page);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/queue-item') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="mv-99"] .tile-queue').click();
  const req = await queued;
  expect(JSON.parse(req.postData())).toEqual({ item_id: 'mv-99' });
  await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
  expect(filmQueued).toBe(false);
});

// BUG-531 story 3 — a press the server refuses says so. It used to swallow the
// failure, so a refused press looked exactly like one that worked.
test('a refused ＋ press tells you it failed instead of looking queued', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.route('**/api/queue/film/queue-item**', route => route.fulfill({
    status: 400, contentType: 'application/json',
    body: JSON.stringify({ error: 'item finding-nemo-main is a film (media_type film), not valid for media_type music-video' })
  }));
  await openFilms(page);
  await page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue').click();
  await expect(page.locator('#queue-status')).toHaveText('Could not queue.');
});

// TASK-445 — the Play All control: hidden on a tab with no whole-catalog
// source, shown on Music Videos, navigates to the mvAll entry. TASK-501 — it
// now sits inside the TV's own play menu, so the menu opens first (the
// companion's Play All has always lived in one).
test('Play All is hidden on Films, shown on Music Videos, and navigates to the whole-catalog entry', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  await openFilms(page);
  await page.locator('#btn-queue-menu').click();
  await expect(page.locator('#btn-play-all')).toBeHidden();
  await page.locator('#btn-queue-menu').click();
  await page.locator('.sidebar-tab[data-tab="music-videos"]').click();
  await page.locator('#btn-queue-menu').click();
  await expect(page.locator('#btn-play-all')).toBeVisible();
  await page.locator('#btn-play-all').click();
  await expect(page).toHaveURL(/video\.html\?.*musicVideoAll=1/);
});

// TASK-486 — Home Movies no longer gets the header Play All button (TASK-446):
// its whole-catalog entry point is now the Play All rail's own "All" tile,
// always unshuffled; shuffle is a live toggle inside the player's Queue View
// (tests/video-home-movies.test.js). Home Movies is in the default BROWSE
// fixture (unlike Music Videos above), so no route override is needed.
test('Play All header button stays hidden on Home Movies (TASK-486 replaces it with the rail)', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeAllEmpty(page);
  await openFilms(page);
  await page.locator('#btn-queue-menu').click();
  await expect(page.locator('#btn-play-all')).toBeHidden();
  await page.locator('#btn-queue-menu').click();
  await page.locator('.sidebar-tab[data-tab="home-movies"]').click();
  await page.locator('#btn-queue-menu').click();
  await expect(page.locator('#btn-play-all')).toBeHidden();
});

// TASK-486 (revision) — a Play All rail tile now opens the scoped clip list
// FIRST (like a boxset/series), not playback directly: All tile -> the
// list's own homeMoviesAll scope, a kid tile -> its own homeMoviesPerson
// scope. The list's own header Play All button/row taps are what actually
// fire play-source (tests/homeview.test.js, tests/video-home-movies.test.js).
test('Play All rail All tile opens the whole-catalog list', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="home-movies"]').click();
  await page.locator('.film-tile[data-id="play-all:All"]').click();
  await expect(page).toHaveURL(/home-movies-list\.html\?.*homeMoviesAll=1/);
});

test('Play All rail kid tile opens that kid\'s scoped clip list', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="home-movies"]').click();
  await page.locator('.film-tile[data-id="play-all:Millie"]').click();
  await expect(page).toHaveURL(/home-movies-list\.html\?.*homeMoviesPerson=millie/);
});

test('rail-grid film tiles also carry the ＋ badge and queue to the film engine', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.route('**/api/queue/film/queue-item**', route => route.fulfill({ status: 204, body: '' }));
  await page.goto('/app/homeview/rail-grid.html?section=films&rail=genre:animation&profile=kids&person=kids');
  await expect(page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue')).toBeVisible();
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/queue-item') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue').click();
  expect(JSON.parse((await queued).postData())).toEqual({ item_id: 'finding-nemo-main' });
  await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
});

// TASK-516's home-movie rail-grid ＋ badge was asserted here, drilling into a
// person rail. TASK-502 removed those rails, and Home Movies has no other
// rail-grid holding a clip tile: Play All / Play All by month hold action
// tiles, and Continue Watching's tiles are CW rows carrying no `section`, so
// the drill-down ＋ has no home-movie route left to assert. The film and
// music-video rail-grid ＋ tests above and below still cover the badge itself,
// and the home-movie engine is covered from the clip list.
// TASK-421 — an artist's music-video rail-grid ("See all" on the QOTSA rail)
// carries the same ＋ badge, POSTing under its OWN media type, never the film
// queue (story 3).
test('rail-grid music-video tiles carry the ＋ badge and queue to their OWN media type', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  let filmQueued = false;
  await page.route('**/api/queue/film/queue-item*', function(route) { filmQueued = true; return route.fulfill({ status: 204, body: '' }); });
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  await page.route('**/api/queue/music-video/queue-item*', function(route) { return route.fulfill({ status: 204, body: '' }); });
  await page.goto('/app/homeview/rail-grid.html?section=music-videos&rail=mv-artist:QOTSA&profile=kids&person=kids');
  await expect(page.locator('.film-tile[data-id="mv-01"] .tile-queue')).toBeVisible();
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/queue-item') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="mv-01"] .tile-queue').click();
  expect(JSON.parse((await queued).postData())).toEqual({ item_id: 'mv-01' });
  await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
  expect(filmQueued).toBe(false);
});
