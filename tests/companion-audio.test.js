const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend } = require('./fixtures/api.js');

// FEAT-018 (TASK-132) + FEAT-037 (TASK-245) — the companion audio context. The
// music mirror of the persistent TV player: it drives prev / next /
// play-track over the per-person /api/playback engine (PLANE B) and repaints
// now-playing, the current-track highlight and the track list's
// source from the `playback` snapshot the server pushes — the SAME snapshot the TV
// audio page renders (applySnapshot), so a track change the companion drives swaps
// the TV in place. play/pause / graduated skip / volume / reset stay on the legacy
// WS intent rail (PLANE A): the <audio>'s own transport has no server action.
//
// The backend is the installPlaybackBackend fixture (the HTTP-action -> WS-snapshot
// loop the real server runs); the companion handshake (list/register/snapshot_
// request) is answered there. An album source is seeded so the first snapshot has
// content. The nav/breadcrumb tests use a lightweight WS-only mock that echoes the
// `navigate` intent (those paths don't touch the playback engine).

function msg(type, payload) { return JSON.stringify({ type, payload }); }

// Page name -> context_id the app echoes for it (album-detail emits 'detail');
// artist.html echoes its own 'artist' context.
const CTX_FOR = { 'album-detail': 'detail' };

// Spy on the per-person playback engine POSTs while letting the backend still
// process them (route.fallback -> installPlaybackBackend), so an action is both
// observed AND repaints the snapshot. Mirrors companion-video's spyVideoActions.
function spyActions(page) {
  const posts = [];
  page.route('**/api/playback/*', function(route) {
    posts.push({
      action: decodeURIComponent(route.request().url().split('/api/playback/')[1].split('?')[0]),
      url: route.request().url(),
      body: JSON.parse(route.request().postData() || '{}')
    });
    route.fallback();
  });
  return posts;
}

// ── transport + now-playing + track list (Plane B, real snapshot loop) ──────────
test.describe('album source (Plane B)', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    const backend = await installPlaybackBackend(page);
    // An album-sourced player parked on track 2 ('Mr. Blue Sky').
    backend.seed('play-source', { source_type: 'album', source_id: 'ootb' });
    backend.seed('play-track', { track_id: 'ootb-02' });
    await page.goto('/companion/audio.html');
    await expect(page.locator('#now-title')).toHaveText('Mr. Blue Sky');
  });

  test('renders now-playing, the album track list and the current row from the snapshot', async ({ page }) => {
    await expect(page.locator('#ctx-label')).toHaveText('Now playing');
    await expect(page.locator('#now-title')).toHaveText('Mr. Blue Sky');
    await expect(page.locator('.track-btn')).toHaveCount(3);
    await expect(page.locator('.track-btn[data-id="ootb-01"] .t-name')).toHaveText('Turn to Stone');
    // now_playing.track_id === ootb-02 -> that row is the current one.
    await expect(page.locator('.track-btn[data-id="ootb-02"]')).toHaveClass(/cur/);
    await expect(page.locator('.track-btn[data-id="ootb-01"]')).not.toHaveClass(/cur/);
  });

  test('Next drives the per-person engine (Plane B) and now-playing repaints from the snapshot', async ({ page }) => {
    const posts = spyActions(page);
    await page.locator('#c-next').click();
    await expect(page.locator('#now-title')).toHaveText('Sweet Talkin Woman');
    await expect(page.locator('.track-btn[data-id="ootb-03"]')).toHaveClass(/cur/);
    expect(posts.map((p) => p.action)).toContain('next');
    expect(posts[0].url).toContain('person=kids');
  });

  // TASK-237: the companion player dropped its shuffle pill (shuffle is toggled on
  // the Queue View now). The control is gone entirely.
  test('the companion player has no shuffle pill', async ({ page }) => {
    await expect(page.locator('#c-shuffle')).toHaveCount(0);
  });

  test('tapping a track plays it via play-track (Plane B) and the highlight follows the snapshot', async ({ page }) => {
    const posts = spyActions(page);
    await expect(page.locator('.track-btn[data-id="ootb-02"]')).toHaveClass(/cur/);
    await page.locator('.track-btn[data-id="ootb-03"]').click();
    await expect(page.locator('.track-btn[data-id="ootb-03"]')).toHaveClass(/cur/);
    await expect(page.locator('.track-btn[data-id="ootb-02"]')).not.toHaveClass(/cur/);
    const play = posts.find((p) => p.action === 'play-track');
    expect(play.url).toContain('person=kids');
    expect(play.body.track_id).toBe('ootb-03');
  });

  test('+ Queue on a track POSTs queue-track for the active person (FEAT-031 producer)', async ({ page }) => {
    const posts = spyActions(page);
    // One ＋ producer control per track row, alongside the tap-to-play button.
    await expect(page.locator('.queue-btn')).toHaveCount(3);
    await page.locator('.queue-btn[data-queue="ootb-03"]').click();
    await expect.poll(() => posts.filter((p) => p.action === 'queue-track').length).toBeGreaterThan(0);
    const q = posts.find((p) => p.action === 'queue-track');
    expect(q.url).toContain('person=kids');
    expect(q.body.track_id).toBe('ootb-03');
  });

  // play/pause / skip / volume have no server action — they ride the legacy WS
  // intent rail (Plane A), so NONE of them touch the per-person playback engine.
  test('play/pause / skip / volume stay on the legacy intent rail — not playback actions', async ({ page }) => {
    const posts = spyActions(page);
    await page.locator('#c-toggle').click();
    await page.locator('#c-vol-up').click();
    await page.locator('.jump-btn', { hasText: '+30s' }).click();
    expect(posts).toHaveLength(0);
  });

  test('a graduated skip grid is present (±10s / ±30s)', async ({ page }) => {
    await expect(page.locator('.jump-btn')).toHaveText(['-30s', '-10s', '+10s', '+30s']);
  });

  test('a Queue button opens the companion Queue View', async ({ page }) => {
    await page.locator('#c-queue').click();
    await expect(page).toHaveURL(/companion\/queue\.html$/);
  });
});

