const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS, VIDEOS } = require('./fixtures/api.js');

// FEAT-018/FEAT-027/FEAT-045 — music browse + album detail + <audio> player +
// shuffle. The Music tab (titled "Music"), the Recently Played rail (TASK-318)
// and routing are exercised end-to-end against the fixture album ("Out of the
// Blue", 3 tracks).
// FEAT-027: the app is type-agnostic — it groups by the server `section`, and a
// track is never a standalone browse card (no Singles rail). Host-agnostic:
// backend derives from the page origin (BUG-009). Music browse cards are injected
// here (not the shared fixture) so the video-only tests keep seeing exactly
// TV Series/Films/Home Movies.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

async function enterKids(page) {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
}

test('a Music tab (titled Music) appears after the video tabs, only when music is present', async ({ page }) => {
  await enterKids(page);
  await expect(page.locator('.sidebar-tab')).toHaveText(['TV Series', 'Films', 'Home Movies', 'Music']);
});

test('Music tab leads with a Playlists rail then Artists then Albums with square (music) tiles, no Singles rail', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  // TASK-235: the Music tab always renders a Playlists rail (heading + create ＋),
  // even with zero playlists — here the rail BODY is empty (no create tile).
  // TASK-234/318: with nothing recently played, that Playlists rail leads.
  await expect(page.locator('.rail-row')).toHaveCount(3);
  await expect(page.locator('.rail-row').nth(0)).toHaveAttribute('data-rail', 'playlists');
  await expect(page.locator('.rail-row').nth(1)).toHaveAttribute('data-rail', 'artists');
  await expect(page.locator('.rail-row').nth(2)).toHaveAttribute('data-rail', 'albums');
  await expect(page.locator('.rail-row[data-rail="playlists"] .film-tile')).toHaveCount(0);
  await expect(page.locator('.rail-title [data-create-playlist]')).toBeVisible();
  // Album = series card with section "music" (square art via data-music); "3 tracks" sub.
  const album = page.locator('.rail-row[data-rail="albums"] .film-tile[data-id="ootb"]');
  await expect(album).toHaveCount(1);
  await expect(album).toHaveAttribute('data-music', '');
  await expect(album.locator('.tile-sub')).toHaveText('3 tracks');
});

test('Artists rail has one square tile per artist (A-Z), labelled with the album count (FEAT-029)', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  const tiles = page.locator('.rail-row[data-rail="artists"] .film-tile');
  await expect(tiles).toHaveCount(2); // ABBA, ELO
  await expect(tiles.locator('.tile-title')).toHaveText(['ABBA', 'ELO']); // A-Z
  const elo = page.locator('.rail-row[data-rail="artists"] .film-tile[data-id="artist:ELO"]');
  await expect(elo).toHaveAttribute('data-music', ''); // square art
  await expect(elo.locator('.tile-sub')).toHaveText('2 albums');
  await expect(page.locator('.film-tile[data-id="artist:ABBA"] .tile-sub')).toHaveText('1 album');
});

test('selecting an artist drills into a grid of just that artist’s albums; an album opens its detail', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="artist:ELO"]').click();
  await expect(page).toHaveURL(/artist\.html/);
  await expect(page.locator('#grid-title')).toHaveText('ELO');
  // ELO's two albums, newest first by year (Time 1981 before Out of the Blue 1977);
  // ABBA's Arrival is absent.
  const tiles = page.locator('#rail-grid .film-tile');
  await expect(tiles).toHaveCount(2);
  await expect(tiles.locator('.tile-title')).toHaveText(['Time', 'Out of the Blue']);
  await expect(page.locator('#rail-grid .film-tile[data-id="abba-arrival"]')).toHaveCount(0);
  // Breadcrumb: Home › Music › ELO.
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('ELO');
  await page.locator('#rail-grid .film-tile[data-id="ootb"]').click();
  await expect(page).toHaveURL(/album-detail\.html/);
  await expect(page.locator('#detail-title')).toHaveText('Out of the Blue');
});

test('Back from an artist page returns to the Music tab', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="artist:ELO"]').click();
  await expect(page).toHaveURL(/artist\.html/);
  // Wait for the page module to register its key handlers (the grid render is the
  // ready signal) before the Backspace, else it races the navigation.
  await expect(page.locator('#grid-title')).toHaveText('ELO');
  await page.keyboard.press('Backspace');
  await expect(page).toHaveURL(/tab=music/);
  await expect(page.locator('.rail-row[data-rail="artists"]')).toBeVisible();
});

