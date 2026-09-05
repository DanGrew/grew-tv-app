const { test, expect } = require('@playwright/test');
const {
  installApi,
  channelDetailResponse,
  CHANNEL_ON_AIR: ON_AIR,
  CHANNEL_OFF_AIR_TIMED: OFF_AIR,
  CHANNEL_DETAIL: DETAIL,
  CHANNEL_DETAIL_OFF_AIR: DETAIL_OFF_AIR
} = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// FEAT-560/TASK-564 — watching a channel looks like watching a channel. The
// arithmetic underneath is proved in tests/unit/channel-player.test.js; this is
// the chrome existing on the real player: which channel you are on, where the
// channel is versus where you are, the way back, and the rocker flipping.
//
// The channel lines come from tests/fixtures/api.js, where the stub<->contract
// shape gate can see them (TASK-326) — a line written inline here would drift
// off the backend with nothing to notice.

// ⚠️ The media stub serves an EMPTY body, so a real <video> here never reaches
// `loadedmetadata`: duration stays NaN and currentTime stays 0 whatever the
// player does. Every story in this row is about the gap between the viewer's
// position and the channel's, so a playhead that cannot move would leave the
// interesting half untestable — and worse, would make "level with the channel"
// impossible to distinguish from "stuck at zero".
//
// So the element's position is faked at the PROTOTYPE, before any page script
// runs: readyState/duration are answered as a loaded 8-minute file, and
// currentTime reads and writes a value the test can also set directly
// (`atPosition`). The player's own seeks land in `__seeks`, which is how "tuned
// in from where the channel had got to" is provable at all.
async function fakeMedia(page) {
  await page.addInitScript(() => {
    window.__seeks = [];
    window.__pos = 0;
    const proto = HTMLMediaElement.prototype;
    Object.defineProperty(proto, 'readyState', { configurable: true, get() { return 1; } });
    Object.defineProperty(proto, 'duration', { configurable: true, get() { return 480; } });
    Object.defineProperty(proto, 'currentTime', {
      configurable: true,
      get() { return window.__pos; },
      set(value) { window.__seeks.push(value); window.__pos = value; }
    });
    proto.play = function() { return Promise.resolve(); };
    proto.pause = function() {};
  });
}

// Put the viewer at a position of the test's choosing, without going through
// the player — the "where am I versus the channel" half of every story below.
async function atPosition(page, seconds) {
  await page.evaluate(function(s) { window.__pos = s; }, seconds);
}

// The player asks /api/channels/{id}. The strip route installApi registers
// (`**/api/channels**`) matches that URL too, so the detail override has to be
// registered AFTER it to win (Playwright: last match first).
async function withStrip(page, channels) {
  await page.route('**/api/channels**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ channels: channels })
    });
  });
}

async function withChannel(page, detail) {
  await page.route('**/api/channels/*', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(detail)
    });
  });
}

// The phone's rail into the TV. installApi's own socket answers the person
// handshake the profile picker waits on, so this one answers it too — it
// REPLACES that route (Playwright matches most-recent-first) rather than sitting
// beside it — and hands back a function that delivers an intent on demand, which
// is how a press on the phone is reproduced here without a second page.
async function intentRail(page) {
  var sockets = [];
  await page.routeWebSocket(/:8766/, function(ws) {
    sockets.push(ws);
    ws.onMessage(function(raw) {
      var m = JSON.parse(raw);
      [m].filter(function(msg) { return msg.type === 'activate_person' && msg.payload.person_id; })
        .forEach(function(msg) {
          ws.send(JSON.stringify({ type: 'person_active', payload: { person_id: msg.payload.person_id, device_id: msg.payload.device_id } }));
        });
    });
  });
  return function deliver(intent) {
    sockets.forEach(function(ws) {
      ws.send(JSON.stringify({ type: 'intent', payload: { intent: intent } }));
    });
  };
}

async function openChannel(page, id) {
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  // Let the profile pick finish landing on browse before navigating again —
  // going straight to the player interrupts that navigation (TASK-329's
  // settle-signal discipline).
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.goto('/app/homeview/video.html?channel=' + id);
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#channel-ident')).toBeVisible();
}

