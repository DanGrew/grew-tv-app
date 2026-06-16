const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-198 (FEAT-035) — companion volume buttons. A vol-/vol+ pair on BOTH
// companion transports fires the `vol_down`/`vol_up` intents the TV player
// already handles (video) / now handles (audio, handler added this task). The
// app side is mocked over the WS; the mock records every intent so we can assert
// the wire. No backend change — these are plain relayed intents.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockApp(page, ctx, st, intents) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function pushCtx() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: ctx, series_id: st.itemId, display: { id: st.episodeId, title: 'Now Playing' } }));
      ws.send(msg('app_state', st));
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload.intent);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') pushCtx();
    });
  });
}

const VIDEO_ST = { screen: 'player', itemId: 'toy-story-main', episodeId: 'toy-story-main', positionSec: 120, durationSec: 4800, playing: true, profile: 'kids' };
const AUDIO_ST = { screen: 'player', itemId: 'ootb', episodeId: 'ootb-02', positionSec: 110, durationSec: 245, playing: true, profile: 'kids', shuffle: false };

test('companion video: vol-/vol+ buttons fire vol_down/vol_up intents', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockApp(page, 'video', VIDEO_ST, intents);
  await page.goto('/companion/video.html');
  await page.locator('#c-vol-up').click();
  await expect.poll(() => intents).toContain('vol_up');
  await page.locator('#c-vol-down').click();
  await expect.poll(() => intents).toContain('vol_down');
});

test('companion audio: vol-/vol+ buttons fire vol_down/vol_up intents', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await mockApp(page, 'audio', AUDIO_ST, intents);
  await page.goto('/companion/audio.html');
  await page.locator('#c-vol-up').click();
  await expect.poll(() => intents).toContain('vol_up');
  await page.locator('#c-vol-down').click();
  await expect.poll(() => intents).toContain('vol_down');
});
