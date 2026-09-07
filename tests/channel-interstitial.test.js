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

// FEAT-560/TASK-565 + TASK-574 — the gap between items, on the real player. The
// card's own model is proved in tests/unit/channel-card.js; this is it on
// screen: the card going up when an item ends, coming down when the next
// programme actually starts, and an off-air channel holding on the same card.
//
// ⚠️ THE CLOCK IS FAKED, DELIBERATELY. The hold is eight seconds at its
// shortest and a whole slot at its longest, so a test that waited would be slow
// where it worked at all. `page.clock` (the idiom tests/audio-resume.test.js
// already uses) makes it exact.
//
// TASK-574 took the music bed out — the card is SILENT and that is the intended
// state, so there is nothing here about a bed, a credit or an <audio> element,
// and a session finding a static, silent panel has not found a defect.
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
      set(value) {
        window.__seeks.push(value);
        window.__pos = value;
      }
    });
    proto.play = function() { return Promise.resolve(); };
    proto.pause = function() {};
  });
}

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

// How many times the player has asked the channel WHAT IS ON — the detail route
// (`/api/channels/<id>?…`), never the strip's own `/api/channels?…`.
//
// It is the defect stated directly: dropping the viewer back into the item that
// just ended is what asking too early looks like on screen, and the ask is the
// thing that is either there or not. Counted from the moment it is armed, so a
// test arms it after the tune-in and reads a clean zero.
function countChannelAsks(page) {
  var asks = { n: 0 };
  page.on('request', function(req) {
    asks.n += /\/api\/channels\/[^/?]+\?/.test(req.url()) ? 1 : 0;
  });
  return asks;
}

async function openChannel(page, id) {
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.goto('/app/homeview/video.html?channel=' + id);
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#channel-ident')).toBeVisible();
}

// The item the viewer is watching running out — the moment the gap opens.
async function endItem(page) {
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
}

// The channel, one programme further on — what the endpoint answers by the time
// the card clears, because the schedule ran while it was up.
const ROLLED_ON = channelDetailResponse(Object.assign({}, ON_AIR, {
  item: { item_id: 'duggee-s1e04', title: 'Hey Duggee', poster: null, itemType: 'episode', ext: 'mp4', subtitles: null },
  offset_seconds: 8, runtime_seconds: 420
}));

// ⚠️ THE TWO WAYS AN ITEM ENDS, and TASK-574 is the difference between them.
//
// ON SCHEDULE — the channel has reached the end of the slot, so the next
// programme is already airing and the card holds for the eight-second floor
// alone. Nothing dispatches `ended` for this one: the channel's own entry
// finishing is what puts the card up (core/channel-player.js shouldRetune),
// which is the path a viewer sitting through a programme actually takes.
const ON_SCHEDULE = channelDetailResponse(Object.assign({}, ON_AIR, {
  offset_seconds: 480, runtime_seconds: 480
}));
// EARLY — the shipping fixture: the channel is 120s into an eight-minute slot,
// so a file that ends here leaves SIX MINUTES of that slot still to air. The old
// card cleared after eight seconds and rejoined into the middle of the item that
// had just finished; the hold now runs to the end of the slot.
const EARLY_REMAINING_MS = (480 - 120) * 1000;

