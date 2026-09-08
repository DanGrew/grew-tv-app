const { test, expect } = require('@playwright/test');
const {
  installApi,
  CHANNEL_ON_AIR: ON_AIR,
  CHANNEL_OFF_AIR_TIMED: OFF_AIR_TIMED,
  CHANNEL_OFF_AIR_PLAIN: OFF_AIR_PLAIN
} = require('./fixtures/api.js');

// FEAT-560/TASK-590 — the Guide on the PHONE (FEAT-017/028 mirror invariant).
//
// Story 8: "when I open the Guide on my phone, I see what the TV shows". So this
// suite asserts the same facts tests/guide.test.js asserts of the television —
// the same channels, the same on-now cards, the same rows, the same tail — off
// the same core model. What is deliberately NOT the same is the shape: the TV
// puts its columns side by side, and the phone stacks them.
//
// The phone drives, so an on-now card sends the TV into that channel rather than
// navigating itself, and it greys out while desynced like every other control
// that moves the television. Reading is untouched by the mode.

// The strip route, with the listing handed back to installApi's own handler —
// Playwright matches the last-registered route first, and `**/api/channels**`
// matches a listing URL too.
async function withChannels(page, channels) {
  await page.route('**/api/channels**', function(route) {
    const strip = new URL(route.request().url()).pathname === '/api/channels';
    return ({
      true: function() {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ channels: channels })
        });
      },
      false: function() { return route.fallback(); }
    })[String(strip)]();
  });
}

// The TV, as far as this page is concerned: a profile on the app_state snapshot
// (which is what decides the channels it may see at all) and somewhere to send
// an intent. No engine — a channel has none.
// `screen` is what the TV says it is on. The phone follows the TV's context, so
// a test that wants to stay on the companion's BROWSE page has to say the TV is
// on browse — otherwise the snapshot walks the phone straight to its Guide,
// which is exactly the behaviour every other test here wants.
async function installTv(page, screen) {
  const context = screen || 'guide';
  const intents = [];
  await page.routeWebSocket(/:8766/, function(ws) {
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      intents.push(m);
      const REPLY = {
        list_devices: function() {
          ws.send(JSON.stringify({ type: 'devices', payload: { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] } }));
        },
        register_companion: function() {},
        snapshot_request: function() {
          ws.send(JSON.stringify({ type: 'context', payload: { context_id: context, version: 1 } }));
          ws.send(JSON.stringify({
            type: 'app_state',
            payload: { person: 'kids', profile: 'kids', screen: context }
          }));
        }
      };
      [REPLY[m.type]].filter(Boolean).forEach(function(fn) { fn(); });
    });
  });
  return { intents: intents };
}

function sentIntents(backend) {
  return backend.intents.filter(function(m) { return m.type === 'intent'; }).map(function(m) { return m.payload; });
}

async function openGuide(page) {
  await page.goto('/companion/guide.html');
  await expect(page.locator('.guide-channel')).toHaveCount(3);
  await expect(page.locator('.guide-day.on')).toBeVisible();
}

function channel(page, id) {
  return page.locator('.guide-channel[data-channel="' + id + '"]');
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await withChannels(page, [ON_AIR, OFF_AIR_TIMED, OFF_AIR_PLAIN]);
});

// The phone's entry point is a row in the ☰ menu, not a tile in the Channels
// dock (owner, 2026-09-08) — the dock lists things that are ON, and the Guide is
// not one of them. Being in the menu also makes it reachable from wherever the
// phone is, rather than only from Channels.
test.describe('getting there', () => {
  async function openBrowse(page) {
    await page.goto('/companion/browse.html');
    await expect(page.locator('#section-dock .dock-tab')).not.toHaveCount(0);
  }

  test('the ☰ menu carries a Guide row, and it opens the phone\'s Guide', async ({ page }) => {
    await installTv(page, 'browse');
    await openBrowse(page);
    await page.locator('#btn-status').click();
    await expect(page.locator('#status-menu #open-guide')).toHaveText('📺 TV Guide');
    await page.locator('#open-guide').click();
    // What the page then draws is the rest of this suite's business; the row's
    // job is done when the phone is on it. (The TV is parked on browse here, so
    // the phone would follow the context straight back off the page.)
    await expect(page).toHaveURL(/companion\/guide\.html/);
  });

  test('the row sends the television to its own Guide as the phone goes to hers', async ({ page }) => {
    const tv = await installTv(page, 'browse');
    await openBrowse(page);
    await page.locator('#btn-status').click();
    await page.locator('#open-guide').click();
    await expect(page).toHaveURL(/companion\/guide\.html/);
    const navs = sentIntents(tv).filter(function(p) { return p.intent === 'navigate'; });
    expect(navs.map(function(p) { return p.params.page; })).toContain('guide.html');
  });

  test('the Channels dock holds channels only — no Guide tile among them', async ({ page }) => {
    await installTv(page, 'browse');
    await openBrowse(page);
    await page.locator('.dock-tab[data-section="channels"]').click();
    await expect(page.locator('#txtgrid .ph-txt')).not.toHaveCount(0);
    await expect(page.locator('[data-kind="guide"]')).toHaveCount(0);
    await expect(page.getByText('Guide', { exact: true })).toHaveCount(0);
  });
});