// TASK-239: the companion Lyrics toggle. Control-only — it drives the TV's ambient
// lyrics layer via the `lyrics` WS intent (the TV falls it through to
// player.remote.lyrics) and mirrors the server-backed `lyricsOn` pref carried on
// app_state; the phone renders NO lyrics text. A lightweight WS mock stands in for
// the TV: it answers the handshake, seeds app_state with lyricsOn, captures the
// `lyrics` intent and echoes the flipped pref back so the round-trip is observable.
test.describe('lyrics toggle (TASK-239)', () => {
  function mockLyrics(page, initialOn) {
    const intents = [];
    return page.routeWebSocket(/:8766/, (ws) => {
      let lyricsOn = initialOn;
      function pushState() { ws.send(msg('app_state', { person: 'kids', profile: 'kids', screen: 'player', lyricsOn })); }
      ws.onMessage(function(raw) {
        const m = JSON.parse(raw);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') { ws.send(msg('context', { version: 1, context_id: 'audio' })); pushState(); }
        if (m.type === 'intent' && m.payload.intent === 'lyrics') { intents.push(m.payload.intent); lyricsOn = !lyricsOn; pushState(); }
      });
    }).then(() => intents);
  }

  test('shows a Lyrics toggle in the control row', async ({ page }) => {
    await installApi(page);
    await mockLyrics(page, false);
    await page.goto('/companion/audio.html');
    await expect(page.locator('#c-lyrics')).toHaveText(/Lyrics/);
  });

  test('renders no lyrics text on the companion itself (control-only)', async ({ page }) => {
    await installApi(page);
    await mockLyrics(page, true);
    await page.goto('/companion/audio.html');
    await expect(page.locator('#c-lyrics')).toBeVisible();
    // No ambient-lyrics layer on the phone — that lives on the TV audio page only.
    await expect(page.locator('#amb-cur')).toHaveCount(0);
  });

  test('reflects lyricsOn from app_state — the pill is lit when on', async ({ page }) => {
    await installApi(page);
    await mockLyrics(page, true);
    await page.goto('/companion/audio.html');
    await expect(page.locator('#c-lyrics')).toHaveClass(/on/);
  });

  test('tapping sends the lyrics intent and the pill reflects the echoed pref', async ({ page }) => {
    await installApi(page);
    const intents = await mockLyrics(page, false);
    await page.goto('/companion/audio.html');
    // Seeded OFF -> not lit yet.
    await expect(page.locator('#c-lyrics')).not.toHaveClass(/on/);
    await page.locator('#c-lyrics').click();
    // The intent reached the TV; the echoed app_state flip lights the pill.
    await expect(page.locator('#c-lyrics')).toHaveClass(/on/);
    expect(intents).toContain('lyrics');
  });
});