test.describe('the gap between two items', () => {
  test.beforeEach(async ({ page }) => {
    await fakeMedia(page);
    await installApi(page);
    await withStrip(page, [ON_AIR, OFF_AIR]);
    await withChannel(page, DETAIL);
  });

  // Story 1 — an item ending is a moment of broadcast, not a black screen.
  test('an item ending puts a card up, and the next programme takes it down', async ({ page }) => {
    await withChannel(page, ON_SCHEDULE);
    await openChannel(page, 'cartoon-club');

    // The channel reaching the end of its own slot is what raises the card here
    // — no `ended` is dispatched, because a programme running out on time is the
    // path a viewer who simply sat through it takes.
    await page.clock.install();
    await withChannel(page, ROLLED_ON);
    await page.clock.fastForward(1000);
    await expect(page.locator('#channel-card')).toBeVisible();

    // Nothing to wait for — the schedule has already rolled on, so the floor is
    // the whole hold and the rejoin lands in a programme already running.
    await page.clock.fastForward(8000);
    await expect(page.locator('#channel-card')).toBeHidden();
    await expect(page.locator('#video')).toHaveAttribute('src', /duggee-s1e04/);
  });

  // ⚠️ THE CHANNEL RUNS THROUGH THE CARD. The rejoin asks what is on NOW rather
  // than starting the next item from zero — a card that held the schedule would
  // make the channel a queue that waits.
  test('the programme behind the card was already running when it cleared', async ({ page }) => {
    await withChannel(page, ON_SCHEDULE);
    await openChannel(page, 'cartoon-club');
    await page.clock.install();
    await withChannel(page, ROLLED_ON);
    // Two hops, not one: the first raises the card (and arms the hold), the
    // second runs the hold out. A single jump past both leaves the rejoin's own
    // fetch with no turn to settle in.
    await page.clock.fastForward(1000);
    await expect(page.locator('#channel-card')).toBeVisible();
    await page.clock.fastForward(8000);
    await expect(page.locator('#video')).toHaveAttribute('src', /duggee-s1e04/);
    const seeks = await page.evaluate(() => window.__seeks);
    expect(seeks[seeks.length - 1]).toBeGreaterThanOrEqual(8);
  });

  // ⭐ TASK-574 story 1 — THE DEFECT THIS ROW EXISTS FOR. The viewer skipped, or
  // the file was shorter than the slot it was given, so the channel is STILL
  // AIRING the item that just ended. The old card cleared after eight seconds
  // and asked what was on now — and was told the very item that had finished, so
  // the viewer was dropped back into the middle of it.
  test('an item ending EARLY holds the card past the eight seconds', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    const asks = countChannelAsks(page);
    await page.clock.install();
    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();

    // Where the old behaviour cleared. Six minutes of the slot are still to air,
    // so the player has not asked the channel what is on — asking here is what
    // dropped the viewer into the middle of the item that had just finished,
    // because that is what the channel would have answered.
    //
    // ⚠️ A REAL moment, not a faked one. `fastForward` returns with the rejoin's
    // own fetch still in flight, so every assertion made at that instant passes
    // whatever the hold does; this lets the request the old code would have sent
    // actually land, and the card come down, before anything is claimed.
    await page.clock.fastForward(8000);
    await page.waitForTimeout(250);
    expect(asks.n).toBe(0);
    await expect(page.locator('#channel-card')).toBeVisible();
    await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e22/);

    // Still up most of the way through, not merely a longer fixed wait.
    await page.clock.fastForward(EARLY_REMAINING_MS - 60000);
    await page.waitForTimeout(250);
    expect(asks.n).toBe(0);
    await expect(page.locator('#channel-card')).toBeVisible();
  });

  // The other half of the same story: the hold ENDS, at the next programme.
  test('the card comes down when the next programme actually starts', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await page.clock.install();
    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();

    await withChannel(page, ROLLED_ON);
    await page.clock.fastForward(EARLY_REMAINING_MS + 30000);
    await expect(page.locator('#channel-card')).toBeHidden();
    await expect(page.locator('#video')).toHaveAttribute('src', /duggee-s1e04/);
  });

  // Story 2 — a hold that can run for minutes has to be leaveable, and it is
  // leaveable the same way any play is.
  test('Back leaves the channel from a long hold', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await page.clock.install();
    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();
    await page.clock.fastForward(60000);

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/browse\.html\?tab=channels/);
  });

  // Story 3 — the card is SILENT. TASK-565 played a music bed under it and
  // credited the track bottom-right; no channel ever named an album, so it
  // shipped without playing a note and TASK-574 took it out rather than leave it
  // dormant. A card that is a static, silent panel is the intended state.
  test('the card is silent — no bed, no credit', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();

    expect(await page.locator('#channel-bed').count()).toBe(0);
    expect(await page.locator('#card-credit').count()).toBe(0);
  });

  // Story 2 — three things coming with clock times, then a shorter untimed list.
  test('the card names three things with times, then what is on later', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();

    await expect(page.locator('#card-rows .card-time')).toHaveText(['17:08', '17:15', '17:22']);
    // TASK-588 gave the fixture the episode titles a manifest actually holds
    // ("The Tidying Up Badge", not "Hey Duggee") and the show beside them. This
    // card still draws the episode alone — it was not in that task's two
    // surfaces — so what it names is unchanged in kind, only more honest.
    await expect(page.locator('#card-rows .card-title')).toHaveText(['The Tidying Up Badge', 'Bob Bilby', 'Neighbours']);
    await expect(page.locator('#card-later')).toHaveText('The Magic Xylophone · Keepy Uppy · Daddy Robot · Shadowlands');
    await expect(page.locator('#card-label')).toHaveText('Cartoon Club');
  });

  // ⚠️ THE ASYMMETRY IS THE DESIGN (decision 12). Times invite waiting for
  // something; an untimed list just says come back later. It reads like a
  // formatting detail and is the thing most likely to be "tidied up" later.
  test('the later list carries no times, and the timed lines carry three', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();
    await expect(page.locator('#card-rows .card-time')).toHaveCount(3);
    await expect(page.locator('#card-later')).not.toContainText(':');
  });

});

