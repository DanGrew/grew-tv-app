const { test, expect } = require('@playwright/test');
const { installApi, installMusicVideoQueueBackend } = require('./fixtures/api.js');

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
