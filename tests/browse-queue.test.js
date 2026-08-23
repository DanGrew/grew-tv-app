const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

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

// TASK-516 — the home-movie twin of the film test above, and the gap the
// whole task exists to close: a clip's ＋ posted to the old video-playback
// queue, which the home-movie player has not read since TASK-499, so nothing
// arrived anywhere. It now appends to the same unified engine the player
// reads, and says so.
test('tapping ＋ on a home-movie tile appends the clip to the unified home-movie queue', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  let oldEngineHit = false;
  await page.route('**/api/video-playback/queue-video*', function(route) { oldEngineHit = true; return route.fulfill({ status: 204, body: '' }); });
  await page.route('**/api/queue/home-movie/queue-item**', route => route.fulfill({ status: 204, body: '' }));
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="home-movies"]').click();
  await expect(page.locator('.film-tile[data-id="beach-day"] .tile-queue')).toBeVisible();
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/home-movie/queue-item') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="beach-day"] .tile-queue').click();
  const req = await queued;
  expect(req.url()).toContain('person=kids');
  expect(JSON.parse(req.postData())).toEqual({ item_id: 'beach-day' });
  await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
  await expect(page).toHaveURL(/browse\.html/);          // did NOT open the player
  expect(oldEngineHit).toBe(false);
});

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

test('video queue button 🎬 (N) shows the count and opens the video player at the queue head', async ({ page }) => {
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('queue-video', { video_id: 'finding-nemo-main' });
  vb.seed('queue-video', { video_id: 'toy-story-main' });
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#btn-play-queue')).toHaveText('🎬 (2)');
  await page.locator('#btn-play-queue').click();
  await expect(page).toHaveURL(/video\.html\?.*playQueue=1/);
});

// TASK-259: the MUSIC twin beside the video button — shown only when the music
// override ("Play Next") queue is non-empty (count from GET /api/playback via
// playNextCount), tapping opens the TV audio page at the queue head
// (audio.html?playQueue). Stub GET /api/playback after installApi so it wins.
async function routeMusicQueue(page, playNext) {
  await page.route(/\/api\/playback\?/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ person_id: 'kids', play_next: playNext }) }));
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
  await routeMusicQueue(page, [{ track_id: 'a' }, { track_id: 'b' }]);
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await expect(page.locator('#btn-play-queue-music')).toHaveText('🎵 (2)');
  await page.locator('#btn-play-queue-music').click();
  await expect(page).toHaveURL(/audio\.html\?.*playQueue=1/);
});

test('the two queue buttons show independently — video queued, music empty', async ({ page }) => {
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('queue-video', { video_id: 'finding-nemo-main' });
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

// TASK-516 — the drill-down badge is the fifth ＋Queue affordance a clip has,
// and it reaches the same engine as the other four.
test('rail-grid home-movie tiles also carry the ＋ badge and queue to the unified engine', async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.route('**/api/queue/home-movie/queue-item**', route => route.fulfill({ status: 204, body: '' }));
  await page.goto('/app/homeview/rail-grid.html?section=home-movies&rail=person:millie&profile=kids&person=kids');
  await expect(page.locator('.film-tile[data-id="beach-day"] .tile-queue')).toBeVisible();
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/home-movie/queue-item') && req.method() === 'POST');
  await page.locator('.film-tile[data-id="beach-day"] .tile-queue').click();
  expect(JSON.parse((await queued).postData())).toEqual({ item_id: 'beach-day' });
  await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
});

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