test.describe('tuned into a channel', () => {
  test.beforeEach(async ({ page }) => {
    await fakeMedia(page);
    await installApi(page);
    await withStrip(page, [ON_AIR, OFF_AIR]);
    await withChannel(page, DETAIL);
  });

  // Story 1 — which channel, in the top-LEFT corner, because #device-badge owns
  // top-right on this page.
  test('the channel names itself in the top-left corner', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await expect(page.locator('#channel-ident')).toHaveText('Cartoon Club');

    const ident = await page.locator('#channel-ident').boundingBox();
    const badge = await page.locator('#device-badge').boundingBox();
    expect(ident.x).toBeLessThan(badge.x);
  });

  // Tuning in means joining WHERE THE CHANNEL IS. Starting the item from the top
  // would be a queue, not a channel.
  test('plays what is on, from where the channel has got to', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e22/);
    const seeks = await page.evaluate(() => window.__seeks);
    expect(seeks.length).toBeGreaterThan(0);
    // 120s into a 480s entry, ticking on from there — never 0.
    expect(seeks[0]).toBeGreaterThanOrEqual(120);
    expect(seeks[0]).toBeLessThan(150);
  });

  // Story 6 — up next reads the SCHEDULE, not a queue.
  test('up next is the next thing the schedule plays', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await expect(page.locator('#video-upnext')).toHaveText('Up next: Hey Duggee');
  });

  // Story 2 — the marker on the existing 5px bar, at the CHANNEL's position.
  test('the live marker sits on the bar at the channel position', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await expect(page.locator('#controls')).toHaveClass(/channel-mode/);
    const marker = page.locator('#live-marker');
    await expect(marker).toBeVisible();
    // 120s of 480s, ticking on from there.
    const left = parseFloat(await marker.evaluate(el => el.style.left));
    expect(left).toBeGreaterThanOrEqual(25);
    expect(left).toBeLessThan(30);
  });

  // Story 3 — the marker walks on its own, because the channel does. It is wrong
  // within a minute of paint if it doesn't.
  test('the marker moves without reloading, because the channel does', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    const marker = page.locator('#live-marker');
    const before = await marker.evaluate(el => el.style.left);
    await expect.poll(async () => marker.evaluate(el => el.style.left), { timeout: 5000 })
      .not.toBe(before);
  });

  // Story 4, first half — level with the channel, no way back is offered.
  test('there is no Back to live while level with the channel', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await atPosition(page, 300);
    await expect(page.locator('#btn-live')).toBeHidden();
  });

  // Stories 3 and 4 — Restart puts the viewer behind, the marker and the
  // playhead separate, and being behind is what Back to live is FOR.
  test('Restart drops behind the channel and offers the way back', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await atPosition(page, 300);
    await expect(page.locator('#btn-restart')).toBeVisible();
    await page.locator('#btn-restart').click();

    expect(await page.evaluate(() => window.__pos)).toBe(0);
    await expect(page.locator('#btn-live')).toBeVisible();
    // The playhead is back at the start; the marker is still out at the
    // channel's own position. Separated, which is the model in one glyph.
    // (The fill repaints on `timeupdate`, which a real element fires constantly
    // and the faked one only when asked.)
    await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('timeupdate')));
    const fill = parseFloat(await page.locator('#progress-fill').evaluate(el => el.style.width));
    const marker = parseFloat(await page.locator('#live-marker').evaluate(el => el.style.left));
    expect(marker).toBeGreaterThan(fill);
  });

  // ⚠️ Restart does NOT pause the channel (decision 11) — it moves the viewer
  // and nothing else. If it moved the channel too, the marker would come back
  // to the playhead and the whole model would be a queue that waits.
  test('Restart does not move the channel', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    const before = parseFloat(await page.locator('#live-marker').evaluate(el => el.style.left));
    await page.locator('#btn-restart').click();
    const after = parseFloat(await page.locator('#live-marker').evaluate(el => el.style.left));
    expect(after).toBeGreaterThanOrEqual(before);
  });

  // Story 4, second half — the way back, taken.
  test('Back to live rejoins the channel and stands down', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await page.locator('#btn-restart').click();
    await expect(page.locator('#btn-live')).toBeVisible();
    await page.locator('#btn-live').click();
    await expect.poll(async () => page.evaluate(() => window.__pos), { timeout: 5000 })
      .toBeGreaterThanOrEqual(120);
    await expect(page.locator('#btn-live')).toBeHidden();
  });

  // Story 8 — Restart and the progress-clearing control must not read as two
  // words for the same thing. Clear progress is not even offered here: a
  // channel play records nothing, so there is nothing of it to clear.
  test('Restart cannot be confused with clearing progress', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await expect(page.locator('#btn-restart')).toHaveText('Restart');
    await expect(page.locator('#btn-clear-progress')).toBeHidden();
    await expect(page.locator('#btn-queue')).toBeHidden();
  });

  // Decision 16 — a channel play records NOTHING. No position, no completion,
  // so Continue Watching never picks up a tune-in fragment and a deliberate
  // resume position in the same item is never clobbered.
  test('watching a channel writes no watch progress', async ({ page }) => {
    const writes = [];
    page.on('request', function(req) {
      [req].filter(r => r.url().includes('/api/progress/')).filter(r => r.method() === 'POST')
        .forEach(r => writes.push(r.url()));
    });
    await openChannel(page, 'cartoon-club');
    await atPosition(page, 300);
    await page.evaluate(() => {
      const v = document.getElementById('video');
      v.dispatchEvent(new Event('timeupdate'));
      v.dispatchEvent(new Event('ended'));
    });
    await page.waitForTimeout(200);
    expect(writes).toEqual([]);
  });

  // Decision 16's other half, found in use: the phone's Clear progress was still
  // live while the TV was on a channel, and pressing it cleared the on-air
  // item's real watch progress and dropped the TV out of the channel for it. The
  // phone hides the button in channel mode now (tests/companion-channel.test.js)
  // and the intent itself is inert here, which is what makes a page that
  // connected before the tune-in harmless.
  test('a Clear progress press from a phone neither clears nor leaves the channel', async ({ page }) => {
    const deletes = [];
    page.on('request', function(req) {
      [req].filter(r => r.url().includes('/api/progress/')).filter(r => r.method() === 'DELETE')
        .forEach(r => deletes.push(r.url()));
    });
    const deliver = await intentRail(page);
    await openChannel(page, 'cartoon-club');
    deliver('reset');
    await page.waitForTimeout(300);
    expect(deletes).toEqual([]);
    await expect(page.locator('#channel-ident')).toHaveText('Cartoon Club');
    await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e22/);
  });

  // The phone's own Restart and Back to live, which drive the TV's — the mirror
  // of the two pills, over the intent rail (the row's own controls are proved on
  // the phone in tests/companion-channel.test.js).
  test('the phone\'s Restart and Back to live drive the channel player', async ({ page }) => {
    const deliver = await intentRail(page);
    await openChannel(page, 'cartoon-club');
    await atPosition(page, 300);
    deliver('channelRestart');
    await expect.poll(async () => page.evaluate(() => window.__pos), { timeout: 5000 }).toBe(0);
    deliver('channelLive');
    await expect.poll(async () => page.evaluate(() => window.__pos), { timeout: 5000 })
      .toBeGreaterThanOrEqual(120);
  });

  // Story 5 — the channel does not wait. Finishing the item asks what is on NOW
  // and joins that, which is what makes restarting cost you the difference.
  test('the end of the item rejoins wherever the channel has got to', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e22/);
    // The channel has moved on to the next programme entry by the time the
    // restarted item ends.
    await withChannel(page, channelDetailResponse(Object.assign({}, ON_AIR, {
      item: { item_id: 'duggee-s1e04', title: 'Hey Duggee', poster: null, itemType: 'episode', ext: 'mp4', subtitles: null },
      offset_seconds: 40, runtime_seconds: 420
    })));
    await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
    await expect(page.locator('#video')).toHaveAttribute('src', /duggee-s1e04/);
  });

  // Story 7 — the volume rocker flips channels (decision 15). `=` up, `-` down,
  // and no other handset button is claimed by this row.
  test('Volume + moves to the next channel', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await page.keyboard.press('=');
    await expect(page).toHaveURL(/channel=after-dark/);
  });

  test('Volume − wraps back round the strip, so the press always moves', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await page.keyboard.press('-');
    await expect(page).toHaveURL(/channel=after-dark/);
  });
});