test.describe('a channel that is off air', () => {
  test.beforeEach(async ({ page }) => {
    await fakeMedia(page);
    await installApi(page);
    await withStrip(page, [ON_AIR, OFF_AIR]);
  });

  // Story 5 — the SAME card shape, naming when the channel is back. TASK-563
  // draws it on the strip; this is the player's own caller (decision 8).
  test('holds on the card and names when it is back', async ({ page }) => {
    await withChannel(page, DETAIL_OFF_AIR);
    await openChannel(page, 'after-dark');

    await expect(page.locator('#channel-card')).toBeVisible();
    await expect(page.locator('#card-headline')).toHaveText('Off air');
    await expect(page.locator('#card-return')).toHaveText('Back at 21:00');
    // It HOLDS — it does not bounce the viewer back to browse from under them.
    await expect(page).toHaveURL(/video\.html/);
  });

  // ⚠️ The return time comes from the ENDPOINT, never the slot config (owner,
  // 2026-09-03): a slot whose pool was empty at generation airs nothing, so the
  // config would promise a return the channel never makes.
  test('says off air and nothing else when there is no time to name', async ({ page }) => {
    await withChannel(page, Object.assign({}, DETAIL_OFF_AIR, { next_on_air: null }));
    await openChannel(page, 'after-dark');

    await expect(page.locator('#card-headline')).toHaveText('Off air');
    await expect(page.locator('#card-return')).toBeHidden();
  });

  // Nothing coming means nothing to list — a timed line here would be a promise
  // the card cannot keep.
  test('lists nothing coming', async ({ page }) => {
    await withChannel(page, DETAIL_OFF_AIR);
    await openChannel(page, 'after-dark');
    await expect(page.locator('#card-rows .card-time')).toHaveCount(0);
    await expect(page.locator('#card-later-block')).toBeHidden();
  });

  // The hold is not a dead end: the channel coming back tunes itself in, which
  // is the only thing on this screen that waits on a poll rather than an event.
  test('tunes itself in when the channel comes back', async ({ page }) => {
    await withChannel(page, DETAIL_OFF_AIR);
    // ⚠️ The clock goes in BEFORE the player loads. The poll is a `setInterval`
    // armed at page init, and Playwright's clock only fakes timers created after
    // it is installed — installed afterwards, this test would sit through the
    // real thirty seconds and then fail anyway. Every other test here fakes a
    // `setTimeout` the card itself creates, which is why they install later.
    await page.goto('/app/homeview/profile.html');
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
    await page.clock.install();
    await page.goto('/app/homeview/video.html?channel=after-dark');
    await expect(page.locator('#channel-card')).toBeVisible();

    await withChannel(page, DETAIL);
    await page.clock.fastForward(30000);

    await expect(page.locator('#channel-card')).toBeHidden();
    await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e22/);
  });

  // A hold has to be leaveable, and it is leaveable the same way any play is.
  test('Back leaves the hold for the Channels tab', async ({ page }) => {
    await withChannel(page, DETAIL_OFF_AIR);
    await openChannel(page, 'after-dark');
    await expect(page.locator('#channel-card')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/browse\.html\?tab=channels/);
  });

  // A programme running out mid-watch arrives at exactly the same card as a
  // channel that was off air when it was opened — one state, never three.
  //
  // The file ends early here, so the between-items card holds out the rest of
  // the slot before the rejoin discovers the channel has gone off air under it
  // (TASK-574) — and what it lands on is the same card, one state further on.
  test('a programme running out under the viewer lands on the same card', async ({ page }) => {
    await withChannel(page, DETAIL);
    await openChannel(page, 'cartoon-club');
    await page.clock.install();

    await withChannel(page, Object.assign({}, DETAIL_OFF_AIR, { next_on_air: null }));
    await endItem(page);
    await page.clock.fastForward(EARLY_REMAINING_MS + 30000);

    await expect(page.locator('#card-headline')).toHaveText('Off air');
    await expect(page.locator('#card-return')).toBeHidden();
    await expect(page).toHaveURL(/video\.html/);
  });
});
