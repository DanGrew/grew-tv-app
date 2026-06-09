const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-018 (TASK-132) — the companion audio context: live transport
// (play/pause, prev/next, graduated skip, shuffle) + now-playing, plus the album
// track list with tap-to-teleport. The app side is mocked over the WS; the album
// catalog is backend state from /api/album (installApi fixtures). The mock holds
// a tiny app_state and echoes intents back as fresh snapshots — exactly the
// app↔companion contract.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

function mockApp(page) {
  let version = 1;
  const st = { screen: 'player', itemId: 'ootb', episodeId: 'ootb-02', positionSec: 110, durationSec: 245, playing: true, profile: 'kids', shuffle: false };
  return page.routeWebSocket(/:8766/, (ws) => {
    function pushState() { ws.send(msg('app_state', st)); }
    function pushCtx() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: 'audio', display: { id: st.episodeId, title: 'Mr. Blue Sky' } }));
      pushState();
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'snapshot_request') pushCtx();
      if (m.type === 'intent' && m.payload.intent === 'shuffle') { st.shuffle = !st.shuffle; pushState(); }
      if (m.type === 'intent' && m.payload.intent === 'toggle') { st.playing = !st.playing; pushState(); }
      if (m.type === 'intent' && m.payload.intent === 'play') { st.episodeId = m.payload.params.id; pushState(); }
    });
  });
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await mockApp(page);
  await page.goto('/companion/audio.html');
});

test('shows the now-playing track and the album track list, current row highlighted', async ({ page }) => {
  await expect(page.locator('#ctx-label')).toHaveText('Now playing');
  await expect(page.locator('#now-title')).toHaveText('Mr. Blue Sky');
  await expect(page.locator('.track-btn')).toHaveCount(3);
  await expect(page.locator('.track-btn[data-id="ootb-01"] .t-name')).toHaveText('Turn to Stone');
  // app_state.episodeId === ootb-02 -> that row is the current one.
  await expect(page.locator('.track-btn[data-id="ootb-02"]')).toHaveClass(/cur/);
  await expect(page.locator('.track-btn[data-id="ootb-01"]')).not.toHaveClass(/cur/);
});

test('the play/pause icon reflects app_state.playing and toggles it', async ({ page }) => {
  await expect(page.locator('#c-toggle')).toHaveText('⏸');
  await page.locator('#c-toggle').click();
  await expect(page.locator('#c-toggle')).toHaveText('▶');
});

test('the shuffle pill reflects app_state.shuffle and toggling it round-trips', async ({ page }) => {
  await expect(page.locator('#c-shuffle')).not.toHaveClass(/on/);
  await page.locator('#c-shuffle').click();
  await expect(page.locator('#c-shuffle')).toHaveClass(/on/);
  await page.locator('#c-shuffle').click();
  await expect(page.locator('#c-shuffle')).not.toHaveClass(/on/);
});

test('tapping a track teleports the TV — the highlight follows the echoed snapshot', async ({ page }) => {
  await expect(page.locator('.track-btn[data-id="ootb-02"]')).toHaveClass(/cur/);
  await page.locator('.track-btn[data-id="ootb-03"]').click();
  await expect(page.locator('.track-btn[data-id="ootb-03"]')).toHaveClass(/cur/);
  await expect(page.locator('.track-btn[data-id="ootb-02"]')).not.toHaveClass(/cur/);
});

test('a graduated skip grid is present (±10s / ±30s)', async ({ page }) => {
  await expect(page.locator('.jump-btn')).toHaveText(['-30s', '-10s', '+10s', '+30s']);
});