test.describe('a channel with nothing on', () => {
  test.beforeEach(async ({ page }) => {
    await fakeMedia(page);
    await installApi(page);
    await withStrip(page, [ON_AIR, OFF_AIR]);
  });

  // The player never sits on a black screen. Browse refuses to open an off-air
  // card at all (below), so this is the race — a channel that went off air in
  // the thirty seconds since its card was drawn — and the end of the night.
  test('an off-air channel returns to the Channels tab', async ({ page }) => {
    await withChannel(page, DETAIL_OFF_AIR);
    await page.goto('/app/homeview/profile.html');
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
    await page.goto('/app/homeview/video.html?channel=after-dark');
    await expect(page).toHaveURL(/browse\.html\?tab=channels/);
  });

  // A channel nobody wrote, or one this profile may not see — one refusal on
  // the wire, and the existing "can't reach it" page rather than a dead player.
  test('a channel the backend will not serve lands on the error screen', async ({ page }) => {
    await page.route('**/api/channels/*', function(route) {
      return route.fulfill({
        status: 404, contentType: 'application/json',
        body: JSON.stringify({ error: 'channel not found: nobody-wrote-this' })
      });
    });
    await page.goto('/app/homeview/profile.html');
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
    await page.goto('/app/homeview/video.html?channel=nobody-wrote-this');
    await expect(page).toHaveURL(/error\.html/);
  });
});

test.describe('getting into the player from browse', () => {
  test.beforeEach(async ({ page }) => {
    await fakeMedia(page);
    await installApi(page);
    await withStrip(page, [ON_AIR, OFF_AIR]);
    await withChannel(page, DETAIL);
    await page.goto('/app/homeview/profile.html');
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
  });

  // TASK-563 left this card deliberately inert; TASK-564 is what it was waiting
  // for.
  test('picking an on-air channel card opens the player on it', async ({ page }) => {
    await page.locator('.channel-tile[data-channel="cartoon-club"]').click();
    await expect(page).toHaveURL(/video\.html\?.*channel=cartoon-club/);
    await expect(page.locator('#channel-ident')).toHaveText('Cartoon Club');
  });

  // An off-air card has nothing to play and already says so, along with when it
  // is back. A press that opened a player only to bounce straight out would be
  // strictly worse than one that stays put.
  test('picking an off-air channel card stays on browse', async ({ page }) => {
    await page.locator('.channel-tile[data-channel="after-dark"]').click();
    await expect(page.locator('#screen-browse')).toBeVisible();
    await expect(page).toHaveURL(/browse\.html/);
  });
});
