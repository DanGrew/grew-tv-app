const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-560/TASK-564 — the phone while the TV is on a channel. The mirror
// invariant (FEAT-017/028) is that both surfaces carry the feature, and this is
// the half that was missing when the chrome first shipped: the phone went on
// showing a queue's controls over a channel, which was wrong in three ways a
// viewer hit straight away —
//
//   * Clear progress was live. Pressing it cleared the REAL watch progress of
//     the item the channel happened to be airing (decision 16 says a channel
//     play touches watch_progress in neither direction) and dropped the TV out
//     of the channel doing it.
//   * The breadcrumb named the recorded browse RAIL ("On now") rather than the
//     channel, and its target was a rail-grid page the TV has no channels grid
//     for — pressing it landed the TV on "Nothing here yet".
//   * ⏮/⏭/🔀/🔁 sat live over an engine that is not playing, and did nothing.
//
// The push under all three is core/video-page-config.js's channelVideoContext.
// This suite drives it the way the TV does, over its own small WS mock (the
// pattern tests/companion-video-music-video.js uses) — no engine, because a
// channel has none.

var CHANNEL_SOURCE = { label: 'After Dark', page: 'browse.html', params: { tab: 'channels' } };

async function installChannelTv(page, opts) {
  var o = opts || {};
  var intents = [];
  await page.routeWebSocket(/:8766/, function(ws) {
    ws.onMessage(function(raw) {
      var m = JSON.parse(raw);
      intents.push(m);
      var REPLY = {
        list_devices: function() {
          ws.send(JSON.stringify({ type: 'devices', payload: { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] } }));
        },
        register_companion: function() {},
        snapshot_request: function() {
          ws.send(JSON.stringify({
            type: 'context',
            payload: {
              context_id: 'video', version: 1,
              display: { id: 'film-8-mile-main', title: '8 Mile' },
              channel: true, channelSource: CHANNEL_SOURCE,
              musicVideo: false, homeMovie: false, film: false, series: false,
              filmTransport: { previous: false, next: false, shuffle: false, repeat: false }
            }
          }));
          ws.send(JSON.stringify({
            type: 'app_state',
            payload: {
              person: 'dad', profile: 'adults', screen: 'player',
              itemId: 'film-8-mile-main', positionSec: 300, durationSec: 6356,
              playing: true, channelBehind: !!o.behind
            }
          }));
        }
      };
      [REPLY[m.type]].filter(Boolean).forEach(function(fn) { fn(); });
    });
  });
  return { intents: intents };
}

function pressedIntents(backend) {
  return backend.intents.filter(function(m) { return m.type === 'intent'; }).map(function(m) { return m.payload; });
}

test.describe('the phone while the TV is on a channel', () => {
  test('offers the channel\'s own controls, and neither Queue nor Clear progress', async ({ page }) => {
    await installApi(page);
    await installChannelTv(page);
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('8 Mile');
    await expect(page.locator('#c-restart')).toBeVisible();
    await expect(page.locator('#c-queue')).toBeHidden();
    await expect(page.locator('#c-reset')).toBeHidden();
  });

  // The bug as the owner met it: the crumb read "On now" and took the TV to an
  // empty page. It names the channel now, and returns to the Channels TAB — the
  // screen the TV actually has for channels (TASK-563: there is no channels
  // rail-grid).
  test('the breadcrumb names the channel and returns to the Channels tab', async ({ page }) => {
    await installApi(page);
    const backend = await installChannelTv(page);
    await page.goto('/companion/video.html');
    await expect(page.locator('#breadcrumb')).toContainText('After Dark');
    await page.locator('#breadcrumb').getByText('After Dark').click();
    const navigates = pressedIntents(backend).filter(function(p) { return p.intent === 'navigate'; });
    expect(navigates.length).toBe(1);
    expect(navigates[0].params.page).toBe('browse.html');
    expect(navigates[0].params.params).toEqual({ tab: 'channels' });
  });

  // A channel has no engine behind it, so the four engine controls are dimmed
  // rather than live-looking — the same disabled-but-visible rule every rail
  // uses when it has nothing to act on (core/queue-shell-view.js).
  test('the engine transport is dead, because a channel has no queue', async ({ page }) => {
    await installApi(page);
    await installChannelTv(page);
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('8 Mile');
    await expect(page.locator('#c-prev')).toHaveClass(/single/);
    await expect(page.locator('#c-next')).toHaveClass(/single/);
    await expect(page.locator('#c-repeat')).toHaveClass(/single/);
    await expect(page.locator('#c-shuffle')).toHaveClass(/single/);
  });

  test('Restart sends the channel\'s own intent, with no confirm to get through', async ({ page }) => {
    await installApi(page);
    const backend = await installChannelTv(page);
    await page.goto('/companion/video.html');
    await expect(page.locator('#c-restart')).toBeVisible();
    await page.locator('#c-restart').click();
    expect(pressedIntents(backend).map(function(p) { return p.intent; })).toContain('channelRestart');
  });

  // Story 4 on the phone: offered while behind, gone while level — the same
  // answer the TV pill reads, carried on the 1 Hz snapshot.
  test('Back to live appears only while behind the channel', async ({ page }) => {
    await installApi(page);
    await installChannelTv(page, { behind: false });
    await page.goto('/companion/video.html');
    await expect(page.locator('#c-restart')).toBeVisible();
    await expect(page.locator('#c-live')).toBeHidden();
  });

  test('Back to live sends the rejoin when the viewer has fallen behind', async ({ page }) => {
    await installApi(page);
    const backend = await installChannelTv(page, { behind: true });
    await page.goto('/companion/video.html');
    await expect(page.locator('#c-live')).toBeVisible();
    await page.locator('#c-live').click();
    expect(pressedIntents(backend).map(function(p) { return p.intent; })).toContain('channelLive');
  });
});
