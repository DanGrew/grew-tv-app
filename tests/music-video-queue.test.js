const { test, expect } = require('@playwright/test');
const { installApi, installMusicVideoPlaybackBackend, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

// FEAT-418 (TASK-420, BUG-485) — the music-video Queue View overlay. It hangs
// off the persistent video player (screen-video-page.js, music-video mode)
// and draws the server `music_video_playback` snapshot (TASK-419): NOW
// PLAYING / PLAY NEXT / FROM SOURCE / THEN, every row editable (move/remove)
// — mirrors Music's own Queue View, not Video's queued-only one. BUG-485
// retired the earlier split where this snapshot only backed the overlay's own
// display while a separate client-owned seq actually drove the <video>
// element — every row action here now drives BOTH, off the one engine.

async function openPlayer(page, query) {
  await installApi(page);
  const backend = await installMusicVideoPlaybackBackend(page);
  await page.goto('/app/homeview/video.html?' + query);
  await expect(page.locator('#screen-video')).toBeVisible();
  return backend;
}

async function openQueue(page) {
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
}

test('the Queue button opens the overlay with the seeded Now Playing + Play Next queue', async ({ page }) => {
  await installApi(page);
  const backend = await installMusicVideoPlaybackBackend(page);
  backend.seed('queue-video', { video_id: 'mv-03' });
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await openQueue(page);
  await expect(page.locator('.now-playing .np-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('.now-playing .np-artist')).toHaveText('QOTSA');
  await expect(page.locator('.q-row.queued')).toHaveCount(1);
  await expect(page.locator('.q-row.queued .q-name')).toContainText('Starlight');
});

test('From Source lists the remaining source videos as play-to-jump rows too', async ({ page }) => {
  await openPlayer(page, 'musicVideoArtist=QOTSA&from=browse');
  await openQueue(page);
  await page.locator('.qtab[data-tab="next"]').click();
  // mv-02 also appears in the (inactive) Coming Up panel — repeat defaults on
  // — so the lookup is scoped to the active panel, not an unqualified select.
  await expect(page.locator('.qtab-panel.active .q-select[data-act="select"][data-video="mv-02"]')).toBeVisible();
});

test('tapping a row plays it immediately via play-video', async ({ page }) => {
  await openPlayer(page, 'musicVideoArtist=QOTSA&from=browse');
  await openQueue(page);
  await page.locator('.qtab[data-tab="next"]').click();
  const played = page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/play-video') && req.method() === 'POST');
  await page.locator('.qtab-panel.active .q-select[data-act="select"][data-video="mv-02"]').click();
  expect(JSON.parse((await played).postData())).toEqual({ video_id: 'mv-02' });
  await expect(page.locator('.now-playing .np-title')).toHaveText('No One Knows');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
});

test('removing a queued entry POSTs remove-queue-entry and the overlay repaints', async ({ page }) => {
  await installApi(page);
  const backend = await installMusicVideoPlaybackBackend(page);
  backend.seed('queue-video', { video_id: 'mv-03' });
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await openQueue(page);
  const removed = page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/remove-queue-entry') && req.method() === 'POST');
  await page.locator('.q-row.queued .q-act.danger').click();
  expect(JSON.parse((await removed).postData())).toEqual({ entry_id: 'e1' });
  await expect(page.locator('.q-row.queued')).toHaveCount(0);
});

test('reorder: the down arrow on a From Source row POSTs move-queue-entry', async ({ page }) => {
  // Play All spans every artist (mv-03 Muse plays first, artist-then-title
  // order) — From Source then holds the other two, enough to reorder within.
  await openPlayer(page, 'musicVideoAll=1&from=browse');
  await openQueue(page);
  await page.locator('.qtab[data-tab="next"]').click();
  await expect(page.locator('.qtab-panel.active .q-select[data-video="mv-02"]')).toBeVisible();
  // Scoped to the active (next/from-source) panel — a "then" row for the same
  // video also exists (repeat defaults on), so an unscoped .q-row lookup would
  // match two elements.
  const moved = page.waitForRequest(req => req.url().includes('/api/music-video-playback/move-queue-entry'));
  await page.locator('.qtab-panel.active .q-row').filter({ hasText: 'No One Knows' }).locator('.q-act:not([disabled])').first().click();
  const body = JSON.parse((await moved).postData());
  expect(body.direction).toBe('up');
});

test('Shuffle and Repeat pills toggle and reflect the snapshot', async ({ page }) => {
  await openPlayer(page, 'musicVideoArtist=QOTSA&from=browse');
  await openQueue(page);
  // Both default ON (server-side default when the client omits the flag,
  // TASK-407/420/421) — clicking flips a pill OFF.
  await expect(page.locator('.np-pill').first()).toHaveClass(/on/);
  const toggled = page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/toggle-shuffle') && req.method() === 'POST');
  await page.locator('.np-pill').first().click();
  await toggled;
  await expect(page.locator('.np-pill').first()).not.toHaveClass(/on/);
});

test('Back (Escape) closes the overlay and the still-playing music video is untouched', async ({ page }) => {
  await openPlayer(page, 'musicVideoArtist=QOTSA&from=browse');
  await openQueue(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#queue-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
});

test('an empty snapshot (an artist with no music videos) renders a stable shell, not a crash', async ({ page }) => {
  await openPlayer(page, 'musicVideoArtist=Nobody&from=browse');
  await openQueue(page);
  await expect(page.locator('.q-ends')).toContainText('Source ends');
});

// BUG-485 — the player's own entry sync fills the engine's source_type/
// source_id/now_playing off the SAME play-source/play-video actions that now
// also drive the actual <video> element (no separate Queue View interaction).
test('playing a music-video playlist directly syncs the engine\'s source + now-playing', async ({ page }) => {
  const backend = await openPlayer(page, 'musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect.poll(() => backend.snapshot().source_type).toBe('mv-playlist');
  expect(backend.snapshot().source_id).toBe('pl-mv');
  await expect.poll(() => (backend.snapshot().now_playing || {}).video_id).toBe('mv-01');
  // FROM SOURCE lists the rest of the SAME playlist, not stale queue-editor state.
  await openQueue(page);
  await expect(page.locator('.now-playing .np-title')).toHaveText('Head Like a Haunted House');
});

test('playing an artist\'s music videos syncs source_type mv-artist / source_id the artist name', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  const backend = await installMusicVideoPlaybackBackend(page);
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect.poll(() => backend.snapshot().source_type).toBe('mv-artist');
  expect(backend.snapshot().source_id).toBe('QOTSA');
});

// Play All syncs the SAME way, source_id null (mv-all has no per-source id,
// unlike mv-artist/mv-playlist).
test('Play All syncs source_type mv-all / source_id null', async ({ page }) => {
  const backend = await openPlayer(page, 'musicVideoAll=1&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect.poll(() => backend.snapshot().source_type).toBe('mv-all');
  expect(backend.snapshot().source_id).toBe(null);
});

test('advancing to the next music video re-syncs the engine\'s now-playing', async ({ page }) => {
  const backend = await openPlayer(page, 'musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect.poll(() => (backend.snapshot().now_playing || {}).video_id).toBe('mv-01');
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await expect.poll(() => (backend.snapshot().now_playing || {}).video_id).toBe('mv-02');
  // Reopening the Queue View shows the MOVED-TO video as Now Playing, not the
  // one that started the playthrough.
  await openQueue(page);
  await expect(page.locator('.now-playing .np-title')).toHaveText('No One Knows');
});
