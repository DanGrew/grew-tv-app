const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');

// FEAT-037 (TASK-223) — companion VIDEO parity. The companion video player is the
// mirror of the persistent TV player (TASK-222): it drives prev / next / repeat over
// the per-person /api/video-playback engine (PLANE B) and repaints now-playing,
// up-next and the repeat pill from the `video_playback` snapshot the server pushes —
// the SAME snapshot the TV renders, so a media change the companion drives swaps the
// TV in place with no reload. play/pause / skip / volume / captions / reset stay on
// the legacy WS intent rail (PLANE A) — the <video>'s own transport has no server
// action, and the shared rail can't retire until the music companion migrates too.
//
// The backend is the installVideoPlaybackBackend fixture (the HTTP-action -> WS-
// snapshot loop the real server runs); the companion handshake (list/register/
// snapshot_request) is answered there. A bluey series is seeded so the first snapshot
// has content (a standalone film has no engine source, so no snapshot — that path is
// covered by the Plane-A breadcrumb tests).

function spyVideoActions(page) {
  const posts = [];
  page.route('**/api/video-playback/*', function(route) {
    posts.push({ action: route.request().url().split('/api/video-playback/')[1].split('?')[0], url: route.request().url() });
    route.fallback();
  });
  return posts;
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  const backend = await installVideoPlaybackBackend(page);
  // Series source, repeat ON by default (the 'start again' loop) — the same entry
  // the TV player's play-source produces.
  backend.seed('play-source', { source_type: 'series', source_id: 'bluey', item_id: 'bluey-s1e01' });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
});

test('renders now-playing, up-next and the repeat pill from the video_playback snapshot', async ({ page }) => {
  await expect(page.locator('#ctx-label')).toHaveText('Now playing');
  await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
  await expect(page.locator('#upnext')).toHaveText('Up next: The Weekend');
  // repeat defaults ON for a series — the pill reflects it.
  await expect(page.locator('#c-repeat')).toHaveClass(/on/);
  // a multi-item source keeps the series transport live (not greyed).
  await expect(page.locator('#c-prev')).not.toHaveClass(/single/);
  await expect(page.locator('#c-next')).not.toHaveClass(/single/);
});

test('Next drives the per-person engine (Plane B) and the now-playing repaints from the snapshot', async ({ page }) => {
  const posts = spyVideoActions(page);
  await page.locator('#c-next').click();
  await expect(page.locator('#now-title')).toHaveText('The Weekend');
  await expect(page.locator('#upnext')).toHaveText('Up next: Hammerbarn');
  expect(posts.map((p) => p.action)).toContain('next');
  expect(posts[0].url).toContain('person=kids');
});

test('Previous wraps to the last item under default repeat', async ({ page }) => {
  const posts = spyVideoActions(page);
  await page.locator('#c-prev').click();
  await expect(page.locator('#now-title')).toHaveText('Hammerbarn');
  expect(posts.map((p) => p.action)).toContain('previous');
});

test('the repeat pill toggles via toggle-repeat and reflects the snapshot', async ({ page }) => {
  const posts = spyVideoActions(page);
  await expect(page.locator('#c-repeat')).toHaveClass(/on/);
  await page.locator('#c-repeat').click();
  await expect(page.locator('#c-repeat')).not.toHaveClass(/on/);
  expect(posts.map((p) => p.action)).toContain('toggle-repeat');
});

test('play/pause stays on the legacy intent rail — it is NOT a video-playback action', async ({ page }) => {
  const posts = spyVideoActions(page);
  await page.locator('#c-toggle').click();
  await page.locator('#c-cc').click();
  await page.locator('#c-vol-up').click();
  // none of the Plane-A controls touch the per-person video engine.
  expect(posts).toHaveLength(0);
});

// BUG-037 — the Plane-A breadcrumb (a standalone film has no video_playback engine
// source, so its title + context arrive over the legacy WS intent rail, not a
// snapshot). Before the fix the film player collapsed to `Home › Title` (the only
// way back was Home), losing the genre grid the film was reached through. It now
// mirrors companion-artist's FEAT-032 nav-trail retrace: a film reached via a genre
// grid reads `Home › <grid> › Title` and steps back to that grid. A series episode
// (has a seriesId) is untouched — it keeps `Home › Series › Episode`.
test.describe('BUG-037: film player breadcrumb retraces to the genre grid', () => {
  function msg(type, payload) { return JSON.stringify({ type, payload }); }

  // Drive the player over the WS the way the app does for a standalone film: push a
  // `video` context carrying the display title, plus an app_state whose itemId ===
  // episodeId (seriesIdFromSnap -> undefined -> film) or itemId !== episodeId (a
  // series episode). Registered AFTER the fixture routes so it wins (most-recent).
  function mockPlayer(page, appState, title) {
    return page.routeWebSocket(/:8766/, (ws) => {
      function push() {
        ws.send(msg('context', { version: 2, context_id: 'video', display: { title } }));
        ws.send(msg('app_state', appState));
      }
      ws.onMessage((raw) => {
        const m = JSON.parse(raw);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') push();
        // A crumb tap sends `navigate`; the TV teleports and echoes the new context,
        // which the companion follows to that page.
        if (m.type === 'intent' && m.payload.intent === 'navigate') {
          ws.send(msg('context', { version: 3, context_id: m.payload.params.page.replace('.html', '') }));
        }
      });
    });
  }

  const FILM_STATE = { person: 'kids', profile: 'kids', screen: 'player', itemId: 'toy-story-main', episodeId: 'toy-story-main' };
  const SERIES_STATE = { person: 'kids', profile: 'kids', screen: 'player', itemId: 'bluey', episodeId: 'bluey-s1e01' };

  function seedGridTrail(page) {
    return page.addInitScript(() => {
      sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([
        { page: 'browse.html', params: { tab: 'films', rail: 'animation' }, label: 'Animation' }
      ]));
    });
  }

  test('a film reached via a genre grid shows Home › Grid › Title (3 crumbs) that retrace to the grid', async ({ page }) => {
    await seedGridTrail(page);
    await mockPlayer(page, FILM_STATE, 'Toy Story');
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('Toy Story');
    // 3 crumbs: Home, the genre grid, the (inert) film title.
    await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'Animation', 'Toy Story']);
    await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Animation']);
    const grid = page.locator('#breadcrumb .crumb-link', { hasText: 'Animation' });
    await expect(grid).toHaveAttribute('data-page', 'browse.html');
    await expect(grid).toHaveAttribute('data-params', /"rail":"animation"/);
    // tapping the grid crumb teleports the TV back to the grid; the companion follows.
    await grid.click();
    await expect(page).toHaveURL(/companion\/browse\.html$/);
  });

  test('a deep-linked film (no browse trail) falls back to Home › Title', async ({ page }) => {
    await mockPlayer(page, FILM_STATE, 'Toy Story');
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('Toy Story');
    await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'Toy Story']);
    await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home']);
  });

  test('a series episode is unchanged — Home › Series › Episode (guards no regression)', async ({ page }) => {
    await seedGridTrail(page);
    await mockPlayer(page, SERIES_STATE, 'Daddy Putdown');
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
    await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'Bluey', 'Daddy Putdown']);
    const series = page.locator('#breadcrumb .crumb-link', { hasText: 'Bluey' });
    await expect(series).toHaveAttribute('data-page', 'detail.html');
    await expect(series).toHaveAttribute('data-params', /"series":"bluey"/);
  });
});
