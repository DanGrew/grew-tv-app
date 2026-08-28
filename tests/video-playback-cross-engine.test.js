const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend } = require('./fixtures/api.js');

// A person may have live state on more than one engine at once — e.g. a
// browse/detail "＋ Queue" control that still posts to the OLD video engine
// (screen-home-movies-list-page.js/screen-detail-page.js's queue-video) while
// this page is driving a film source on the TASK-498 unified engine. The WS
// relay is per-PERSON, not per-page-mode, so a push from that other engine
// still reaches this page regardless of what it is actually showing. Before
// this fix, screen-video-page.js's onVideoPlayback/onMusicVideoPlayback/
// onQueuePlayback handlers applied ANY incoming snapshot unconditionally
// (isSwap + swap-in-place), so a stray push from an engine this page ISN'T
// driving hijacked the live player. Each applier now no-ops unless
// `engineMode` matches the channel it is for.
test('a stray video_playback push does not hijack an episode playing on the unified engine', async ({ page }) => {
  await installApi(page);
  // TASK-542 — bluey plays on the series engine now; the cross-engine gate this
  // proves is the same one, and a fifth engine only widens what it guards.
  await installQueuePlaybackBackend(page, 'series');

  // Capture the page's live WebSocket instance (registered AFTER the fixtures
  // above so it wraps whatever `window.WebSocket` is by the time they're done
  // installing their own routeWebSocket-backed shim, per Playwright's
  // most-recently-added-init-script-wins ordering) so the test can
  // hand-deliver a message the way a genuinely separate engine's push would
  // arrive, without disturbing the fixtures' own mocked traffic.
  await page.addInitScript(function() {
    var Native = window.WebSocket;
    function Wrapped(url, protocols) {
      var sock = protocols !== undefined ? new Native(url, protocols) : new Native(url);
      window.__grewTvTestWs = sock;
      return sock;
    }
    Wrapped.prototype = Native.prototype;
    window.WebSocket = Wrapped;
  });

  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);

  await page.evaluate(function() {
    var payload = {
      person_id: 'kids',
      now_playing: { item_id: 'beach-day', title: 'Beach Day', poster: 'beach.jpg', duration: 45, subtitles: 'beach-day.vtt', type: 'home', ext: null, itemType: 'home-movie' },
      current_item_index: 0,
      items: [],
      override_queue: [],
      source_type: null, source_id: null,
      repeat: false, shuffle: false
    };
    window.__grewTvTestWs.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'video_playback', payload: payload }) }));
  });

  // Give the (would-be) swap chain time to run if the gate were missing.
  await page.waitForTimeout(300);
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
});
