const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-018 (TASK-132) — the companion audio context: live transport
// (play/pause, prev/next, graduated skip, shuffle) + now-playing, plus the album
// track list with tap-to-teleport. The app side is mocked over the WS; the album
// catalog is backend state from /api/album (installApi fixtures). The mock holds
// a tiny app_state and echoes intents back as fresh snapshots — exactly the
// app↔companion contract.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

// Page name -> context_id the app echoes for it (album-detail emits 'detail');
// artist.html echoes its own 'artist' context.
const CTX_FOR = { 'album-detail': 'detail' };

// An ALBUM-sourced player: itemId/sourceId is the album, sourceType 'album'.
const ALBUM_ST = { screen: 'player', itemId: 'ootb', episodeId: 'ootb-02', positionSec: 110, durationSec: 245, playing: true, profile: 'kids', person: 'kids', shuffle: false, sourceType: 'album', sourceId: 'ootb' };
// An ARTIST-sourced player (BUG-018): itemId/sourceId is the ARTIST id, not an
// album, while a real track plays (episodeId). The companion must route Back to
// the artist screen and never loadAlbum(artistId).
const ARTIST_ST = { ...ALBUM_ST, itemId: 'ELO', sourceType: 'artist', sourceId: 'ELO' };
// A PLAYLIST-sourced player (FEAT-036/TASK-205): the source is a playlist, so the
// companion loads the track list via loadPlaylist (NOT loadAlbum), and Back routes
// to the playlist detail. pl-roadtrip is a 2-track cross-album mix.
const PLAYLIST_ST = { ...ALBUM_ST, itemId: 'pl-roadtrip', episodeId: 'ootb-01', sourceType: 'playlist', sourceId: 'pl-roadtrip' };

function mockApp(page, st) {
  let version = 1;
  let ctx = 'audio';
  return page.routeWebSocket(/:8766/, (ws) => {
    function pushState() { ws.send(msg('app_state', st)); }
    function pushCtx() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: ctx, series_id: st.itemId, display: { id: st.episodeId, title: 'Mr. Blue Sky' } }));
      pushState();
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      // TASK-158: the companion lists screens, auto-targets the sole one, then snapshots.
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') pushCtx();
      if (m.type === 'intent' && m.payload.intent === 'shuffle') { st.shuffle = !st.shuffle; pushState(); }
      if (m.type === 'intent' && m.payload.intent === 'toggle') { st.playing = !st.playing; pushState(); }
      if (m.type === 'intent' && m.payload.intent === 'play') { st.episodeId = m.payload.params.id; pushState(); }
      // navigate teleports the TV; the app echoes the target screen's context.
      if (m.type === 'intent' && m.payload.intent === 'navigate') {
        const p = m.payload.params.page.replace('.html', '');
        ctx = CTX_FOR[p] || p;
        pushCtx();
      }
    });
  });
}

test.describe('album source', () => {
test.beforeEach(async ({ page }) => {
  await installApi(page);
  await mockApp(page, { ...ALBUM_ST });
  await page.goto('/companion/audio.html');
});

test('shows the now-playing track and the album track list, current row highlighted', async ({ page }) => {
  await expect(page.locator('#ctx-label')).toHaveText('Now playing');
  await expect(page.locator('#now-title')).toHaveText('Mr. Blue Sky');
  await expect(page.locator('.track-btn')).toHaveCount(3);
  await expect(page.locator('.track-btn[data-id="ootb-01"] .t-name')).toHaveText('Turn to Stone');
  // app_state.episodeId === ootb-02 -> that row is the current one.
  await expect(page.locator('.track-btn[data-id="ootb-02"]')).toHaveClass(/cur/);
  await expect(page.locator('.track-btn[data-id="ootb-01"]')).not.toHaveClass(/cur/);
});

test('the play/pause icon reflects app_state.playing and toggles it', async ({ page }) => {
  await expect(page.locator('#c-toggle')).toHaveText('⏸');
  await page.locator('#c-toggle').click();
  await expect(page.locator('#c-toggle')).toHaveText('▶');
});

test('the shuffle pill reflects app_state.shuffle and toggling it round-trips', async ({ page }) => {
  await expect(page.locator('#c-shuffle')).not.toHaveClass(/on/);
  await page.locator('#c-shuffle').click();
  await expect(page.locator('#c-shuffle')).toHaveClass(/on/);
  await page.locator('#c-shuffle').click();
  await expect(page.locator('#c-shuffle')).not.toHaveClass(/on/);
});

test('tapping a track teleports the TV — the highlight follows the echoed snapshot', async ({ page }) => {
  await expect(page.locator('.track-btn[data-id="ootb-02"]')).toHaveClass(/cur/);
  await page.locator('.track-btn[data-id="ootb-03"]').click();
  await expect(page.locator('.track-btn[data-id="ootb-03"]')).toHaveClass(/cur/);
  await expect(page.locator('.track-btn[data-id="ootb-02"]')).not.toHaveClass(/cur/);
});

test('a graduated skip grid is present (±10s / ±30s)', async ({ page }) => {
  await expect(page.locator('.jump-btn')).toHaveText(['-30s', '-10s', '+10s', '+30s']);
});

test('+ Queue on a track POSTs queue-track for the active person (FEAT-031 producer)', async ({ page }) => {
  const posts = [];
  await page.route('**/api/playback/*', (route) => {
    posts.push({ url: route.request().url(), body: JSON.parse(route.request().postData() || '{}') });
    route.fulfill({ status: 204, body: '' });
  });
  // One ＋ producer control per track row, alongside the tap-to-play button.
  await expect(page.locator('.queue-btn')).toHaveCount(3);
  await page.locator('.queue-btn[data-queue="ootb-03"]').click();
  await expect.poll(() => posts.length).toBeGreaterThan(0);
  expect(posts[0].url).toContain('/api/playback/queue-track');
  expect(posts[0].url).toContain('person=kids');
  expect(posts[0].body.track_id).toBe('ootb-03');
});

test('a Queue button opens the companion Queue View', async ({ page }) => {
  await page.locator('#c-queue').click();
  await expect(page).toHaveURL(/companion\/queue\.html$/);
});

// FEAT-032 (TASK-218): the player's way back is the breadcrumb, not a Back
// button. With no recorded browse trail it is just Home > <track>; the Home crumb
// navigates back to browse (the TV teleports, the companion follows the echoed
// browse context off the audio screen).
test('uses a breadcrumb (no Back button); the Home crumb returns to browse', async ({ page }) => {
  await expect(page.locator('#btn-back')).toHaveCount(0);
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Mr. Blue Sky');
  await page.locator('#breadcrumb .crumb-link').first().click();
  await expect(page).toHaveURL(/companion\/browse\.html$/);
});
});

