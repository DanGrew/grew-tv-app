const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-501 (FEAT-497) — the companion's play menu (#queue-menu, its own ▶ icon
// beside ☰ since TASK-445) holds one Continue button per media type, where
// FEAT-040's two 🎬/🎵 play-the-queue pills used to sit. Those covered two of
// the four types, hid themselves at an empty queue and STARTED a queue; a
// Continue press carries on with its type — the queue's front, else the next
// item of the source it was last playing, both the engine's own advance.
//
// Story 4: the phone does exactly what the TV's own button does — it drives the
// TV with a `navigate` intent to the same target the TV would navigate itself
// to, off the same shared builder (ui/screens/continue-menu.js). And like every
// TV-driving control here, it greys while desynced.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockApp(page, intents) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function push() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: 'browse' }));
      ws.send(msg('app_state', { screen: 'home', profile: 'kids', person: 'mom' }));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') push();
    });
  });
}

// A GET snapshot for one media type. Every type reads its own, so a test
// seeding one must answer for the other three too (mockAllQueues below).
async function mockQueue(page, mediaType, fields) {
  await page.route(new RegExp('/api/queue/' + mediaType + '\\?'), route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(Object.assign({ person_id: 'mom', media_type: mediaType, now_playing: null, queue: [], next: [], coming_up: [], source_type: null, source_id: null, repeat: false, shuffle: false }, fields))
  }));
}
async function mockAllQueues(page) {
  await mockQueue(page, 'film', {});
  await mockQueue(page, 'home-movie', {});
  await mockQueue(page, 'music', {});
  await mockQueue(page, 'music-video', {});
}
function queued(count) {
  return { queue: Array.from({ length: count }, (_, i) => ({ entry_id: 'e' + (i + 1), item_id: 'f' + i, title: 'Film ' + i })) };
}

async function openPlayMenu(page) {
  await expect(page.locator('#section-dock .dock-tab').first()).toBeVisible();
  await page.locator('#btn-queue-menu').click();
}

// Story 3 — nothing to continue anywhere still shows four buttons, dimmed
// rather than gone, so the menu never shrinks to a shifting list.
test('all four Continue buttons stay visible with nothing to continue', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockApp(page, intents);
  await mockAllQueues(page);
  await page.goto('/companion/browse.html');
  await openPlayMenu(page);
  await expect(page.locator('#queue-menu .continue-btn')).toHaveCount(4);
  for (const id of ['btn-continue-film', 'btn-continue-home-movie', 'btn-continue-music', 'btn-continue-music-video']) {
    await expect(page.locator('#' + id)).toBeVisible();
    await expect(page.locator('#' + id)).toBeDisabled();
  }
  await expect(page.locator('#btn-continue-home-movie')).toHaveText('▶ Continue Home Movies');
});

// Story 1 + story 4 — a queued film wakes Continue Films, and pressing it
// drives the TV to the film continue entry (the TV's own button's target).
test('Continue Films drives the TV to the film continue entry', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockApp(page, intents);
  await mockAllQueues(page);
  await mockQueue(page, 'film', queued(2));
  await page.goto('/companion/browse.html');
  await openPlayMenu(page);
  await expect(page.locator('#btn-continue-film')).toBeEnabled();
  await page.locator('#btn-continue-film').click();
  await expect.poll(() => intents.find(i => i.intent === 'navigate' && i.params.page === 'video.html')).toBeTruthy();
  const nav = intents.find(i => i.intent === 'navigate' && i.params.page === 'video.html');
  expect(nav.params.params).toMatchObject({ continueType: 'film', from: 'browse' });
});

// Music carries on in the audio player, not the video one — the per-type
// target the config resolves, identical on both surfaces.
test('Continue Music drives the TV to the audio player', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockApp(page, intents);
  await mockAllQueues(page);
  await mockQueue(page, 'music', queued(1));
  await page.goto('/companion/browse.html');
  await openPlayMenu(page);
  await page.locator('#btn-continue-music').click();
  await expect.poll(() => intents.find(i => i.intent === 'navigate' && i.params.page === 'audio.html')).toBeTruthy();
  const nav = intents.find(i => i.intent === 'navigate' && i.params.page === 'audio.html');
  expect(nav.params.params).toMatchObject({ continueType: 'music', from: 'browse' });
});

// Story 2 — nothing queued, but the source has more ahead: Continue is still
// live. The old pill, counting the queue alone, read dead here.
test('Continue is live on an empty queue when the source has more ahead', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockApp(page, intents);
  await mockAllQueues(page);
  await mockQueue(page, 'music-video', { next: [{ entry_id: 'e1', item_id: 'mv-02' }], source_type: 'mv-all' });
  await page.goto('/companion/browse.html');
  await openPlayMenu(page);
  await expect(page.locator('#btn-continue-music-video')).toBeEnabled();
  await expect(page.locator('#btn-continue-film')).toBeDisabled();
});

test('a Continue button greys out in Browse (desync) mode — it drives the TV', async ({ page }) => {
  const intents = [];
  await page.addInitScript(() => sessionStorage.setItem('grew-tv:companion-mode', 'desynced'));
  await installApi(page);
  await mockApp(page, intents);
  await mockAllQueues(page);
  await mockQueue(page, 'film', queued(1));
  await page.goto('/companion/browse.html');
  await openPlayMenu(page);
  await expect(page.locator('#btn-continue-film')).toHaveClass(/desync-off/);
  await expect(page.locator('#btn-continue-music')).toHaveClass(/desync-off/);
});