test('albums route to the album detail (not series detail)', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await expect(page).toHaveURL(/album-detail\.html/);
  await expect(page.locator('#detail-title')).toHaveText('Out of the Blue');
  // Track rows reuse the series-detail rows, numbered from items[].episode.
  await expect(page.locator('.detail-row')).toHaveCount(3);
  await expect(page.locator('.detail-row[data-id="ootb-01"] .detail-label')).toHaveText('1. Turn to Stone');
  // TASK-321: no header Play or Shuffle button — you start by tapping a track.
  await expect(page.locator('#btn-play-next')).toHaveCount(0);
  await expect(page.locator('#btn-shuffle')).toHaveCount(0);
});

// TASK-276: music has no mid-song resume, so a track row NEVER shows the
// mid-watch treatment (progress bar / Restart control), even with a saved
// position_secs. The shared detail screen still shows it for video episodes
// (detail-resume.test.js). Red on the old code (the bar rendered for audio too).
test('a music track left mid-song shows no progress bar or Restart control (TASK-276)', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [{ item_id: 'ootb-01', position_secs: 90, duration_secs: 227, last_watched: 1000 }] })
  }));
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await expect(page.locator('.detail-row')).toHaveCount(3);
  const row = page.locator('.detail-row[data-id="ootb-01"]');
  await expect(row.locator('.detail-progress')).toHaveCount(0);
  await expect(row.locator('.detail-restart')).toHaveCount(0);
});

test('selecting a track plays it in the <audio> player from {id}.m4a', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-02"]').click();
  await expect(page).toHaveURL(/audio\.html/);
  // TASK-321: tapping a track carries the album source + that track, NO shuffle
  // param (the backend owns shuffle now, per the source's stored pref — TASK-320).
  const url = page.url();
  expect(url).toContain('album=ootb');
  expect(url).toContain('track=ootb-02');
  expect(url).not.toContain('shuffle');
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
  await expect(page.locator('#audio-artist')).toHaveText('ELO');
  const src = await page.locator('#audio').getAttribute('src');
  expect(src).toContain('/media/ootb-02.m4a');
  // Album queue -> prev/next are present (not the single's hidden state).
  await expect(page.locator('#btn-prev')).toBeVisible();
  await expect(page.locator('#btn-next')).toBeVisible();
});

// REGRESSION (TASK-187): playback is server-authoritative — Next must POST the
// `next` action and let the returning snapshot advance now-playing, NOT mutate a
// local queue. Fails on pre-187 code (which advanced via core/queue.js and never
// hit /api/playback).
test('Next POSTs the server action and the snapshot advances now-playing (no client queue)', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  const nextPost = page.waitForRequest(r => r.url().includes('/api/playback/next') && r.method() === 'POST');
  await page.locator('#btn-next').click();
  await nextPost;
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
});

// REGRESSION (companion album track-jump race): tapping a track opens the player
// with album+track params, whose entry fires TWO independent actions — play-source
// (build the album queue, current = track 0) then play-track (jump to the tapped
// track). The server runs each on its own thread + DB conn (ThreadingHTTPServer,
// no lock), so firing them un-awaited races last-writer-wins; play-source is the
// heavier op and usually persists LAST, clobbering the jump back to track 0 ("it
// starts at the beginning"). The fix `then`-chains play-track on the resolved
// play-source POST. Here play-source is delayed: old code sends play-track DURING
// the delay (events: source-start, track, source-end → now-playing snaps back to
// track 0); fixed code sends it only AFTER play-source resolves.
test('a tapped track jumps only AFTER play-source persists — no race back to track 0', async ({ page }) => {
  const events = [];
  await page.route('**/api/playback/play-source**', async route => {
    events.push('source-start');
    await new Promise(r => setTimeout(r, 300));
    events.push('source-end');
    await route.fallback();
  });
  await page.route('**/api/playback/play-track**', async route => {
    events.push('track');
    await route.fallback();
  });
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await expect(page.locator('.detail-row')).toHaveCount(3);
  await page.locator('.detail-row[data-id="ootb-03"]').click();
  // The player settles on the TAPPED track, not the album's first track.
  await expect(page.locator('#audio-title')).toHaveText('Sweet Talkin Woman');
  // …because play-track is serialised after play-source fully resolves.
  expect(events).toEqual(['source-start', 'source-end', 'track']);
});

// The transport reports position via the server `position` action (playback_state
// is the audio resume source now), not the legacy /api/progress write.
test('position is reported to the playback position action', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  const posPost = page.waitForRequest(r => r.url().includes('/api/playback/position') && r.method() === 'POST');
  await page.evaluate(() => {
    const a = document.getElementById('audio');
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => 42 });
    Object.defineProperty(a, 'duration', { configurable: true, get: () => 227 });
    a.dispatchEvent(new Event('timeupdate'));
  });
  const req = await posPost;
  expect(JSON.parse(req.postData()).current_position).toBe(42);
});

