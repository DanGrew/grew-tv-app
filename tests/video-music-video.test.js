const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');
const { enterBrowse } = require('./fixtures/nav.js');

// TASK-505 (FEAT-497) — a music video plays through the TASK-498 UNIFIED queue
// engine (/api/queue/music-video), the same play-source/play-item/next/
// previous/toggle-* shape films and home movies already use — never the
// film/series video-playback engine, the music engine, or the dedicated
// music-video engine FEAT-418 gave it. installQueuePlaybackBackend
// (tests/fixtures/api.js) simulates it: Play All / an artist rail / a playlist
// resolve their own ordered source, a lone pick plays as a standalone item
// with no source, and every Queue action, TV button and companion Plane-B POST
// drives the SAME snapshot that swaps the actual <video> element.

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
  await installQueuePlaybackBackend(page, 'music-video');
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
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Head Like a Haunted House');
  // TASK-422 (story 4): no playlist/artist source — Home › Title only, unchanged.
  await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'Head Like a Haunted House']);
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home']);
  expect(calls).toEqual([]); // never touches the video-playback engine or watch_progress
});

// TASK-422 — the music-video breadcrumb names its playback source (playlist or
// artist), mirroring BUG-044's audio sourceCrumb. Built once at entry
// (screen-video-page.js's startMvPlaylist/startMvArtist, before mvBegin) off the
// SAME local entry state BUG-044's own pattern reads — never the FEAT-418 queue
// engine snapshot.
test('a music video played from a playlist shows Home › [Playlist] › [Video], and the source crumb returns to that playlist', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'QOTSA Videos', 'Head Like a Haunted House']);
  const src = page.locator('#breadcrumb .crumb-link', { hasText: 'QOTSA Videos' });
  await expect(src).toHaveAttribute('data-page', 'playlist-detail.html');
  await expect(src).toHaveAttribute('data-params', JSON.stringify({ playlist: 'pl-mv' }));
  await src.click();
  await expect(page).toHaveURL(/playlist-detail\.html\?.*playlist=pl-mv/);
});

test('a music video played from an artist\'s rail shows Home › [Artist] › [Video], and the source crumb returns to that artist', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'QOTSA', 'Head Like a Haunted House']);
  const src = page.locator('#breadcrumb .crumb-link', { hasText: 'QOTSA' });
  await expect(src).toHaveAttribute('data-page', 'artist.html');
  await expect(src).toHaveAttribute('data-params', JSON.stringify({ artist: 'QOTSA' }));
  await src.click();
  await expect(page).toHaveURL(/artist\.html\?.*artist=QOTSA/);
});

test('a music-video playlist track tapped mid-playlist still names the playlist as the source, not the tapped track', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&musicVideoTrack=mv-02&from=detail-playlist');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'QOTSA Videos', 'No One Knows']);
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
  await page.locator('#btn-mv-repeat').click(); // repeat defaults on — off so the source genuinely ends here
  // TASK-505 — ⏭ DIMS at the end of an un-repeating source: with nothing
  // ahead, the shared transport rule reads it as dead rather than leaving a
  // live button that no-ops (which is what it did on the old engine).
  await expect(page.locator('#btn-next')).toBeVisible();
  await expect(page.locator('#btn-next')).toHaveClass(/is-disabled/);
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/); // still the last one
});

// TASK-445 — Play All spans every artist: the shared beforeEach's
// MUSIC_VIDEO_CARDS has mv-01/mv-02 (QOTSA) + mv-03 (Muse) — the engine's own
// mv-all source resolves artist-then-title, deterministically.
test('Play All spans every artist, artist-then-title order, and has no source page (Home > leaf)', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoAll=1&from=browse');
  // Muse < QOTSA alphabetically: Starlight plays first, spanning past QOTSA's rail.
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-03/);
  await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'Starlight']);
  await page.locator('#btn-mv-repeat').click(); // repeat defaults on — off so the boundary is a clean no-op
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
});

test('the last video in a playthrough ends, playback stops cleanly back to browse', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-mv-repeat').click(); // TASK-407: repeat defaults on — off for this baseline-ending case
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
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
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

// The Queue button opens the shared Queue shell (TASK-505,
// tests/music-video-queue.test.js).
test('the Queue button is visible for a music video and opens the Queue shell', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-queue')).toBeVisible();
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
});

