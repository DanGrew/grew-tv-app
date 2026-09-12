const { test, expect } = require('@playwright/test');
const {
  installApi,
  CHANNEL_ON_AIR: ON_AIR,
  CHANNEL_OFF_AIR_TIMED: OFF_AIR_TIMED
} = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-604 (FEAT-560) — the Guide's moved clock, ON THE TELEVISION.
//
// The deliverable: a line-up can be looked at at 20:00 without waiting until
// 20:00 to find out what it does. The arithmetic is proved in
// tests/unit/guide-clock.test.js; what this suite proves is the PAGE — that the
// control exists only where the server allows it, that a press redraws every
// channel from the moved answer, that the band stops saying NOW, that "Now"
// gives the real clock back, and that the page's own thirty-second poll carries
// the moved moment instead of dragging the page back to now.
//
// ⛔ The control is DEV ONLY. `/api/config.devClock` is the gate, and the
// fixture's own config omits the field — so every other suite in this repo
// renders the Guide with no control at all, which is the Mini's behaviour.

// What the channels read answers when a clock has been moved: a different
// programme, so "the page redrew" is visible rather than inferred.
//
// The card's own title line draws the SHOW (TASK-588 — an episode title names
// nothing on its own), so the episode SLOT is what tells the two apart on
// screen: S1 E22 live, S1 E23 moved.
const MOVED = Object.assign({}, ON_AIR, {
  item: Object.assign({}, ON_AIR.item, {
    item_id: 'bluey-s1e23', title: 'Keepy Uppy',
    series: { id: 'series-bluey', title: 'Bluey', season: 1, episode: 23 }
  }),
  offset_seconds: 60
});
const LIVE_EPISODE = /S1 E22/;
const MOVED_EPISODE = /S1 E23/;

function nowSub(page) {
  return page.locator('.guide-now[data-channel="cartoon-club"] .now-sub');
}

// Records every channels URL the page asks for AND answers the strip, so one
// helper covers both "what did it send" and "what did it draw". Same
// last-registered-wins fallback shape as tests/guide.test.js: a listing URL
// matches `**/api/channels**` too, and must reach installApi's own handler.
async function withClockedChannels(page, reads) {
  await page.route('**/api/channels**', function(route) {
    const url = new URL(route.request().url());
    reads.push(url.pathname + url.search);
    const strip = url.pathname === '/api/channels';
    const moved = url.searchParams.get('at');
    return ({
      true: function() {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({
            channels: [({ true: MOVED, false: ON_AIR })[String(!!moved)], OFF_AIR_TIMED]
          })
        });
      },
      false: function() { return route.fallback(); }
    })[String(strip)]();
  });
}

async function withDevClock(page, on) {
  await page.route('**/api/config', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ wsPort: 8766, httpsPort: 8767, contentBase: '', devClock: on })
    });
  });
}

async function openGuide(page) {
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('#btn-guide').click();
  await expect(page.locator('#screen-guide')).toBeVisible();
  await expect(page.locator('.guide-now')).toHaveCount(2);
  await expect(page.locator('.guide-day.on')).toBeVisible();
}

