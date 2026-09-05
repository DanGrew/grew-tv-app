const { test, expect } = require('@playwright/test');
const {
  installApi,
  CHANNEL_ON_AIR: ON_AIR,
  CHANNEL_OFF_AIR_TIMED: OFF_AIR_TIMED,
  CHANNEL_OFF_AIR_PLAIN: OFF_AIR_PLAIN
} = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// FEAT-560/TASK-563 — the Channels tab: opening the TV shows what's on. The
// card's arithmetic is proved in tests/unit/channels.test.js; this is the tab
// existing, landing, drawing three states, ticking, and staying away when there
// is nothing on.
//
// The default fixture serves an EMPTY strip, so every other test in the suite
// runs with no Channels tab — which is also story 6's first case, asserted
// below. A test wanting channels overrides the route itself.

// The three states come from tests/fixtures/api.js, where the stub<->contract
// shape gate can see them (TASK-326) — a channel line written inline here would
// drift off the backend with nothing to notice.

async function withChannels(page, channels) {
  await page.route('**/api/channels**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ channels: channels })
    });
  });
}

async function openBrowse(page) {
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
}

test.describe('with channels on air', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await withChannels(page, [ON_AIR, OFF_AIR_TIMED, OFF_AIR_PLAIN]);
  });

  // Story 1 — land on Channels without picking anything.
  test('Channels is first in the sidebar and the tab browse lands on', async ({ page }) => {
    await openBrowse(page);
    await expect(page.locator('.sidebar-tab').first()).toHaveText('Channels');
    await expect(page.locator('.sidebar-tab.active')).toHaveText('Channels');
  });

  test('one card per channel, under an On now strip', async ({ page }) => {
    await openBrowse(page);
    await expect(page.locator('.rail-title').first()).toHaveText('On now');
    await expect(page.locator('.channel-tile')).toHaveCount(3);
  });

  // Story 2 — position over runtime in minutes, and a bar on the artwork.
  test('a card names the channel, what is on, and how far in', async ({ page }) => {
    await openBrowse(page);
    const card = page.locator('.channel-tile[data-channel="cartoon-club"]');
    await expect(card.locator('.channel-name')).toHaveText('Cartoon Club');
    await expect(card.locator('.tile-title')).toHaveText('Bluey');
    await expect(card.locator('.channel-time')).toHaveText('2m/8m');
    // 120s into 480s. A RANGE, not 25% exactly: the bar is already ticking by
    // the time this runs, which is the point of it (story 3).
    const width = parseFloat(await card.locator('.channel-progress-fill').evaluate(function(el) { return el.style.width; }));
    expect(width).toBeGreaterThanOrEqual(25);
    expect(width).toBeLessThan(30);
  });

  // Story 4, both halves.
  test('an off-air channel says so, and names its return when there is one', async ({ page }) => {
    await openBrowse(page);
    const timed = page.locator('.channel-tile[data-channel="after-dark"]');
    await expect(timed.locator('.tile-title')).toHaveText('Off air');
    await expect(timed.locator('.channel-time')).toHaveText('Back at 21:00');

    const plain = page.locator('.channel-tile[data-channel="matinee"]');
    await expect(plain.locator('.tile-title')).toHaveText('Off air');
    await expect(plain.locator('.channel-time')).toHaveText('');
  });

  // Story 3 — the card ticks, and it is wrong within a minute of render if it
  // doesn't. Proved on a REAL minute boundary rather than by trusting a timer
  // exists: this channel is served two seconds short of the 2m mark, so the
  // label has to turn over on its own while the page just sits there.
  test('the time and the bar move without reloading', async ({ page }) => {
    await withChannels(page, [Object.assign({}, ON_AIR, { offset_seconds: 118 })]);
    await openBrowse(page);
    const card = page.locator('.channel-tile[data-channel="cartoon-club"]');
    await expect(card.locator('.channel-time')).toHaveText('1m/8m');
    const before = await card.locator('.channel-progress-fill').getAttribute('style');
    await expect(card.locator('.channel-time')).toHaveText('2m/8m');
    const after = await card.locator('.channel-progress-fill').getAttribute('style');
    expect(after).not.toBe(before);
  });

  // TASK-564 wired the press. What that press DOES — the player it opens, and
  // the off-air card that still goes nowhere — is tests/channel-player.test.js;
  // all this tab needs to prove is that its own card reaches it.
  test('picking a channel opens the player on that channel', async ({ page }) => {
    await openBrowse(page);
    await page.locator('.channel-tile[data-channel="cartoon-club"]').click();
    await expect(page).toHaveURL(/video\.html\?.*channel=cartoon-club/);
  });

  // The bar is the CHANNEL's position, not the viewer's — the same shape as
  // .tile-progress-fill carrying the opposite fact. A channel card must never
  // grow the library tile's bar, whatever the watch history says.
  test('a channel card carries no watch-progress bar', async ({ page }) => {
    await openBrowse(page);
    await expect(page.locator('.channel-tile .tile-progress')).toHaveCount(0);
  });
});