// Story 4 — a lone pick used to LOSE its transport entirely (BUG-485's
// item_count gate hid ⏮/⏭ and the Shuffle/Repeat pair). On the shared shell's
// one transportState rule they stay put and dim, like a standalone film's.
test('a lone music video pick dims ⏮/⏭ rather than hiding them', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-prev')).toBeVisible();
  await expect(page.locator('#btn-prev')).toHaveClass(/is-disabled/);
  await expect(page.locator('#btn-next')).toBeVisible();
  await expect(page.locator('#btn-next')).toHaveClass(/is-disabled/);
});

test('a lone music video pick dims Shuffle/Repeat rather than hiding them', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#btn-mv-shuffle')).toBeVisible();
  await expect(page.locator('#btn-mv-shuffle')).toHaveClass(/is-disabled/);
  await expect(page.locator('#btn-mv-repeat')).toBeVisible();
  await expect(page.locator('#btn-mv-repeat')).toHaveClass(/is-disabled/);
});

// Story 5 — the retired music-video engine defaulted shuffle ON whenever the
// client omitted the flag, and the client always omitted it. The unified
// engine reads this person's remembered per-source preference instead, which
// starts off — so a playlist plays in ITS order until you say otherwise.
test('a playlist offers Shuffle + Repeat live, with Shuffle starting OFF and Repeat on', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#btn-mv-shuffle')).toBeVisible();
  await expect(page.locator('#btn-mv-repeat')).toBeVisible();
  await expect(page.locator('#btn-mv-shuffle')).not.toHaveClass(/is-disabled/);
  await expect(page.locator('#btn-mv-shuffle')).not.toHaveClass(/on/);
  await expect(page.locator('#btn-mv-repeat')).toHaveClass(/on/);
  await page.locator('#btn-mv-shuffle').click();
  await expect(page.locator('#btn-mv-shuffle')).toHaveClass(/on/);
  await page.locator('#btn-mv-repeat').click();
  await expect(page.locator('#btn-mv-repeat')).not.toHaveClass(/on/);
});

test('with Repeat on (the default), the playthrough loops back to the first video after the last one, instead of ending', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect(page).not.toHaveURL(/browse\.html/);
});

test('with Shuffle turned on and Repeat on, reaching the end of a pass starts a fresh one instead of stopping', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-mv-shuffle').click();
  await expect(page.locator('#btn-mv-shuffle')).toHaveClass(/on/);
  // A fresh shuffle anchors the playing item outside the pass, so the first
  // ⏭ re-enters it at the top — the second reaches the last item.
  await page.locator('#btn-next').click();
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page).not.toHaveURL(/browse\.html/);
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
});

test('Repeat off: the playthrough still ends cleanly at the last item', async ({ page }) => {
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await page.locator('#btn-mv-repeat').click(); // repeat defaults on — off for this baseline-ending case
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page).toHaveURL(/browse\.html/);
});

test('a music-video card selects the "music-video" route, not the plain video engine route', async ({ page }) => {
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
  await page.goto('/app/homeview/profile.html');
  await enterBrowse(page, 'kids');
  await page.goto('/app/homeview/rail-grid.html?section=music-videos&rail=mv-artist:QOTSA');
  await expect(page.locator('#screen-rail-grid')).toBeVisible();
  await page.locator('.film-tile[data-id="mv-01"]').click();
  await expect(page).toHaveURL(/video\.html\?.*musicVideo=mv-01/);
});

test('a music-video playlist card opens its playlist detail, same as any other playlist (TASK-376 — not a direct playthrough)', async ({ page }) => {
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
  await page.goto('/app/homeview/playlist-detail.html?playlist=pl-mv');
  await expect(page.locator('.detail-row[data-id="mv-02"]')).toBeVisible();
  await page.locator('.detail-row[data-id="mv-02"]').click();
  await expect(page).toHaveURL(/video\.html\?.*musicVideoPlaylist=pl-mv.*musicVideoTrack=mv-02/);
  // Starts AT the tapped track (mv-02), not the playlist's own first item.
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  expect(calls).toEqual([]); // never the audio player, never the video-playback engine
});

test('a plain audio playlist is unaffected — tapping a track still plays through the audio player', async ({ page }) => {
  await page.goto('/app/homeview/playlist-detail.html?playlist=pl-roadtrip');
  await expect(page.locator('.detail-row').first()).toBeVisible();
  await page.locator('.detail-row').first().click();
  await expect(page).toHaveURL(/audio\.html\?.*playlist=pl-roadtrip/);
});