// FEAT-045 (TASK-318) — the Music tab now LEADS with a "Recently Played" rail
// built from the backend `recents` (last opened sources, newest-first). Tapping a
// tile OPENS that source's detail page — same nav as any tile, fast access not a
// resume button (Story 3). The old inferred Continue Listening roll-up is gone.
test('Music tab leads with a "Recently Played" rail of recents tiles, newest-first; a tile opens its source', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [], recents: [
      { source_type: 'artist', source_id: 'ELO',  last_played: 2 },
      { source_type: 'album',  source_id: 'ootb', last_played: 1 }
    ] })
  }));
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  // Leads before Playlists/Artists/Albums.
  await expect(page.locator('.rail-title').first()).toHaveText('Recently Played');
  const rp = page.locator('.rail-row[data-rail="recent"]');
  // Newest-first: the ELO artist tile (by name), then the ootb album tile (by id).
  await expect(rp.locator('.film-tile')).toHaveCount(2);
  await expect(rp.locator('.film-tile').nth(0)).toHaveAttribute('data-id', 'artist:ELO');
  await expect(rp.locator('.film-tile').nth(1)).toHaveAttribute('data-id', 'ootb');
  // Tapping the album tile OPENS its detail (Story 3 — no auto-play; then you tap a track).
  await rp.locator('.film-tile[data-id="ootb"]').click();
  await expect(page).toHaveURL(/album-detail\.html/);
  await expect(page.locator('#detail-title')).toHaveText('Out of the Blue');
});

// Story 9 — nothing played yet: no Recently Played (nor a stray Continue Listening)
// rail; the tab leads with Playlists as before.
test('no "Recently Played" rail when nothing has been played; leads with Playlists (Story 9)', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await expect(page.locator('.rail-row[data-rail="recent"]')).toHaveCount(0);
  await expect(page.locator('.rail-row[data-rail="continue"]')).toHaveCount(0);
  await expect(page.locator('.rail-row').nth(0)).toHaveAttribute('data-rail', 'playlists');
});

test('an in-progress track does not leak into the Films Continue Watching rail', async ({ page }) => {
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [
      { item_id: 'ootb-02', title: 'Mr. Blue Sky', poster: 'ootb.jpg', position_secs: 110, duration_secs: 245, last_watched: '2026-06-08T00:00:00Z', format: null, collection_id: 'ootb', collection_title: 'Out of the Blue' },
      { item_id: 'finding-nemo-main', title: 'Finding Nemo', poster: 'nemo.jpg', position_secs: 1200, duration_secs: 6000, last_watched: '2026-06-05T00:00:00Z', format: 'film', collection_id: null, collection_title: null }
    ] })
  }));
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  const filmsCw = page.locator('.rail-row[data-rail="continue"]');
  await expect(filmsCw.locator('.film-tile')).toHaveCount(1);
  await expect(filmsCw.locator('.film-tile[data-id="finding-nemo-main"]')).toHaveCount(1);
  await expect(filmsCw.locator('.film-tile[data-id="ootb-02"]')).toHaveCount(0);
});

// BUG-016: open the <audio> player on the first album track.
async function openPlayer(page) {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
}

// BUG-016 (relayout): the pills live on their own row BELOW the progress bar, in
// the order queue, jump, lyrics, reset (shuffle/repeat removed in TASK-237). The
// transport row keeps only prev/play/next + the progress bar + time.
test('the pills sit on their own row below the progress bar in the BUG-016 order', async ({ page }) => {
  await openPlayer(page);
  const ids = await page.locator('#pill-row button').evaluateAll(els => els.map(e => e.id));
  expect(ids).toEqual(['btn-queue', 'btn-jump', 'btn-lyrics', 'btn-reset']);
  // Progress bar + time stay on the transport row; no pills there.
  await expect(page.locator('#transport #progress')).toHaveCount(1);
  await expect(page.locator('#transport #time-display')).toHaveCount(1);
  await expect(page.locator('#transport .pill')).toHaveCount(0);
});

// BUG-016 (dead clicks): the bar auto-hides after the idle window and sets
// pointer-events:none. Before the fix only a d-pad key could summon it, so a mouse
// could never wake it and every click was dead. Pointer activity must now wake the
// bar (re-enabling clicks) and re-arm the timer. Red on the old key-only summon.
test('after the idle window pointer activity wakes the bar so controls are clickable again', async ({ page }) => {
  await openPlayer(page);
  await expect(page.locator('#controls')).toHaveClass(/controls-hidden/, { timeout: 6000 });
  await page.mouse.move(400, 400);
  await expect(page.locator('#controls')).not.toHaveClass(/controls-hidden/);
  // And a control now fires (the Queue pill opens the Queue View overlay).
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
});

