const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-142 companion mirror: a Reset control on the companion player sends the
// `reset` intent to the TV, which clears this item's progress and exits the
// player. Two-tap confirm guards a mis-tap. The mock app answers `reset` by
// teleporting the TV to browse (the real app exits the player), and the
// companion follows the echoed context — so a successful reset navigates the
// companion off the player page.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockApp(page, ctx0, st, title) {
  let version = 1;
  let ctx = ctx0;
  return page.routeWebSocket(/:8766/, (ws) => {
    function pushState() { ws.send(msg('app_state', st)); }
    function pushCtx() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: ctx, series_id: st.itemId, display: { id: st.episodeId, title: title } }));
      pushState();
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') pushCtx();
      // Reset exits the player on the TV — model that as a teleport to browse.
      if (m.type === 'intent' && m.payload.intent === 'reset') { ctx = 'browse'; pushCtx(); }
    });
  });
}

const VIDEO_ST = { screen: 'player', itemId: 'toy-story-main', episodeId: 'toy-story-main', positionSec: 120, durationSec: 4800, playing: true, profile: 'kids' };
const AUDIO_ST = { screen: 'player', itemId: 'ootb', episodeId: 'ootb-02', positionSec: 110, durationSec: 245, playing: true, profile: 'kids', shuffle: false };

test('companion video Reset: two-tap arms then sends reset; TV exits and companion follows', async ({ page }) => {
  await installApi(page);
  await mockApp(page, 'video', VIDEO_ST, 'Toy Story');
  await page.goto('/companion/video.html');
  const reset = page.locator('#c-reset');
  await expect(reset).toHaveText('Reset progress');
  // First tap arms — confirm prompt, no navigation.
  await reset.click();
  await expect(reset).toHaveText('Reset progress?');
  await expect(reset).toHaveClass(/confirm/);
  await expect(page).toHaveURL(/video\.html/);
  // Second tap fires the reset intent — the TV exits and the companion follows.
  await reset.click();
  await expect(page).toHaveURL(/browse\.html/);
});

test('companion audio Reset: two-tap arms then sends reset; TV exits and companion follows', async ({ page }) => {
  await installApi(page);
  await mockApp(page, 'audio', AUDIO_ST, 'Mr. Blue Sky');
  await page.goto('/companion/audio.html');
  const reset = page.locator('#c-reset');
  await expect(reset).toHaveText('Reset progress');
  await reset.click();
  await expect(reset).toHaveText('Reset progress?');
  await expect(reset).toHaveClass(/confirm/);
  await expect(page).toHaveURL(/audio\.html/);
  await reset.click();
  await expect(page).toHaveURL(/browse\.html/);
});