// BUG-018: an artist-sourced player. The source id is the ARTIST, not an album, so
// the companion must never loadAlbum(artistId) and shows no track list (an artist
// source has no companion list). The source rides the `playback` snapshot.
test.describe('artist source (BUG-018)', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    const backend = await installPlaybackBackend(page);
    backend.seed('play-source', { source_type: 'artist', source_id: 'ELO' });
    backend.seed('play-track', { track_id: 'ootb-02' });
  });

  test('an artist source loads no track list and never mistakes the artist id for an album', async ({ page }) => {
    const albumReqs = [];
    page.on('request', (r) => { [r.url()].filter((u) => u.includes('/api/album/')).forEach((u) => albumReqs.push(u)); });
    await page.goto('/companion/audio.html');
    await expect(page.locator('#now-title')).toHaveText('Mr. Blue Sky');
    expect(albumReqs.filter((u) => u.includes('ELO'))).toHaveLength(0);
    await expect(page.locator('.track-btn')).toHaveCount(0);
    await expect(page.locator('#btn-back')).toHaveCount(0);
  });
});

// FEAT-036 (TASK-205): a playlist-sourced player loads its list via loadPlaylist
// (NOT loadAlbum), in stored order. The source rides the `playback` snapshot.
test.describe('playlist source (TASK-205)', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    const backend = await installPlaybackBackend(page);
    backend.seed('play-source', { source_type: 'playlist', source_id: 'pl-roadtrip' });
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
});

// ── breadcrumb / mode nav (Plane A, WS-only) ────────────────────────────────────
// These paths drive the breadcrumb's `navigate` intent (or local hops), not the
// playback engine, so a lightweight WS mock that echoes navigate is enough. The
// now-playing title rides the WS context here (followContext), no snapshot needed.
function mockNav(page, st) {
  let version = 1;
  let ctx = 'audio';
  return page.routeWebSocket(/:8766/, (ws) => {
    function pushCtx() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: ctx, series_id: st.itemId, display: { id: st.episodeId, title: 'Mr. Blue Sky' } }));
      ws.send(msg('app_state', st));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') pushCtx();
      // navigate teleports the TV; the app echoes the target screen's context.
      if (m.type === 'intent' && m.payload.intent === 'navigate') {
        const p = m.payload.params.page.replace('.html', '');
        ctx = CTX_FOR[p] || p;
        pushCtx();
      }
    });
  });
}