function stripReads(reads) {
  return reads.filter(function(url) { return url.startsWith('/api/channels?'); });
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

test.describe('where the control exists', () => {
  // Story 6 — the lounge TV. The Mini's run answers devClock false, so there is
  // nothing on the page to press and the Guide is exactly what it was.
  test('there is no control at all on a server that does not allow it', async ({ page }) => {
    const reads = [];
    await withClockedChannels(page, reads);
    await withDevClock(page, false);
    await openGuide(page);
    await expect(page.locator('#guide-clock')).toBeHidden();
    await expect(page.locator('#clock-fwd')).toBeHidden();
    expect(stripReads(reads).every(function(url) { return !url.includes('at='); })).toBe(true);
  });

  // The fixture's own /api/config carries no `devClock` key at all — an older
  // server, and the shape every other suite here runs against.
  test('an absent devClock field draws no control either', async ({ page }) => {
    const reads = [];
    await withClockedChannels(page, reads);
    await openGuide(page);
    await expect(page.locator('#guide-clock')).toBeHidden();
  });

  test('a dev run draws the pair, the Now button and a DEV CLOCK badge', async ({ page }) => {
    const reads = [];
    await withClockedChannels(page, reads);
    await withDevClock(page, true);
    await openGuide(page);
    await expect(page.locator('#guide-clock')).toBeVisible();
    await expect(page.locator('#clock-back')).toBeVisible();
    await expect(page.locator('#clock-now')).toBeVisible();
    await expect(page.locator('#clock-fwd')).toBeVisible();
    await expect(page.locator('#clock-dev')).toHaveText('DEV CLOCK');
  });

  // Story 7 — nothing pressed, nothing different. The page still reads the real
  // clock even with the control on screen.
  test('the page reads the real clock until something is pressed', async ({ page }) => {
    const reads = [];
    await withClockedChannels(page, reads);
    await withDevClock(page, true);
    await openGuide(page);
    expect(stripReads(reads).every(function(url) { return !url.includes('at='); })).toBe(true);
    await expect(page.locator('#now-tag')).toHaveText(/^NOW/);
  });
});

test.describe('moving it', () => {
  async function openDevGuide(page, reads) {
    await withClockedChannels(page, reads);
    await withDevClock(page, true);
    await openGuide(page);
  }

  // Story 1 — the whole deliverable. A press redraws every channel from the
  // answer for that moment, which the stub makes visible by naming a different
  // programme.
  test('+1hr redraws the channels from the moved answer', async ({ page }) => {
    const reads = [];
    await openDevGuide(page, reads);
    await expect(nowSub(page)).toHaveText(LIVE_EPISODE);
    await page.locator('#clock-fwd').click();
    await expect(nowSub(page)).toHaveText(MOVED_EPISODE);
  });

  test('+1hr asks the strip AND the listings for the same moved moment', async ({ page }) => {
    const reads = [];
    await openDevGuide(page, reads);
    reads.length = 0;
    await page.locator('#clock-fwd').click();
    await expect.poll(function() { return stripReads(reads).length; }).toBeGreaterThan(0);
    const moved = stripReads(reads).filter(function(url) { return url.includes('at='); });
    expect(moved.length).toBeGreaterThan(0);
    // Every channel's listing carries it too, or the bands would disagree about
    // which moment the page is showing.
    await expect.poll(function() {
      return reads.filter(function(url) { return url.includes('/schedule?'); }).length;
    }).toBeGreaterThan(0);
    expect(reads.filter(function(url) { return url.includes('/schedule?'); })
      .every(function(url) { return url.includes('at='); })).toBe(true);
  });

  // Story 1's other half: the band must not call a moved moment "now". The
  // server answers a moved question as though it were the present, so the page
  // is the only thing left that can tell the truth about which moment it is.
  test('the band says AT and its time, never NOW, while the clock is moved', async ({ page }) => {
    const reads = [];
    await openDevGuide(page, reads);
    await page.locator('#clock-fwd').click();
    await expect(page.locator('#now-tag')).toHaveText(/^AT · \d\d:\d\d$/);
  });

  // Story 3 — winding back. The step is relative to where the page is already
  // reading, so two presses back from a moved moment land an hour before it.
  test('−1hr steps back, and keeps stepping from where it already is', async ({ page }) => {
    const reads = [];
    await openDevGuide(page, reads);
    await page.locator('#clock-back').click();
    await expect(page.locator('#now-tag')).toHaveText(/^AT/);
    const first = await page.locator('#now-tag').textContent();
    await page.locator('#clock-back').click();
    await expect(page.locator('#now-tag')).not.toHaveText(first);
  });

  // Story 5 — the way back. Pressing Now drops the moment entirely: the next
  // read carries no `at=` at all, rather than an `at=` that happens to be now.
  test('Now gives the real clock back and stops sending at=', async ({ page }) => {
    const reads = [];
    await openDevGuide(page, reads);
    await page.locator('#clock-fwd').click();
    await expect(page.locator('#now-tag')).toHaveText(/^AT/);
    reads.length = 0;
    await page.locator('#clock-now').click();
    await expect(page.locator('#now-tag')).toHaveText(/^NOW/);
    await expect.poll(function() { return stripReads(reads).length; }).toBeGreaterThan(0);
    expect(stripReads(reads).every(function(url) { return !url.includes('at='); })).toBe(true);
    await expect(nowSub(page)).toHaveText(LIVE_EPISODE);
  });

  // ⛔ The page re-reads itself every thirty seconds. Without the moved moment
  // on those polls the first one drags the page back to now and the control
  // fights whoever pressed it — so the clock is faked and a poll is made to fire.
  test('the thirty-second poll carries the moved moment instead of undoing it', async ({ page }) => {
    const reads = [];
    // ⚠️ Installed BEFORE the page boots. The polls are registered in the boot
    // chain, and a clock faked after that never owns those intervals — the
    // fast-forward then moves a clock nothing is listening to and no poll fires.
    await page.clock.install();
    await openDevGuide(page, reads);
    await page.locator('#clock-fwd').click();
    await expect(page.locator('#now-tag')).toHaveText(/^AT/);
    reads.length = 0;
    await page.clock.fastForward(31000);
    await expect.poll(function() { return stripReads(reads).length; }).toBeGreaterThan(0);
    expect(stripReads(reads).every(function(url) { return url.includes('at='); })).toBe(true);
    await expect(page.locator('#now-tag')).toHaveText(/^AT/);
    await expect(nowSub(page)).toHaveText(MOVED_EPISODE);
  });
});

test.describe('reaching it from the couch', () => {
  // The buttons join the day-tabs band rather than inventing one, so ◀ ▶ walk
  // onto them and no remote key is claimed (docs/KEYMAP.md untouched).
  test('the arrow keys walk onto the clock buttons from the day tabs', async ({ page }) => {
    const reads = [];
    await withClockedChannels(page, reads);
    await withDevClock(page, true);
    await openGuide(page);
    await page.locator('.guide-day.on').focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(function() {
      return page.evaluate(function() { return document.activeElement.getAttribute('data-band'); });
    }).toBe('tabs');
    await expect.poll(function() {
      return page.evaluate(function() { return document.activeElement.id; });
    }).toMatch(/^clock-/);
  });
});
