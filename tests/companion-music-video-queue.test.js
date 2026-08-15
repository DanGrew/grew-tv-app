const { test, expect } = require('@playwright/test');
const { installApi, installMusicVideoQueueBackend } = require('./fixtures/api.js');

// FEAT-418 (TASK-420) — the companion Music-Video Queue View mirror. The phone
// renders the SAME server `music_video_playback` snapshot the TV gets
// (per-person relay) into NOW PLAYING / PLAY NEXT / FROM SOURCE / THEN, and
// DRIVES the queue by POSTing music-video-playback actions to
// /api/music-video-playback for the active person. Ships the Screen row
// (`mountScreenBar` + `#screen-bar`) from the start (TASK-417's gap, not
// repeated here — Constraints, TASK-420 spec).

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

async function setup(page, snap) {
  await installApi(page);
  const backend = await installMusicVideoQueueBackend(page, snap || seedSnapshot());
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
  await expect(page.locator('.ph-qrow.queued .nm')).toContainText('No One Knows');
  await page.locator('.ph-qtab[data-tab="next"]').click();   // source rows live under the Next tab
  await expect(page.locator('.ph-qname[data-act="select"][data-video="mv-03"]')).toBeVisible();
});

test('tapping a row plays it now (play-video) for the active person', async ({ page }) => {
  await setup(page);
  const played = expectPersonOnPost(page, 'play-video');
  await page.locator('.ph-qrow.queued .ph-qname[data-act="select"]').first().click();
  expect(JSON.parse((await played).postData())).toEqual({ video_id: 'mv-02' });
  await expect(page.locator('.ph-np .nm')).toHaveText('No One Knows');
});

test('reorder: a queued entry down-arrow POSTs move-queue-entry for the person', async ({ page }) => {
  const snap = seedSnapshot();
  snap.play_next.push({ entry_id: 'e4', video_id: 'mv-04', title: 'Second Queued Video', artist: 'Muse', poster: null, duration: 200 });
  await setup(page, snap);
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
  await setup(page);
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
