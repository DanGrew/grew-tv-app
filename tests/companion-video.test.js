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
