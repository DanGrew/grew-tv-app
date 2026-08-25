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

test('video queue button is hidden when the video queue is empty', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeVisible();   // settled
  await expect(page.locator('#btn-play-queue')).toBeHidden();
});

// TASK-517 — the count comes off the FILM queue on the unified engine now: the
// same queue the ＋ badges above fill. It read the old video engine's until
// now, which nothing has added to since TASK-503, so the pill stayed hidden
// however many films you queued.
test('video queue button 🎬 (N) shows the count and opens the video player at the queue head', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('queue-item', { item_id: 'finding-nemo-main' });
  backend.seed('queue-item', { item_id: 'toy-story-main' });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#btn-play-queue')).toHaveText('🎬 (2)');
  await page.locator('#btn-play-queue').click();
  await expect(page).toHaveURL(/video\.html\?.*playQueue=1/);
});

// TASK-517 — and it climbs as you queue, without a reload: the ＋ press and
// the pill finally read the same queue.
test('queueing a film from browse makes the 🎬 pill appear straight away', async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'film');
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeVisible();   // settled
  await expect(page.locator('#btn-play-queue')).toBeHidden();
  await openFilms(page);
  await page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue').click();
  await expect(page.locator('#btn-play-queue')).toHaveText('🎬 (1)');
});

// TASK-259: the MUSIC twin beside the video button — shown only when the music
// Queue is non-empty, tapping opens the TV audio page at the queue head
// (audio.html?playQueue). TASK-504: the count comes from the unified engine's
// own GET /api/queue/music (queueCount), the same snapshot the film pill reads
// for its own media type. Stub it after installApi so it wins.
async function routeMusicQueue(page, queued) {
  await page.route(/\/api\/queue\/music\?/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ person_id: 'kids', media_type: 'music', queue: queued, next: [], coming_up: [] }) }));
}

test('music queue button is hidden when the music queue is empty', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeMusicQueue(page, []);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('.sidebar-tab[data-tab="films"]')).toBeVisible();   // settled
  await expect(page.locator('#btn-play-queue-music')).toBeHidden();
});

test('music queue button 🎵 (N) shows the count and opens the audio player at the queue head', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await routeMusicQueue(page, [{ entry_id: 'e1', item_id: 'a' }, { entry_id: 'e2', item_id: 'b' }]);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#btn-play-queue-music')).toHaveText('🎵 (2)');
  await page.locator('#btn-play-queue-music').click();
  await expect(page).toHaveURL(/audio\.html\?.*playQueue=1/);
});

test('the two queue buttons show independently — video queued, music empty', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('queue-item', { item_id: 'finding-nemo-main' });
  await routeMusicQueue(page, []);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#btn-play-queue')).toHaveText('🎬 (1)');
  await expect(page.locator('#btn-play-queue-music')).toBeHidden();
});

// TASK-421: a music video gets its own ＋ Queue badge, wired to the SEPARATE
// music-video engine (FEAT-418) — never the film queue this same badge posts
// to for a plain video tile (story 3: the two engines stay apart).
test('a music-video tile carries a ＋ Queue badge that POSTs to its own engine', async ({ page }) => {
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
  await page.route('**/api/music-video-playback/queue-video*', function(route) { return route.fulfill({ status: 204, body: '' }); });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="music-videos"]').click();
  await expect(page.locator('.film-tile[data-id="mv-01"]')).toBeVisible();
  await expect(page.locator('.film-tile[data-id="mv-01"] .tile-queue')).toHaveText('＋');
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/queue-video') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="mv-01"] .tile-queue').click();
  const req = await queued;
  expect(req.url()).toContain('person=kids');
  expect(JSON.parse(req.postData())).toEqual({ video_id: 'mv-01' });
  await expect(page.locator('#queue-status')).toHaveText('Queued to Play Next');
  expect(filmQueued).toBe(false);
});

// TASK-445 — the Play All control: hidden on a tab with no whole-catalog
// source, shown on Music Videos, navigates to the mvAll entry.
test('Play All is hidden on Films, shown on Music Videos, and navigates to the whole-catalog entry', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  await openFilms(page);
  await expect(page.locator('#btn-play-all')).toBeHidden();
  await page.locator('.sidebar-tab[data-tab="music-videos"]').click();
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
  await openFilms(page);
  await expect(page.locator('#btn-play-all')).toBeHidden();
  await page.locator('.sidebar-tab[data-tab="home-movies"]').click();
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
// carries the same ＋ badge, POSTing to the SEPARATE music-video engine
// (FEAT-418), never the film queue (story 3).
test('rail-grid music-video tiles carry the ＋ badge and queue to their OWN engine', async ({ page }) => {
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
  await page.route('**/api/music-video-playback/queue-video*', function(route) { return route.fulfill({ status: 204, body: '' }); });
  await page.goto('/app/homeview/rail-grid.html?section=music-videos&rail=mv-artist:QOTSA&profile=kids&person=kids');
  await expect(page.locator('.film-tile[data-id="mv-01"] .tile-queue')).toBeVisible();
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/queue-video') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="mv-01"] .tile-queue').click();
  expect(JSON.parse((await queued).postData())).toEqual({ video_id: 'mv-01' });
  await expect(page.locator('#queue-status')).toHaveText('Queued to Play Next');
  expect(filmQueued).toBe(false);
});
