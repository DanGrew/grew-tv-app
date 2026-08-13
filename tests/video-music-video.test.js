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

test('a single music video pick plays in the video player, full picture and sound', async ({ page }) => {
  const calls = engineCalls(page);
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  // Built from the record's OWN ext (m4v, TASK-377 never re-encodes), not a
  // hardcoded .mp4 — that mismatch 404'd real playback.
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01\.m4v$/);
  // The light seq descriptor for a lone pick carries no title (only the id) —
  // the breadcrumb leaf must come from the fetched record, not stay blank.
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Head Like a Haunted House');
  expect(calls).toEqual([]); // never touches the video-playback engine or watch_progress
});

test('a music-video playlist plays through in the playlist\'s order, each starting as the one before ends', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect(page.locator('#video-upnext')).toHaveText('Up next: No One Knows');
  // Direct cut on end — like a song (screen-audio-page), no "Up next" countdown overlay.
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#upnext-overlay')).toBeHidden();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
});

test('an artist\'s music videos play through in order the same way', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  // A-Z by title: "Head Like a Haunted House" before "No One Knows"; Muse's
  // "Starlight" (a different artist) is excluded from the sequence entirely.
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/); // no third item — no-op
});

test('the last video in a playthrough ends, playback stops cleanly back to browse', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page).toHaveURL(/browse\.html/);
});

test('stopped part-way and picked again starts from the beginning, no resume offered', async ({ page }) => {
  const calls = engineCalls(page);
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  expect(await page.evaluate(() => document.getElementById('video').currentTime)).toBe(0);
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  expect(await page.evaluate(() => document.getElementById('video').currentTime)).toBe(0);
  expect(calls.some(function(u) { return u.indexOf('/api/progress/') > -1; })).toBe(false);
});

test('pause, resume, next and previous work as they do for a song', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#btn-play-pause')).toBeVisible();
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.locator('#btn-prev').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-prev').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/); // already first — no-op, no wrap
});

test('nothing offers to queue a music video: the Video Queue button is hidden', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-queue')).toBeHidden();
});

test('a lone music video pick shows no ⏮/⏭ transport (single-item playthrough)', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-prev')).toBeHidden();
  await expect(page.locator('#btn-next')).toBeHidden();
});

// TASK-407 — Shuffle + Repeat, TV side.
test('a lone music video pick shows no Shuffle/Repeat controls either — nothing to shuffle or repeat', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-mv-shuffle')).toBeHidden();
  await expect(page.locator('#btn-mv-repeat')).toBeHidden();
});

test('a multi-item music-video playthrough shows Shuffle + Repeat, both starting off', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#btn-mv-shuffle')).toBeVisible();
  await expect(page.locator('#btn-mv-repeat')).toBeVisible();
  await expect(page.locator('#btn-mv-shuffle')).not.toHaveClass(/on/);
  await expect(page.locator('#btn-mv-repeat')).not.toHaveClass(/on/);
  await page.locator('#btn-mv-shuffle').click();
  await expect(page.locator('#btn-mv-shuffle')).toHaveClass(/on/);
  await page.locator('#btn-mv-repeat').click();
  await expect(page.locator('#btn-mv-repeat')).toHaveClass(/on/);
});

test('turning Repeat on (Shuffle off) loops back to the first video after the last one, instead of ending', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-mv-repeat').click();
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect(page).not.toHaveURL(/browse\.html/);
});

test('with Shuffle on, reaching the end of the playthrough starts a fresh pass instead of stopping', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await page.locator('#btn-mv-shuffle').click();
  await page.locator('#btn-mv-repeat').click();
  await page.locator('#btn-next').click(); // the last item of this 2-item pass
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page).not.toHaveURL(/browse\.html/);
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-0[12]/);
});

test('Repeat off (Shuffle off): the playthrough still ends cleanly at the last item, unaffected by TASK-407', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page).toHaveURL(/browse\.html/);
});

test('a music-video card selects the "music-video" route, not the plain video engine route', async ({ page }) => {
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

// The rail-grid page ("see all" for ONE rail) is how an artist's music videos are
// reached: the companion's selectRail opens rail-grid for an `mv-artist:` rail,
// then a pick there resolves through that page's own route table. It is a
// SEPARATE table from the browse page's, so a new cardRoute value has to be added
// to both — and an unknown route silently no-ops there rather than throwing,
// which turns a missed entry into a dead tap instead of a visible error.
test('picking a music video from the rail grid plays it, like the browse page does', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  await page.goto('/app/homeview/profile.html');
  await enterBrowse(page, 'kids');
  await page.goto('/app/homeview/rail-grid.html?section=music-videos&rail=mv-artist:QOTSA');
  await expect(page.locator('#screen-rail-grid')).toBeVisible();
  await page.locator('.film-tile[data-id="mv-01"]').click();
  await expect(page).toHaveURL(/video\.html\?.*musicVideo=mv-01/);
});

test('a music-video playlist card opens its playlist detail, same as any other playlist (TASK-376 — not a direct playthrough)', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  var appWs = null;
  page.on('framenavigated', function(frame) { if (frame === page.mainFrame()) appWs = null; });
  await page.routeWebSocket(/:8766/, function(ws) { appWs = ws; });
  await page.goto('/app/homeview/profile.html');
  await enterBrowse(page, 'kids');
  await expect(page.locator('.rail-row .film-tile').first()).toBeVisible();
  await expect.poll(function() { return appWs !== null; }).toBe(true);
  await appWs.send(JSON.stringify({ type: 'intent', payload: { intent: 'select', params: { id: 'pl-mv' } } }));
  await expect(page).toHaveURL(/playlist-detail\.html\?.*playlist=pl-mv/);
});

test('tapping a track inside a music-video playlist detail plays it through the video player, starting from that track (TASK-374/376/377)', async ({ page }) => {
  const calls = engineCalls(page);
  await installApi(page);
  await page.goto('/app/homeview/playlist-detail.html?playlist=pl-mv');
  await expect(page.locator('.detail-row[data-id="mv-02"]')).toBeVisible();
  await page.locator('.detail-row[data-id="mv-02"]').click();
  await expect(page).toHaveURL(/video\.html\?.*musicVideoPlaylist=pl-mv.*musicVideoTrack=mv-02/);
  // Starts AT the tapped track (mv-02), not the playlist's own first item.
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  expect(calls).toEqual([]); // never the audio player, never the video-playback engine
});

test('a plain audio playlist is unaffected — tapping a track still plays through the audio player', async ({ page }) => {
  await installApi(page);
  await page.goto('/app/homeview/playlist-detail.html?playlist=pl-roadtrip');
  await expect(page.locator('.detail-row').first()).toBeVisible();
  await page.locator('.detail-row').first().click();
  await expect(page).toHaveURL(/audio\.html\?.*playlist=pl-roadtrip/);
});