// TASK-283 — per-track trim: startAt seeds the load seek, endAt fires the normal
// next-track path early. The trim lives on the /api/video record; overriding that
// route (matched most-recent-first over installApi's generic one) drives it. A
// media element shim forces readyState>=1 + a settable currentTime so the load-seek
// applies synchronously headless (no real audio to fire loadedmetadata).
async function shimMediaElement(page) {
  await page.addInitScript(() => {
    const proto = HTMLMediaElement.prototype;
    const store = new WeakMap();
    Object.defineProperty(proto, 'currentTime', {
      configurable: true, get() { return store.get(this) || 0; }, set(v) { store.set(this, v); }
    });
    Object.defineProperty(proto, 'readyState', { configurable: true, get() { return 1; } });
  });
}
async function trimVideo(page, id, trim) {
  await page.route('**/api/video/' + id, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({}, VIDEOS[id], trim))
  }));
}

// A track whose record carries startAt begins at ~startAt, not 0. Red on the old
// code (swapTrack always seeded the load seek with 0).
test('a track with startAt seeks the <audio> to startAt on load (TASK-283)', async ({ page }) => {
  await shimMediaElement(page);
  await trimVideo(page, 'ootb-01', { startAt: 60 });
  await openPlayer(page);
  await expect.poll(() => page.locator('#audio').evaluate(a => a.currentTime)).toBe(60);
});

// Reaching endAt fires the SAME next-track path a natural end would — the next
// POST lands and now-playing advances to the following album track. Red on the old
// code (no endAt handling; the timeupdate at 150s did nothing).
test('a track with endAt advances via the normal next path on reaching endAt (TASK-283)', async ({ page }) => {
  await trimVideo(page, 'ootb-01', { endAt: 100 });
  await openPlayer(page);
  const nextPost = page.waitForRequest(r => r.url().includes('/api/playback/next') && r.method() === 'POST');
  await page.evaluate(() => {
    const a = document.getElementById('audio');
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => 150 });
    Object.defineProperty(a, 'duration', { configurable: true, get: () => 227 });
    a.dispatchEvent(new Event('timeupdate'));
  });
  await nextPost;
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
});

// A track with neither field is unchanged: starts at 0 and plays past a high
// timeupdate WITHOUT an early advance (now-playing stays put).
test('a track with neither startAt nor endAt is unchanged — start 0, no early advance (TASK-283)', async ({ page }) => {
  await shimMediaElement(page);
  await openPlayer(page);
  expect(await page.locator('#audio').evaluate(a => a.currentTime)).toBe(0);
  let nextFired = false;
  page.on('request', r => { nextFired = nextFired || r.url().includes('/api/playback/next'); });
  await page.evaluate(() => {
    const a = document.getElementById('audio');
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => 200 });
    Object.defineProperty(a, 'duration', { configurable: true, get: () => 227 });
    a.dispatchEvent(new Event('timeupdate'));
  });
  await page.waitForTimeout(200);
  expect(nextFired).toBe(false);
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
});

// BUG-044: the TV album player breadcrumb names the PLAYBACK SOURCE (a clickable
// crumb back to the album's own page) and the now-playing track as the leaf —
// Home › Out of the Blue › Turn to Stone. Old code showed only Home › <album title>
// (an inert leaf, no track, and the source was never clickable).
test('the TV album player breadcrumb names the source (clickable) and the now-playing track', async ({ page }) => {
  await openPlayer(page);
  await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Out of the Blue']);
  await expect(page.locator('#breadcrumb .crumb-current')).toHaveText('Turn to Stone');
  const src = page.locator('#breadcrumb .crumb-link', { hasText: 'Out of the Blue' });
  await expect(src).toHaveAttribute('data-page', 'album-detail.html');
  await expect(src).toHaveAttribute('data-params', JSON.stringify({ album: 'ootb' }));
});

test('tapping the source crumb on the TV album player opens that album’s detail', async ({ page }) => {
  await openPlayer(page);
  // Re-kick the controls auto-hide (a d-pad key) so the crumb stays clickable under
  // parallel load, then jump to the source.
  await page.keyboard.press('ArrowDown');
  await page.locator('#breadcrumb .crumb-link', { hasText: 'Out of the Blue' }).click();
  await expect(page).toHaveURL(/album-detail\.html\?album=ootb/);
  await expect(page.locator('#detail-title')).toHaveText('Out of the Blue');
});

// BUG-018: an artist-sourced player carries from='artist'; pressing Back returns
// to the artist screen, not browse and not the error page.
test('Back from an artist-sourced player returns to the artist screen, not error', async ({ page }) => {
  await page.goto('/app/homeview/audio.html?artist=ELO&from=artist');
  await expect(page.locator('#screen-audio')).toBeVisible();
  await page.locator('#btn-play-pause').focus();
  await page.keyboard.press('Backspace');
  await expect(page).toHaveURL(/artist\.html\?artist=ELO/);
  await expect(page).not.toHaveURL(/error/);
});