// FEAT-032 (TASK-218): the player's way back is the breadcrumb, not a Back button.
// With no recorded browse trail it is just Home > <track>; the Home crumb navigates
// back to browse (the TV teleports, the companion follows the echoed browse context).
test.describe('breadcrumb nav', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await mockNav(page, { itemId: 'ootb', episodeId: 'ootb-02' });
    await page.goto('/companion/audio.html');
  });

  test('uses a breadcrumb (no Back button); the Home crumb returns to browse', async ({ page }) => {
    await expect(page.locator('#btn-back')).toHaveCount(0);
    await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Mr. Blue Sky');
    await page.locator('#breadcrumb .crumb-link').first().click();
    await expect(page).toHaveURL(/companion\/browse\.html$/);
  });

  // FEAT-038 (TASK-230): the player carries the Control/Browse switch. Browse ONLY
  // changes mode (no jump): it greys the transport in place (body.browsing) so there
  // are no dead clicks; the breadcrumb is a local hop to the library, keeping Browse.
  test('Browse toggles mode in place (no jump) and greys the transport', async ({ page }) => {
    await expect(page.locator('.seg-opt').filter({ hasText: 'Control' })).toHaveClass(/on/);
    await page.locator('.seg-opt').filter({ hasText: 'Browse' }).click();
    await expect(page).toHaveURL(/companion\/audio\.html$/);     // stayed on the player
    await expect(page.locator('body')).toHaveClass(/browsing/);  // transport greyed via CSS
    await expect(page.locator('.seg-opt').filter({ hasText: 'Browse' })).toHaveClass(/on/);
  });

  test('in Browse mode the breadcrumb is a local hop to the library (stays desynced)', async ({ page }) => {
    await page.locator('.seg-opt').filter({ hasText: 'Browse' }).click();
    await page.locator('#breadcrumb .crumb-link').first().click();
    await expect(page).toHaveURL(/companion\/browse\.html$/);
    const mode = await page.evaluate(() => sessionStorage.getItem('grew-tv:companion-mode'));
    expect(mode).toBe('desynced');
  });
});

// FEAT-032 (TASK-218): when the user drilled browse before playing, that position is
// recorded in nav-trail, so the player breadcrumb offers the items level they came
// from (Home > Albums > <track>) and tapping it returns there.
test.describe('with a recorded browse trail', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await mockNav(page, { itemId: 'ootb', episodeId: 'ootb-02' });
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

// FEAT-032 stale-Back regression: tapping a breadcrumb ANCESTOR must TRIM the trail
// so a later screen's Back can't retrace past the jump. BUG-021: the clicked
// ancestor itself is now KEPT as the new top (it is the destination — the page you
// land on restores from it); only entries DEEPER than it are dropped.
test.describe('breadcrumb ancestor click trims the trail (stale-Back fix)', () => {
  // A minimal app mock that does NOT echo the `navigate` intent — so the click's
  // trail trim is observable in place (the shared mockNav would teleport to
  // artist.html, which legitimately re-pushes ELO and hides the trim).
  function mockNoNav(page, st) {
    return page.routeWebSocket(/:8766/, (ws) => {
      ws.onMessage(function(raw) {
        const m = JSON.parse(raw);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') {
          ws.send(msg('context', { version: 2, context_id: 'audio', series_id: st.itemId, display: { id: st.episodeId, title: 'Mr. Blue Sky' } }));
          ws.send(msg('app_state', st));
        }
      });
    });
  }

  test('tapping the items crumb keeps that entry as the trail top (so the landed page restores from it)', async ({ page }) => {
    await installApi(page);
    await mockNoNav(page, { itemId: 'ELO', episodeId: 'ootb-02' });
    // A two-level trail: Home > Albums(browse) > ELO(artist). The player peeks the
    // top (ELO) for its items crumb.
    await page.addInitScript(() => {
      sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([
        { page: 'browse.html', params: { tab: 'music', rail: 'albums' }, label: 'Albums' },
        { page: 'artist.html', params: { artist: 'ELO' }, label: 'ELO' }
      ]));
    });
    await page.goto('/companion/audio.html');
    await page.locator('#breadcrumb .crumb-link', { hasText: 'ELO' }).waitFor();
    await page.locator('#breadcrumb .crumb-link', { hasText: 'ELO' }).click();
    // BUG-021: ELO is the destination (the artist page restores from it), so it
    // SURVIVES as the new top rather than being dropped; nothing was deeper to trim.
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('grew-tv:nav-trail'))).toBe(
      JSON.stringify([
        { page: 'browse.html', params: { tab: 'music', rail: 'albums' }, label: 'Albums' },
        { page: 'artist.html', params: { artist: 'ELO' }, label: 'ELO' }
      ])
    );
  });
});
