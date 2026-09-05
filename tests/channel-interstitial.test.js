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

// FEAT-560/TASK-565 — the gap between items, on the real player. The card's own
// model is proved in tests/unit/channel-card.js and the bed's clock in
// tests/unit/channel-bed.js; this is the two of them on screen: the card going
// up when an item ends and coming down when the next one starts, an off-air
// channel holding on the same card, and the bed carrying on across two cards
// instead of restarting.
//
// ⚠️ THE CLOCK IS FAKED, DELIBERATELY. The card holds for eight seconds and the
// bed's position is a function of wall-clock time, so a test that waited would
// be both slow and — for the bed — non-deterministic, since the album loops and
// a run straddling the loop point would read a smaller number than the one
// before it. `page.clock` (the idiom tests/audio-resume.test.js already uses)
// makes both exact.

// The bed and the video are BOTH <audio>/<video> off one prototype, so a single
// faked currentTime would have them share a playhead — and every assertion below
// about "the bed carried on" would actually be reading the video's position.
// Keyed by element id, so the two move independently.
async function fakeMedia(page) {
  await page.addInitScript(() => {
    window.__seeks = [];
    window.__pos = 0;
    window.__bedPos = 0;
    const proto = HTMLMediaElement.prototype;
    Object.defineProperty(proto, 'readyState', { configurable: true, get() { return 1; } });
    Object.defineProperty(proto, 'duration', { configurable: true, get() { return 480; } });
    Object.defineProperty(proto, 'currentTime', {
      configurable: true,
      get() { return this.id === 'channel-bed' ? window.__bedPos : window.__pos; },
      set(value) {
        if (this.id === 'channel-bed') { window.__bedPos = value; return; }
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

// The bed's seek only lands once the element reports metadata, and the stubbed
// /media/ body never gets there on its own — so the test says it did, the same
// way the player suite dispatches `timeupdate` on the video.
async function landBed(page) {
  await page.evaluate(() => document.getElementById('channel-bed').dispatchEvent(new Event('loadedmetadata')));
}

// Where the BED has got to, as one number along the whole album — so "it carried
// on" can be asserted across a track boundary. The offsets are the fixture
// album's own running order (ootb: 227 + 245 + 228 = 700s), not a second copy of
// the module's arithmetic.
const ALBUM_STARTS = { 'ootb-01': 0, 'ootb-02': 227, 'ootb-03': 472 };
const ALBUM_TOTAL = 700;
async function albumPosition(page) {
  const src = await page.locator('#channel-bed').getAttribute('src');
  const pos = await page.evaluate(() => window.__bedPos);
  return ALBUM_STARTS[src.match(/ootb-0\d/)[0]] + pos;
}

// The channel, one programme further on — what the endpoint answers by the time
// the card clears, because the schedule ran while it was up.
const ROLLED_ON = channelDetailResponse(Object.assign({}, ON_AIR, {
  item: { item_id: 'duggee-s1e04', title: 'Hey Duggee', poster: null, itemType: 'episode', ext: 'mp4', subtitles: null },
  offset_seconds: 8, runtime_seconds: 420
}));

test.describe('the gap between two items', () => {
  test.beforeEach(async ({ page }) => {
    await fakeMedia(page);
    await installApi(page);
    await withStrip(page, [ON_AIR, OFF_AIR]);
    await withChannel(page, DETAIL);
  });

  // Story 1 — an item ending is a moment of broadcast, not a black screen.
  test('an item ending puts a card up, and the next programme takes it down', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await expect(page.locator('#channel-card')).toBeHidden();

    await page.clock.install();
    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();

    // The schedule has rolled on while the card was up — which is the point:
    // nothing paused, so the rejoin lands in a programme already running.
    await withChannel(page, ROLLED_ON);
    await page.clock.fastForward(8000);
    await expect(page.locator('#channel-card')).toBeHidden();
    await expect(page.locator('#video')).toHaveAttribute('src', /duggee-s1e04/);
  });

  // ⚠️ THE CHANNEL RUNS THROUGH THE CARD. The rejoin asks what is on NOW rather
  // than starting the next item from zero — a card that held the schedule would
  // make the channel a queue that waits.
  test('the programme behind the card was already running when it cleared', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await page.clock.install();
    await endItem(page);
    await withChannel(page, ROLLED_ON);
    await page.clock.fastForward(8000);
    await expect(page.locator('#video')).toHaveAttribute('src', /duggee-s1e04/);
    const seeks = await page.evaluate(() => window.__seeks);
    expect(seeks[seeks.length - 1]).toBeGreaterThanOrEqual(8);
  });

  // Story 2 — three things coming with clock times, then a shorter untimed list.
  test('the card names three things with times, then what is on later', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();

    await expect(page.locator('#card-rows .card-time')).toHaveText(['17:08', '17:15', '17:22']);
    await expect(page.locator('#card-rows .card-title')).toHaveText(['Hey Duggee', 'Bob Bilby', 'Neighbours']);
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

  // Story 3 — the bed is playing anyway, and "what's this song" is a real
  // question, so the answer is in the corner.
  test('the card plays the channel bed and credits the track by name', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await endItem(page);
    await expect(page.locator('#card-credit')).toBeVisible();

    const src = await page.locator('#channel-bed').getAttribute('src');
    expect(src).toMatch(/\/media\/ootb-0\d\.m4a$/);
    const TITLES = { 'ootb-01': 'Turn to Stone', 'ootb-02': 'Mr. Blue Sky', 'ootb-03': 'Sweet Talkin Woman' };
    await expect(page.locator('#card-credit')).toHaveText('♪ ' + TITLES[src.match(/ootb-0\d/)[0]] + ' · ELO');
  });

  // Story 4 — THE one that cannot be seen in a screenshot. A bed restarted per
  // card plays the first eight seconds of the same track forever, which is the
  // jingle problem in disguise; it runs on its own wall clock instead.
  test('a second card carries the bed on rather than restarting it', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await page.clock.install();

    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();
    await landBed(page);
    const first = await albumPosition(page);

    // The card clears into a programme, which runs for seven minutes and ends.
    await withChannel(page, ROLLED_ON);
    await page.clock.fastForward(8000);
    await expect(page.locator('#channel-card')).toBeHidden();
    await page.clock.fastForward(420000);
    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();
    await landBed(page);
    const second = await albumPosition(page);

    // 8s of card plus 7 minutes of programme, further into the album — modulo
    // the album, so a run that crosses the loop point reads the same.
    expect(((second - first) % ALBUM_TOTAL + ALBUM_TOTAL) % ALBUM_TOTAL).toBeCloseTo(428, 0);
    // And, explicitly: not back at the beginning.
    expect(second).not.toBe(0);
  });

  // The bed is for cards and dead air, not for playing under the programme.
  test('the bed stops when the card does', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await page.clock.install();
    await endItem(page);
    await expect(page.locator('#card-credit')).toBeVisible();
    await withChannel(page, ROLLED_ON);
    await page.clock.fastForward(8000);
    await expect(page.locator('#channel-card')).toBeHidden();
    await expect(page.locator('#card-credit')).toBeHidden();
  });
});

test.describe('a channel with no bed', () => {
  test.beforeEach(async ({ page }) => {
    await fakeMedia(page);
    await installApi(page);
    await withStrip(page, [ON_AIR, OFF_AIR]);
    // A channel may name an album as its bed; one that names none is legal.
    await withChannel(page, Object.assign({}, DETAIL, { bed: null }));
  });

  test('still shows the card, silently and with no credit', async ({ page }) => {
    await openChannel(page, 'cartoon-club');
    await endItem(page);
    await expect(page.locator('#channel-card')).toBeVisible();
    await expect(page.locator('#card-rows .card-title')).toHaveText(['Hey Duggee', 'Bob Bilby', 'Neighbours']);
    await expect(page.locator('#card-credit')).toBeHidden();
    expect(await page.locator('#channel-bed').getAttribute('src')).toBe(null);
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
  test('a programme running out under the viewer lands on the same card', async ({ page }) => {
    await withChannel(page, DETAIL);
    await openChannel(page, 'cartoon-club');
    await page.clock.install();

    await withChannel(page, Object.assign({}, DETAIL_OFF_AIR, { next_on_air: null }));
    await endItem(page);
    await page.clock.fastForward(8000);

    await expect(page.locator('#card-headline')).toHaveText('Off air');
    await expect(page.locator('#card-return')).toBeHidden();
    await expect(page).toHaveURL(/video\.html/);
  });
});
