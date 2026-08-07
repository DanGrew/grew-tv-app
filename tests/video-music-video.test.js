const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');
const { enterBrowse } = require('./fixtures/nav.js');

// TASK-374 — a music video plays through its OWN client-owned playthrough
// (core/music-video-playthrough.js), never the server-authoritative video
// engine (video-playback.test.js) or the music queue engine. No
// installVideoPlaybackBackend here — deliberately: there is no engine session
// for a music video to ride, and these tests assert that stays true.

function engineCalls(page) {
  var calls = [];
  page.on('request', function(req) {
    var url = req.url();
    if (url.indexOf('/api/video-playback/') > -1 || url.indexOf('/api/progress/') > -1) calls.push(url);
  });
  return calls;
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
});

test('Story 1 — a single music video pick plays in the video player, full picture and sound', async ({ page }) => {
  const calls = engineCalls(page);
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  // The light seq descriptor for a lone pick carries no title (only the id) —
  // the breadcrumb leaf must come from the fetched record, not stay blank.
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Head Like a Haunted House');
  expect(calls).toEqual([]); // never touches the video-playback engine or watch_progress
});

test('Story 2 — a music-video playlist plays through in the playlist\'s order, each starting as the one before ends', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect(page.locator('#video-upnext')).toHaveText('Up next: No One Knows');
  // Direct cut on end — like a song (screen-audio-page), no "Up next" countdown overlay.
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#upnext-overlay')).toBeHidden();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
});

test('Story 3 — an artist\'s music videos play through in order the same way', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  // A-Z by title: "Head Like a Haunted House" before "No One Knows"; Muse's
  // "Starlight" (a different artist) is excluded from the sequence entirely.
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/); // no third item — no-op
});

test('Story 4 — the last video in a playthrough ends, playback stops cleanly back to browse', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page).toHaveURL(/browse\.html/);
});

test('Story 5 — stopped part-way and picked again starts from the beginning, no resume offered', async ({ page }) => {
  const calls = engineCalls(page);
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  expect(await page.evaluate(() => document.getElementById('video').currentTime)).toBe(0);
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  expect(await page.evaluate(() => document.getElementById('video').currentTime)).toBe(0);
  expect(calls.some(function(u) { return u.indexOf('/api/progress/') > -1; })).toBe(false);
});

test('Story 6 — pause, resume, next and previous work as they do for a song', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#btn-play-pause')).toBeVisible();
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.locator('#btn-prev').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-prev').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/); // already first — no-op, no wrap
});

test('Story 8 — nothing offers to queue a music video: the Video Queue button is hidden', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-queue')).toBeHidden();
});

test('a lone music video pick shows no ⏮/⏭ transport (single-item playthrough)', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-prev')).toBeHidden();
  await expect(page.locator('#btn-next')).toBeHidden();
});

test('Story 9 (routing) — a music-video card selects the "music-video" route, not the plain video engine route', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  var appWs = null;
  // BUG-055 pattern (homeview.test.js): every screen boots connectApp, so a
  // captured socket can still be the profile picker's pre-nav one — reset on
  // `framenavigated` (fires at document commit, strictly before browse's own
  // script runs) so the next capture is browse's OWN socket.
  page.on('framenavigated', function(frame) { if (frame === page.mainFrame()) appWs = null; });
  await page.routeWebSocket(/:8766/, function(ws) { appWs = ws; });
  await page.goto('/app/homeview/profile.html');
  await enterBrowse(page, 'kids');
  await expect(page.locator('.rail-row .film-tile').first()).toBeVisible();
  await expect.poll(function() { return appWs !== null; }).toBe(true);
  // Reach the music-video card via the companion `select` intent (id-based,
  // resolved against the full catalog — the same path a browse tile tap takes,
  // and how a companion search hit already reaches an off-tab card, BUG-008).
  await appWs.send(JSON.stringify({ type: 'intent', payload: { intent: 'select', params: { id: 'mv-01' } } }));
  await expect(page).toHaveURL(/video\.html\?.*musicVideo=mv-01/);
});
