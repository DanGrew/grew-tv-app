const { test, expect } = require('@playwright/test');
const { installApi, installMusicVideoQueueBackend, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

// FEAT-418 (TASK-420) — the music-video Queue View overlay. It hangs off the
// persistent video player (screen-video-page.js, music-video mode) and draws
// the server `music_video_playback` snapshot (TASK-419): NOW PLAYING / PLAY
// NEXT / FROM SOURCE / THEN, every row editable (move/remove) — mirrors
// Music's own Queue View, not Video's queued-only one. This snapshot is
// DELIBERATELY separate from the actual on-screen playthrough (the
// client-owned seq, core/music-video-playthrough.js, TASK-374/407) — the two
// are independent state until a future task (if any) migrates playthrough
// itself onto the engine; these tests assert the overlay renders/drives the
// engine, not that it controls what the <video> element is currently playing.

function seedSnapshot() {
  return {
    person_id: 'kids',
    now_playing: { video_id: 'mv-01', title: 'Head Like a Haunted House', artist: 'QOTSA', poster: 'mv-01.jpg', duration: 210 },
    play_next: [{ entry_id: 'e1', video_id: 'mv-02', title: 'No One Knows', artist: 'QOTSA', poster: 'mv-02.jpg', duration: 195 }],
    from_source: [{ entry_id: 'e2', video_id: 'mv-03', title: 'Starlight', artist: 'Muse', poster: 'mv-03.jpg', duration: 240 }],
    then: [],
    shuffle: false, repeat: false, source_type: 'mv-artist', source_id: 'QOTSA'
  };
}

async function openPlayer(page, snap) {
  await installApi(page);
  const backend = await installMusicVideoQueueBackend(page, snap || seedSnapshot());
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  return backend;
}

async function openQueue(page) {
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
}

test('the Queue button opens the overlay with the seeded Now Playing + Play Next queue', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.now-playing .np-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('.now-playing .np-artist')).toHaveText('QOTSA');
  await expect(page.locator('.q-row.queued')).toHaveCount(1);
  await expect(page.locator('.q-row.queued .q-name')).toContainText('No One Knows');
});

test('From Source lists the remaining source videos as play-to-jump rows too', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.locator('.qtab[data-tab="next"]').click();
  await expect(page.locator('.q-select[data-act="select"][data-video="mv-03"]')).toBeVisible();
});

test('tapping a row plays it immediately via play-video', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const played = page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/play-video') && req.method() === 'POST');
  await page.locator('.q-select[data-act="select"][data-video="mv-02"]').click();
  expect(JSON.parse((await played).postData())).toEqual({ video_id: 'mv-02' });
  await expect(page.locator('.now-playing .np-title')).toHaveText('No One Knows');
});

test('removing a queued entry POSTs remove-queue-entry and the overlay repaints', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const removed = page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/remove-queue-entry') && req.method() === 'POST');
  await page.locator('.q-row.queued .q-act.danger').click();
  expect(JSON.parse((await removed).postData())).toEqual({ entry_id: 'e1' });
  await expect(page.locator('.q-row.queued')).toHaveCount(0);
});

test('reorder: the down arrow on a From Source row POSTs move-queue-entry', async ({ page }) => {
  const snap = seedSnapshot();
  snap.from_source.push({ entry_id: 'e3', video_id: 'mv-04', title: 'Second Source Video', artist: 'Muse', poster: null, duration: 200 });
  await openPlayer(page, snap);
  await openQueue(page);
  await page.locator('.qtab[data-tab="next"]').click();
  const moved = page.waitForRequest(req => req.url().includes('/api/music-video-playback/move-queue-entry'));
  await page.locator('.q-row').filter({ hasText: 'Starlight' }).locator('.q-act:not([disabled])').first().click();
  expect(JSON.parse((await moved).postData())).toEqual({ entry_id: 'e2', direction: 'down' });
});

test('Shuffle and Repeat pills toggle and reflect the snapshot', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.np-pill').first()).not.toHaveClass(/on/);
  const toggled = page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/toggle-shuffle') && req.method() === 'POST');
  await page.locator('.np-pill').first().click();
  await toggled;
  await expect(page.locator('.np-pill').first()).toHaveClass(/on/);
});

test('Back (Escape) closes the overlay and the still-playing music video is untouched', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#queue-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
});

test('an empty snapshot renders a stable shell, not a crash', async ({ page }) => {
  await openPlayer(page, { now_playing: null, play_next: [], from_source: [], then: [], shuffle: false, repeat: false });
  await openQueue(page);
  await expect(page.locator('.q-ends')).toContainText('Source ends');
});

// TASK-441 — the player's own entry sync (screen-video-page.js mvBegin/
// mvGoNext/mvGoPrev), NOT a Queue View interaction, is what fills the
// engine's source_type/source_id/now_playing. Seeded EMPTY (no queue rows
// pre-loaded, unlike seedSnapshot() above) so a passing assertion proves the
// player itself did the sync, not the fixture's own seed.
function emptyStartSnap() {
  return {
    person_id: 'kids', now_playing: null, play_next: [],
    from_source: [
      { entry_id: 'e1', video_id: 'mv-01', title: 'Head Like a Haunted House', artist: 'QOTSA', poster: 'mv-01.jpg', duration: 210 },
      { entry_id: 'e2', video_id: 'mv-02', title: 'No One Knows', artist: 'QOTSA', poster: 'mv-02.jpg', duration: 195 }
    ],
    then: [], shuffle: true, repeat: true, source_type: null, source_id: null
  };
}

test('TASK-441: playing a music-video playlist directly syncs the engine\'s source + now-playing, no Queue View interaction first', async ({ page }) => {
  await installApi(page);
  const backend = await installMusicVideoQueueBackend(page, emptyStartSnap());
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect.poll(() => backend.snapshot().source_type).toBe('mv-playlist');
  expect(backend.snapshot().source_id).toBe('pl-mv');
  await expect.poll(() => (backend.snapshot().now_playing || {}).video_id).toBe('mv-01');
  // FROM SOURCE lists the rest of the SAME playlist, not stale queue-editor state.
  await openQueue(page);
  await expect(page.locator('.now-playing .np-title')).toHaveText('Head Like a Haunted House');
});

test('TASK-441: playing an artist\'s music videos syncs source_type mv-artist / source_id the artist name', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  const backend = await installMusicVideoQueueBackend(page, emptyStartSnap());
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect.poll(() => backend.snapshot().source_type).toBe('mv-artist');
  expect(backend.snapshot().source_id).toBe('QOTSA');
});

// TASK-445 — Play All syncs the SAME way, source_id null (mv-all has no
// per-source id, unlike mv-artist/mv-playlist).
test('TASK-441/445: Play All syncs source_type mv-all / source_id null', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  const backend = await installMusicVideoQueueBackend(page, emptyStartSnap());
  await page.goto('/app/homeview/video.html?musicVideoAll=1&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect.poll(() => backend.snapshot().source_type).toBe('mv-all');
  expect(backend.snapshot().source_id).toBe(null);
});

test('TASK-441: advancing to the next music video re-syncs the engine\'s now-playing', async ({ page }) => {
  await installApi(page);
  const backend = await installMusicVideoQueueBackend(page, emptyStartSnap());
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
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
