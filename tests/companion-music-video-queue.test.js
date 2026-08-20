const { test, expect } = require('@playwright/test');
const { installApi, installMusicVideoPlaybackBackend } = require('./fixtures/api.js');

// FEAT-418 (TASK-420, BUG-485) — the companion Music-Video Queue View mirror.
// The phone renders the SAME server `music_video_playback` snapshot the TV
// gets (per-person relay) into NOW PLAYING / PLAY NEXT / FROM SOURCE / THEN,
// and DRIVES the queue by POSTing music-video-playback actions to
// /api/music-video-playback for the active person — the same engine that also
// drives the actual <video> element (BUG-485 retired the earlier split).
// Ships the Screen row (`mountScreenBar` + `#screen-bar`) from the start
// (TASK-417's gap, not repeated here — Constraints, TASK-420 spec).
//
// Seeds via the fixture's real mv-artist:QOTSA source (mv-01/mv-02) plus a
// queue-video for mv-03 (a different artist, Muse) — mirrors how a companion
// queues any video regardless of the active source, same as the real engine.

async function setup(page, seedActions) {
  await installApi(page);
  const backend = await installMusicVideoPlaybackBackend(page);
  backend.seed('play-source', { source_type: 'mv-artist', source_id: 'QOTSA' });
  (seedActions || [{ action: 'queue-video', body: { video_id: 'mv-03' } }])
    .forEach(function(s) { backend.seed(s.action, s.body); });
  await page.goto('/companion/music-video-queue.html');
  await expect(page.locator('.ph-np .nm')).toHaveText('Head Like a Haunted House');   // settle signal
  return backend;
}

// Every action must carry the active person.
function expectPersonOnPost(page, fragment) {
  return page.waitForRequest(req =>
    req.url().includes('/api/music-video-playback/' + fragment) && req.method() === 'POST'
    && req.url().includes('person=kids'));
}

test('mirrors the sections from the server snapshot', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-np .by')).toHaveText('QOTSA');
  await expect(page.locator('.ph-qrow.queued')).toHaveCount(1);
  await expect(page.locator('.ph-qrow.queued .nm')).toContainText('Starlight');
  await page.locator('.ph-qtab[data-tab="next"]').click();   // source rows live under the Next tab
  // mv-02 also appears in the (inactive) Coming Up panel — repeat defaults on.
  await expect(page.locator('.ph-qtab-panel.active .ph-qname[data-act="select"][data-video="mv-02"]')).toBeVisible();
});

test('tapping a row plays it now (play-video) for the active person', async ({ page }) => {
  await setup(page);
  const played = expectPersonOnPost(page, 'play-video');
  await page.locator('.ph-qrow.queued .ph-qname[data-act="select"]').first().click();
  expect(JSON.parse((await played).postData())).toEqual({ video_id: 'mv-03' });
  await expect(page.locator('.ph-np .nm')).toHaveText('Starlight');
});

test('reorder: a queued entry down-arrow POSTs move-queue-entry for the person', async ({ page }) => {
  await setup(page, [
    { action: 'queue-video', body: { video_id: 'mv-03' } },
    { action: 'queue-video', body: { video_id: 'mv-02' } }
  ]);
  const moved = expectPersonOnPost(page, 'move-queue-entry');
  await page.locator('.ph-qrow.queued').first().locator('.ph-ract:not([disabled])').first().click();
  expect(JSON.parse((await moved).postData())).toEqual({ entry_id: 'e1', direction: 'down' });
});

test('removing the queued row POSTs remove-queue-entry and repaints without it', async ({ page }) => {
  await setup(page);
  const removed = expectPersonOnPost(page, 'remove-queue-entry');
  await page.locator('.ph-qrow.queued .ph-ract.x').first().click();
  expect(JSON.parse((await removed).postData())).toEqual({ entry_id: 'e1' });
  await expect(page.locator('.ph-qrow.queued')).toHaveCount(0);
});

test('toggling shuffle POSTs the action and reflects the snapshot', async ({ page }) => {
  await installApi(page);
  const backend = await installMusicVideoPlaybackBackend(page);
  backend.seed('play-source', { source_type: 'mv-artist', source_id: 'QOTSA', shuffle: false });
  await page.goto('/companion/music-video-queue.html');
  await expect(page.locator('.ph-np .nm')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('.ph-tbtn[data-action="toggle-shuffle"]')).not.toHaveClass(/on/);
  await page.locator('.ph-tbtn[data-action="toggle-shuffle"]').click();
  await expect(page.locator('.ph-tbtn[data-action="toggle-shuffle"]')).toHaveClass(/on/);
});

test('back returns to the companion video player', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-back').click();
  await expect(page).toHaveURL(/companion\/video\.html$/);
});

// FEAT-418 constraint: this page ships the Screen row from the start, unlike
// queue.html/video-queue.html (TASK-417's gap).
test('the Screen row is mounted from the start', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-status').click();
  await expect(page.locator('#screen-bar')).not.toBeEmpty();
  await expect(page.locator('#screen-bar')).toContainText('TV');
});

test('Switch profile sends the navigate intent to the picker', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await page.routeWebSocket(/:8766/, ws => {
    ws.onMessage(raw => {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload);
    });
  });
  await page.goto('/companion/music-video-queue.html');
  await page.locator('#btn-status').click();
  await page.locator('#switch-profile').click();
  await expect.poll(() => intents.filter(i => i.intent === 'navigate' && i.params.page === 'profile.html').length).toBeGreaterThan(0);
});
