const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-568 — the phone half of Night Mode (FEAT-017/028 mirror invariant). The
// level lives on the TV, so the phone keeps no copy of it: it renders whatever
// the app_state snapshot says and sends a press as the `nightMode` intent. That
// is what makes the two surfaces agree whichever one changed it (stories 2 and
// 3) by construction, rather than by two copies being kept in step.
//
// Same shape as tests/companion-volume.test.js: the app side is mocked over the
// WS, the mock records every intent so we can assert the wire, and it can push a
// fresh app_state to stand in for the TV changing the level itself.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

const BASE = { screen: 'player', itemId: 'toy-story-main', episodeId: 'toy-story-main', positionSec: 120, durationSec: 4800, playing: true, profile: 'kids' };

// The mock stands in for the TV, which is where the level actually lives — so
// it HOLDS one and replays it, rather than answering every snapshot_request
// with a fixed value. A mock that re-pushed 'off' on each request raced the
// test's own `set` (the companion's watchdog asks again on its own schedule) and
// the phone flipped back mid-assert.
function mockApp(page, intents) {
  let version = 1;
  let socket = null;
  const hub = {
    level: 'off',
    state() { return Object.assign({}, BASE, { nightMode: hub.level }); },
    set(level) {
      hub.level = level;
      socket.send(msg('app_state', hub.state()));
    }
  };
  const ready = page.routeWebSocket(/:8766/, (ws) => {
    socket = ws;
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload.intent);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') {
        version += 1;
        ws.send(msg('context', { version, context_id: 'video', series_id: BASE.itemId, display: { id: BASE.episodeId, title: 'Now Playing' } }));
        ws.send(msg('app_state', hub.state()));
      }
    });
  });
  return ready.then(() => hub);
}

test('the companion shows the same Night Mode control, at the level the TV is on', async ({ page }) => {
  const intents = [];
  await installApi(page);
  const app = await mockApp(page, intents);
  await page.goto('/companion/video.html');
  await expect(page.locator('#c-night')).toBeVisible();
  await expect(page.locator('#c-night')).toHaveText('Night: Off');
  // Story 3 — the TV's own change reaches the phone on the next snapshot, which
  // the player emits immediately on a press as well as on the 1 Hz heartbeat.
  app.set('strong');
  await expect(page.locator('#c-night')).toHaveText('Night: Strong');
  await expect(page.locator('#c-night')).toHaveClass(/\bon\b/);
  app.set('off');
  await expect(page.locator('#c-night')).toHaveText('Night: Off');
  await expect(page.locator('#c-night')).not.toHaveClass(/\bon\b/);
});

test('pressing it on the phone fires the nightMode intent at the TV', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockApp(page, intents);
  await page.goto('/companion/video.html');
  await expect(page.locator('#c-night')).toHaveText('Night: Off');
  await page.locator('#c-night').click();
  await expect.poll(() => intents).toContain('nightMode');
});

test('a snapshot with no Night Mode at all reads as Off, not blank', async ({ page }) => {
  const intents = [];
  await installApi(page);
  const app = await mockApp(page, intents);
  await page.goto('/companion/video.html');
  // Wait for the first snapshot to land before pushing our own — it is what
  // proves the socket is up, and the level starts at Off anyway.
  await expect(page.locator('#c-night')).toHaveText('Night: Off');
  // A reconnect replay, or a TV that predates this task, carries no nightMode
  // at all (JSON drops the undefined) — core/night-mode.js resolves a level it
  // doesn't know to Off, so the control reads Off rather than blank.
  app.set('strong');
  await expect(page.locator('#c-night')).toHaveText('Night: Strong');
  app.set(undefined);
  await expect(page.locator('#c-night')).toHaveText('Night: Off');
});