// FEAT-032 (TASK-218): when the user drilled browse before playing, that position
// is recorded in nav-trail, so the player breadcrumb offers the items level they
// came from (Home > Albums > <track>) and tapping it returns there.
test.describe('with a recorded browse trail', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await mockApp(page, { ...ALBUM_ST });
    await page.addInitScript(() => {
      sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([{ page: 'browse.html', params: { tab: 'music', rail: 'albums' }, label: 'Albums' }]));
    });
    await page.goto('/companion/audio.html');
  });

  test('the breadcrumb shows the recorded items level between Home and the track', async ({ page }) => {
    const links = page.locator('#breadcrumb .crumb-link');
    await expect(links).toHaveText(['Home', 'Albums']);
    await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Mr. Blue Sky');
  });

  test('tapping the items crumb returns to browse', async ({ page }) => {
    await page.locator('#breadcrumb .crumb-link', { hasText: 'Albums' }).click();
    await expect(page).toHaveURL(/companion\/browse\.html$/);
  });
});

// BUG-018: an artist-sourced player. The source id is the ARTIST, not an album,
// so Back must teleport the TV to artist.html (NOT album-detail.html?album=<id>,
// which 404s -> error page), and the companion must never loadAlbum(artistId).
test.describe('artist source (BUG-018)', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await mockApp(page, { ...ARTIST_ST });
  });

  test('an artist source loads no track list and never mistakes the artist id for an album', async ({ page }) => {
    const albumReqs = [];
    page.on('request', (r) => { [r.url()].filter((u) => u.includes('/api/album/')).forEach((u) => albumReqs.push(u)); });
    await page.goto('/companion/audio.html');
    await expect(page.locator('#now-title')).toHaveText('Mr. Blue Sky');
    // The artist id was never mistaken for an album: no /api/album/ELO fetch, and
    // the album track list stays empty (an artist source has no companion list).
    expect(albumReqs.filter((u) => u.includes('ELO'))).toHaveLength(0);
    await expect(page.locator('.track-btn')).toHaveCount(0);
    await expect(page.locator('#btn-back')).toHaveCount(0);
  });
});

// FEAT-036 (TASK-205): a playlist-sourced player. The companion loads the track
// list via loadPlaylist (NOT loadAlbum) and Back teleports the TV to the playlist
// detail (playlist.html) — the music analogue of the album-source case.
test.describe('playlist source (TASK-205)', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await mockApp(page, { ...PLAYLIST_ST });
  });

  test('shows the playlist track list via loadPlaylist (never loadAlbum), in stored order', async ({ page }) => {
    const albumReqs = [];
    page.on('request', (r) => { [r.url()].filter((u) => u.includes('/api/album/')).forEach((u) => albumReqs.push(u)); });
    await page.goto('/companion/audio.html');
    await expect(page.locator('.track-btn')).toHaveCount(2);
    await expect(page.locator('.track-btn[data-id="ootb-03"] .t-name')).toHaveText('Sweet Talkin Woman');
    await expect(page.locator('.track-btn[data-id="ootb-01"] .t-name')).toHaveText('Turn to Stone');
    // The playlist id was never mistaken for an album (no /api/album/pl-roadtrip).
    expect(albumReqs.filter((u) => u.includes('pl-roadtrip'))).toHaveLength(0);
  });

  test('the playlist player uses the breadcrumb (no Back button); Home returns to browse', async ({ page }) => {
    await page.goto('/companion/audio.html');
    await expect(page.locator('.track-btn')).toHaveCount(2);
    await expect(page.locator('#btn-back')).toHaveCount(0);
    await page.locator('#breadcrumb .crumb-link').first().click();
    await expect(page).toHaveURL(/companion\/browse\.html$/);
  });
});