test.describe('the phone shows what the television shows', () => {
  test('one section per channel, each named and headed with its hours', async ({ page }) => {
    await installTv(page);
    await openGuide(page);
    await expect(page.locator('#ctx-title')).toHaveText('Guide');
    await expect(channel(page, 'cartoon-club').locator('.guide-chname')).toHaveText('Cartoon Club');
    await expect(channel(page, 'cartoon-club').locator('.guide-chmeta')).toHaveText('Episodes · On air until 17:22');
    await expect(channel(page, 'after-dark').locator('.guide-chmeta')).toHaveText('Films · On air 21:00–22:57');
    await expect(channel(page, 'matinee').locator('.guide-chmeta')).toHaveText('Films · Off air');
  });

  test('the now line names the clock, once, above all of them', async ({ page }) => {
    await installTv(page);
    await openGuide(page);
    await expect(page.locator('.guide-nowline')).toHaveCount(1);
    await expect(page.locator('.guide-nowline')).toHaveText('NOW · 17:02');
  });

  test('the on-now card is the same card, with the same ticking bar', async ({ page }) => {
    await installTv(page);
    await openGuide(page);
    const card = channel(page, 'cartoon-club').locator('.guide-now');
    await expect(card.locator('.now-tag')).toHaveText('ON NOW');
    await expect(card.locator('.now-title')).toHaveText('Bluey');
    await expect(card.locator('.now-sub')).toHaveText('Sleepytime · S1 E22');
    await expect(card.locator('.now-pos')).toHaveText('2m/8m');
    const width = parseFloat(await card.locator('.now-bar-fill').evaluate(el => el.style.width));
    expect(width).toBeGreaterThanOrEqual(25);
    expect(width).toBeLessThan(30);
  });

  test('an off-air channel says when it is back, or says only Off air', async ({ page }) => {
    await installTv(page);
    await openGuide(page);
    await expect(channel(page, 'after-dark').locator('.now-pos')).toHaveText('Back at 21:00');
    await expect(channel(page, 'matinee').locator('.now-title')).toHaveText('Off air');
    await expect(channel(page, 'matinee').locator('.now-pos')).toBeHidden();
  });

  test('each channel lists the rest of its day, and names when it stops', async ({ page }) => {
    await installTv(page);
    await openGuide(page);
    const rows = channel(page, 'cartoon-club').locator('.guide-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('.guide-time')).toHaveText('17:08');
    await expect(rows.nth(0).locator('.guide-row-title')).toHaveText('Bluey');
    await expect(rows.nth(0).locator('.guide-row-sub')).toHaveText('Keepy Uppy · S1 E23 · 7m');
    await expect(channel(page, 'cartoon-club').locator('.guide-tail'))
      .toHaveText('Off air from 17:22 · back Monday 09:00');
  });

  test('tomorrow is the same page, with the first programme where the card was', async ({ page }) => {
    await installTv(page);
    await openGuide(page);
    await page.locator('.guide-day[data-day="2026-09-07"]').click();
    await expect(page.locator('.guide-nowline')).toHaveText('MONDAY 7 SEP');
    const card = channel(page, 'cartoon-club').locator('.guide-now');
    await expect(card.locator('.now-tag')).toHaveText('FIRST ON');
    await expect(card.locator('.now-title')).toHaveText('Bluey');
    await expect(card.locator('.now-pos')).toHaveText('09:00');
    await expect(channel(page, 'cartoon-club').locator('.guide-row')).toHaveCount(1);
  });
});

test.describe('the phone drives', () => {
  test('tapping an on-now card sends the TV into that channel', async ({ page }) => {
    const backend = await installTv(page);
    await openGuide(page);
    await channel(page, 'cartoon-club').locator('.guide-now').click();
    const play = sentIntents(backend).filter(i => i.intent === 'play');
    expect(play).toHaveLength(1);
    expect(play[0].params).toEqual({ id: 'cartoon-club' });
  });

  // Story 5 — nothing to tune into, so nothing is sent. The card is not a
  // control that fails quietly; it is not a control.
  test('tapping an off-air card sends nothing at all', async ({ page }) => {
    const backend = await installTv(page);
    await openGuide(page);
    await channel(page, 'after-dark').locator('.guide-now').click();
    expect(sentIntents(backend).filter(i => i.intent === 'play')).toEqual([]);
  });

  test('a listed programme is not a control either', async ({ page }) => {
    const backend = await installTv(page);
    await openGuide(page);
    await channel(page, 'cartoon-club').locator('.guide-row').first().click();
    expect(sentIntents(backend).filter(i => i.intent === 'play')).toEqual([]);
    await expect(page.locator('.guide-row button')).toHaveCount(0);
  });

  // Switching day is a page-level move, so the television follows the phone
  // onto the same day rather than the two drifting apart.
  test('switching day takes the TV with it', async ({ page }) => {
    const backend = await installTv(page);
    await openGuide(page);
    await page.locator('.guide-day[data-day="2026-09-07"]').click();
    const days = sentIntents(backend).filter(i => i.intent === 'guide_day');
    expect(days).toHaveLength(1);
    expect(days[0].params).toEqual({ day: '2026-09-07' });
  });
});

test.describe('desynced', () => {
  // Reading is the whole point of the page, so it still reads — but the card
  // drives the TV, so it greys out with every other control that does.
  test('the page still reads, and the card that drives the TV is off', async ({ page }) => {
    await installTv(page);
    await openGuide(page);
    await page.locator('#btn-status').click();
    await page.locator('#sync-bar .seg-opt').nth(1).click();
    await expect(channel(page, 'cartoon-club').locator('.guide-now')).toHaveClass(/desync-off/);
    await expect(channel(page, 'cartoon-club').locator('.guide-row')).toHaveCount(2);
    await expect(page.locator('.guide-nowline')).toHaveText('NOW · 17:02');
  });
});