test.describe('with no channels', () => {
  // Story 6 — a default tab that can be empty is worse than no default. Both
  // causes look the same to the app: none configured, and none this profile may
  // see (the likelier one since a channel declares who may see it).
  test('there is no Channels tab, and browse lands where it used to', async ({ page }) => {
    await installApi(page);
    await withChannels(page, []);
    await openBrowse(page);
    await expect(page.locator('.sidebar-tab').first()).not.toHaveText('Channels');
    await expect(page.locator('.channel-tile')).toHaveCount(0);
    await expect(page.locator('.sidebar-tab.active')).toHaveText('TV Series');
  });

  // A backend too old to serve the route must cost browse nothing at all — the
  // strip is an addition to the page, never a precondition for it.
  test('a backend without the route leaves browse working', async ({ page }) => {
    await installApi(page);
    await page.route('**/api/channels**', function(route) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    });
    await openBrowse(page);
    await expect(page.locator('.sidebar-tab.active')).toHaveText('TV Series');
    await expect(page.locator('.film-tile').first()).toBeVisible();
  });
});

// FEAT-017/028 — a browse change ships its companion mirror in the same task.
// The phone's tiles are text by design (zero <img>, so browsing it fires no
// poster requests), so the card is the TV's three lines without the artwork.
//
// The companion takes its profile off the app snapshot over the socket, so it
// needs the same single-screen mock app the other companion suites use.
// `intents` (optional) collects every intent the phone sends, so a tap that
// DRIVES the TV can be asserted here rather than only on the TV's own side.
function mockApp(page, intents) {
  let version = 1;
  return page.routeWebSocket(/:8766/, (ws) => {
    function msg(type, payload) { return JSON.stringify({ type, payload }); }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'intent' && intents) intents.push(m.payload);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') {
        version += 1;
        ws.send(msg('context', { version: version, context_id: 'browse' }));
        ws.send(msg('app_state', { screen: 'home', profile: 'kids' }));
      }
    });
  });
}

test.describe('the companion mirror', () => {
  test('Channels leads the section dock, with the same cards', async ({ page }) => {
    await installApi(page);
    await withChannels(page, [ON_AIR, OFF_AIR_TIMED]);
    await mockApp(page);
    await page.goto('/companion/browse.html');
    await expect(page.locator('#section-dock .dock-tab-label').first()).toHaveText('Channels');

    // Tapping a section jumps straight to its first rail's grid (TASK-411).
    await page.locator('.dock-tab[data-section="channels"]').click();
    await expect(page.locator('#pager-name')).toHaveText('On now');
    await expect(page.locator('.ph-chan')).toHaveCount(2);
    // Text-only, like every other companion tile.
    await expect(page.locator('#txtgrid img')).toHaveCount(0);

    const card = page.locator('.ph-chan[data-channel="cartoon-club"]');
    await expect(card.locator('.nm')).toHaveText('Cartoon Club');
    await expect(card.locator('.chan-now')).toHaveText('Bluey');
    await expect(card.locator('.chan-time')).toHaveText('2m/8m');
  });

  test('an off-air channel reads the same on the phone', async ({ page }) => {
    await installApi(page);
    await withChannels(page, [ON_AIR, OFF_AIR_TIMED]);
    await mockApp(page);
    await page.goto('/companion/browse.html');
    await page.locator('.dock-tab[data-section="channels"]').click();
    const card = page.locator('.ph-chan[data-channel="after-dark"]');
    await expect(card.locator('.chan-now')).toHaveText('Off air');
    await expect(card.locator('.chan-time')).toHaveText('Back at 21:00');
  });

  // TASK-564 — the tap drives the TV, through the SAME `select` funnel every
  // other tile uses. What the TV then does with it (open the player, or refuse
  // an off-air channel) is its own card-route table's business and lives in one
  // place, so the two surfaces cannot disagree.
  test('tapping a channel drives the TV into it', async ({ page }) => {
    const intents = [];
    await installApi(page);
    await withChannels(page, [ON_AIR, OFF_AIR_TIMED]);
    await mockApp(page, intents);
    await page.goto('/companion/browse.html');
    await page.locator('.dock-tab[data-section="channels"]').click();
    await page.locator('.ph-chan[data-channel="cartoon-club"]').click();
    await expect.poll(() => intents.filter(i => i.intent === 'select').length, { timeout: 5000 })
      .toBeGreaterThan(0);
    expect(intents.find(i => i.intent === 'select').params.id).toBe('channel:cartoon-club');
  });

  // TASK-564 — pressing the player's "Channels" crumb on the phone. The crumb
  // trims the trail to the recorded channels entry and both surfaces reload
  // onto browse; the phone rebuilds its position from that entry, which names
  // the tab and no rail (the TV's channels screen is a browse tab, so the crumb
  // cannot name a rail-grid). The phone's own channels screen is a grid, and it
  // has to come back with the cards on it — it came back on the rail level,
  // drawing the pager's dots over an empty screen with no title.
  test('coming back to Channels lands on the cards, not an empty rail', async ({ page }) => {
    await installApi(page);
    await withChannels(page, [ON_AIR, OFF_AIR_TIMED]);
    await mockApp(page);
    await page.addInitScript(() => {
      sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([
        { page: 'browse.html', params: { tab: 'channels' }, label: 'Channels' }
      ]));
    });
    await page.goto('/companion/browse.html');
    await expect(page.locator('.ph-chan')).toHaveCount(2);
    await expect(page.locator('#pager-name')).toHaveText('On now');
    await expect(page.locator('#grid-wrap')).toBeVisible();
    await expect(page.locator('.dock-tab[data-section="channels"]')).toHaveClass(/active/);
  });

  test('no channels means no Channels tab on the phone either', async ({ page }) => {
    await installApi(page);
    await withChannels(page, []);
    await mockApp(page);
    await page.goto('/companion/browse.html');
    await expect(page.locator('#section-dock .dock-tab-label').first()).toHaveText('TV Series');
    await expect(page.locator('.dock-tab[data-section="channels"]')).toHaveCount(0);
  });
});
