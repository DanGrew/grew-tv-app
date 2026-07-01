const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-040 (Play Queue) — the companion browse "🎬 Video Queue (N)" button. When the
// video override queue is non-empty (read from GET /api/video-playback), the
// button appears; tapping it drives the TV player to start the queue head via a
// `navigate` intent to video.html?playQueue=1. Solves: "to reach the queue you had
// to start something random first." It drives the TV, so it greys while desynced.

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

// A GET snapshot with `count` queued videos.
async function mockQueue(page, count) {
  const queue = Array.from({ length: count }, (_, i) => ({ entry_id: 'e' + (i + 1), item_id: 'f' + i, title: 'Film ' + i }));
  await page.route(/\/api\/video-playback\?/, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ now_playing: null, items: [], override_queue: queue, current_item_index: 0, source_type: null, source_id: null, repeat: false, shuffle: false })
  }));
}

test('Play Queue button shows the count and drives the TV to start the queue', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockApp(page, intents);
  await mockQueue(page, 2);
  await page.goto('/companion/browse.html');
  await expect(page.locator('#sections-row .chip').first()).toBeVisible();
  await expect(page.locator('#btn-play-queue')).toHaveText('🎬 Video Queue (2)');
  await page.locator('#btn-play-queue').click();
  await expect.poll(() => intents.find(i => i.intent === 'navigate' && i.params.page === 'video.html')).toBeTruthy();
  const nav = intents.find(i => i.intent === 'navigate' && i.params.page === 'video.html');
  expect(nav.params.params).toMatchObject({ playQueue: 1 });
});

test('Play Queue button is hidden when the queue is empty', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockApp(page, intents);
  await mockQueue(page, 0);
  await page.goto('/companion/browse.html');
  await expect(page.locator('#sections-row .chip').first()).toBeVisible();
  await expect(page.locator('#btn-play-queue')).toBeHidden();
});

test('Play Queue greys out in Browse (desync) mode — it drives the TV', async ({ page }) => {
  const intents = [];
  await page.addInitScript(() => sessionStorage.setItem('grew-tv:companion-mode', 'desynced'));
  await installApi(page);
  await mockApp(page, intents);
  await mockQueue(page, 1);
  await page.goto('/companion/browse.html');
  await expect(page.locator('#sections-row .chip').first()).toBeVisible();
  await expect(page.locator('#btn-play-queue')).toHaveClass(/desync-off/);
});
