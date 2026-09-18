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

// TASK-626 — the same three channels, saying which rails they belong on. Two
// name one each and the third names none, so one strip proves all three of the
// rules at once: a rail per slug, alphabetical by title, and `On now` last
// holding whatever opted into nothing.
const RAILED = [
  Object.assign({}, ON_AIR, { rails: ['cartoons'] }),
  Object.assign({}, OFF_AIR_TIMED, { rails: ['films'] }),
  OFF_AIR_PLAIN
];

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

  // TASK-626 stories 1 and 5 — the tab groups itself from what each channel
  // says it belongs to, and a channel naming nothing still has somewhere to be.
  test('channels draw under the rails they name, On now last', async ({ page }) => {
    await withChannels(page, RAILED);
    await openBrowse(page);
    await expect(page.locator('.rail-title')).toHaveText(['Cartoons', 'Films', 'On now']);
    await expect(page.locator('.channel-tile')).toHaveCount(3);
    const films = page.locator('.rail', { has: page.locator('.rail-title', { hasText: 'Films' }) });
    await expect(films.locator('.channel-tile')).toHaveCount(1);
    await expect(films.locator('.channel-tile[data-channel="after-dark"]')).toBeVisible();
  });

  // Story 4 — a channel naming two rails is drawn in both of them. The same
  // fan-out a card gets from its genres, and the reason nothing anywhere holds
  // a list of rails.
  test('a channel naming two rails is drawn in both', async ({ page }) => {
    await withChannels(page, [Object.assign({}, ON_AIR, { rails: ['films', 'romance'] })]);
    await openBrowse(page);
    await expect(page.locator('.rail-title')).toHaveText(['Films', 'Romance']);
    await expect(page.locator('.channel-tile[data-channel="cartoon-club"]')).toHaveCount(2);
  });

  // Story 2 — position over runtime in minutes, and a bar on the artwork.
  // TASK-588 — the title line is the SHOW, and the episode joins the position
  // on the line below it.
  test('a card names the channel, what is on, and how far in', async ({ page }) => {
    await openBrowse(page);
    const card = page.locator('.channel-tile[data-channel="cartoon-club"]');
    await expect(card.locator('.channel-name')).toHaveText('Cartoon Club');
    await expect(card.locator('.tile-title')).toHaveText('Bluey');
    await expect(card.locator('.channel-time')).toHaveText('Sleepytime · S1 E22 · 2m/8m');
    // 120s into 480s. A RANGE, not 25% exactly: the bar is already ticking by
    // the time this runs, which is the point of it (story 3).
    const width = parseFloat(await card.locator('.channel-progress-fill').evaluate(function(el) { return el.style.width; }));
    expect(width).toBeGreaterThanOrEqual(25);
    expect(width).toBeLessThan(30);
  });

  // TASK-570 story 1 — the card says what follows, beside what is on now, so a
  // channel nearly over still tells you whether to sit down.
  // TASK-588 — it names the SHOW: "Next: Keepy Uppy" tells a viewer nothing.
  test('a card names what is on after this one', async ({ page }) => {
    await openBrowse(page);
    const card = page.locator('.channel-tile[data-channel="cartoon-club"]');
    await expect(card.locator('.tile-title')).toHaveText('Bluey');
    await expect(card.locator('.channel-next')).toHaveText('Next: Bluey');
  });

  // TASK-588 story 3 — a film has no show, so its card is exactly what it was:
  // its own title on the title line and the bare position beneath.
  test('a film card is unchanged — its own title, and no episode line', async ({ page }) => {
    await withChannels(page, [Object.assign({}, ON_AIR, {
      item: { item_id: 'alien', title: 'Alien', poster: null, itemType: 'film', ext: 'mp4', subtitles: null, series: null },
      following: null
    })]);
    await openBrowse(page);
    const card = page.locator('.channel-tile[data-channel="cartoon-club"]');
    await expect(card.locator('.tile-title')).toHaveText('Alien');
    await expect(card.locator('.channel-time')).toHaveText('2m/8m');
  });

  // TASK-570 story 3 — the line goes, rather than leaving a gap where it was.
  test('a channel with nothing after it loses the line rather than blanking it', async ({ page }) => {
    await withChannels(page, [Object.assign({}, ON_AIR, { following: null })]);
    await openBrowse(page);
    const card = page.locator('.channel-tile[data-channel="cartoon-club"]');
    await expect(card.locator('.tile-title')).toHaveText('Bluey');
    await expect(card.locator('.channel-next')).toBeHidden();
  });

  // Story 4, both halves — plus TASK-570 story 2: the return time is not
  // replaced, and no following line appears beside it.
  test('an off-air channel says so, and names its return when there is one', async ({ page }) => {
    await openBrowse(page);
    const timed = page.locator('.channel-tile[data-channel="after-dark"]');
    await expect(timed.locator('.tile-title')).toHaveText('Off air');
    await expect(timed.locator('.channel-time')).toHaveText('Back at 21:00');
    await expect(timed.locator('.channel-next')).toBeHidden();

    const plain = page.locator('.channel-tile[data-channel="matinee"]');
    await expect(plain.locator('.tile-title')).toHaveText('Off air');
    await expect(plain.locator('.channel-time')).toHaveText('');
    await expect(plain.locator('.channel-next')).toBeHidden();
  });

  // Story 3 — the card ticks, and it is wrong within a minute of render if it
  // doesn't. Proved on a REAL minute boundary rather than by trusting a timer
  // exists: this channel is served two seconds short of the 2m mark, so the
  // label has to turn over on its own while the page just sits there.
  test('the time and the bar move without reloading', async ({ page }) => {
    await withChannels(page, [Object.assign({}, ON_AIR, { offset_seconds: 118 })]);
    await openBrowse(page);
    const card = page.locator('.channel-tile[data-channel="cartoon-club"]');
    await expect(card.locator('.channel-time')).toHaveText('Sleepytime · S1 E22 · 1m/8m');
    const before = await card.locator('.channel-progress-fill').getAttribute('style');
    await expect(card.locator('.channel-time')).toHaveText('Sleepytime · S1 E22 · 2m/8m');
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
    // TASK-588 — the mirror invariant, and story 5: the show leads and the
    // episode sits under it here exactly as it does on the TV. The phone lays
    // the two out in its own shape (the position rides the name row up top),
    // but it says the same thing.
    await expect(card.locator('.chan-ep')).toHaveText('Sleepytime · S1 E22');
    // TASK-570 — the mirror invariant: the phone says what the TV says.
    await expect(card.locator('.chan-next')).toHaveText('Next: Bluey');
  });

  // TASK-588 story 3, on the phone — a film has no episode line to draw.
  test('a film drops the episode line on the phone too', async ({ page }) => {
    await installApi(page);
    await withChannels(page, [Object.assign({}, ON_AIR, {
      item: { item_id: 'alien', title: 'Alien', poster: null, itemType: 'film', ext: 'mp4', subtitles: null, series: null }
    })]);
    await mockApp(page);
    await page.goto('/companion/browse.html');
    await page.locator('.dock-tab[data-section="channels"]').click();
    const card = page.locator('.ph-chan[data-channel="cartoon-club"]');
    await expect(card.locator('.chan-now')).toHaveText('Alien');
    await expect(card.locator('.chan-ep')).toBeHidden();
  });

  // BUG-631 — a name too long for its line ends in "…" inside the card, rather
  // than the card running off the right-hand edge of a phone. The episode is
  // the real Open Mic title that broke it; the card's border and its position
  // are the two things that went missing past the edge.
  test('a long episode name stays inside the card on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await installApi(page);
    const longEp = Object.assign({}, ON_AIR.item, {
      title: 'Rhod Gilbert and the Cat That Looked Like Nicholas Lyndhurst'
    });
    await withChannels(page, [Object.assign({}, ON_AIR, { item: longEp }), OFF_AIR_TIMED]);
    await mockApp(page);
    await page.goto('/companion/browse.html');
    await page.locator('.dock-tab[data-section="channels"]').click();
    const card = page.locator('.ph-chan[data-channel="cartoon-club"]');
    await expect(card.locator('.chan-ep')).toHaveText(/^Rhod Gilbert/);
    const vw = page.viewportSize().width;
    const box = await card.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    const time = await card.locator('.chan-time').boundingBox();
    expect(time.x + time.width).toBeLessThanOrEqual(vw);
    // Cut, not wrapped: the line is still one line, and its text is wider than it.
    const ep = await card.locator('.chan-ep').evaluate(function(el) {
      return { scroll: el.scrollWidth, client: el.clientWidth };
    });
    expect(ep.scroll).toBeGreaterThan(ep.client);
    // Story 6 — a short-named card beside it is the width it always was: the grid's.
    const off = await page.locator('.ph-chan[data-channel="after-dark"]').boundingBox();
    expect(off.width).toBe(box.width);
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
    await expect(card.locator('.chan-ep')).toBeHidden();
    await expect(card.locator('.chan-next')).toBeHidden();
  });

  test('a channel with nothing after it drops the line on the phone too', async ({ page }) => {
    await installApi(page);
    await withChannels(page, [Object.assign({}, ON_AIR, { following: null })]);
    await mockApp(page);
    await page.goto('/companion/browse.html');
    await page.locator('.dock-tab[data-section="channels"]').click();
    const card = page.locator('.ph-chan[data-channel="cartoon-club"]');
    await expect(card.locator('.chan-now')).toHaveText('Bluey');
    await expect(card.locator('.chan-next')).toBeHidden();
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

  // TASK-626 — swiping to another rail on the phone must not send the TV to a
  // `rail-grid.html` for Channels: that page does not exist for this section
  // and the TV lands on an empty grid (TASK-564's own finding). It could not
  // happen while the tab had one rail, because there was nowhere to swipe TO.
  // The TV goes to its Channels tab, which draws every rail at once, while the
  // phone walks its own — the same split the dock tap already used.
  test('walking to another rail keeps the TV on its Channels tab', async ({ page }) => {
    const intents = [];
    await installApi(page);
    await withChannels(page, RAILED);
    await mockApp(page, intents);
    await page.goto('/companion/browse.html');
    await page.locator('.dock-tab[data-section="channels"]').click();
    await expect(page.locator('#pager-name')).toHaveText('Cartoons');

    await page.locator('#pager-next').first().click();
    await expect(page.locator('#pager-name')).toHaveText('Films');
    const navigates = intents.filter(i => i.intent === 'navigate');
    expect(navigates.map(i => i.params.page)).not.toContain('rail-grid.html');
    expect(navigates[navigates.length - 1].params.page).toBe('browse.html');
    expect(navigates[navigates.length - 1].params.params).toEqual({ tab: 'channels' });
    // And the phone is on the rail it walked to, with that rail's cards.
    await expect(page.locator('#grid-wrap')).toBeVisible();
    await expect(page.locator('.ph-chan[data-channel="after-dark"]')).toBeVisible();
  });

  // Every other section still drives the TV to the rail-grid page it does have
  // — the fix above is the Channels exception, not a new rule for all of them.
  test('walking to another rail still drives the TV for a catalog section', async ({ page }) => {
    const intents = [];
    await installApi(page);
    await withChannels(page, []);
    await mockApp(page, intents);
    await page.goto('/companion/browse.html');
    await page.locator('.dock-tab[data-section="films"]').click();
    await page.locator('#pager-next').first().click();
    const navigates = intents.filter(i => i.intent === 'navigate');
    expect(navigates[navigates.length - 1].params.page).toBe('rail-grid.html');
    expect(navigates[navigates.length - 1].params.params.section).toBe('films');
  });

  // TASK-564 — pressing the player's "Channels" crumb on the phone. The crumb
  // trims the trail to the recorded channels entry and both surfaces reload
  // onto browse; the phone rebuilds its position from that entry and has to
  // come back with the cards on it — it came back on the rail level, drawing
  // the pager's dots over an empty screen with no title.
  //
  // TASK-626 — the entry names its rail now, because the tab has several and
  // the tab alone no longer says which one the viewer was in.
  test('coming back to Channels lands on the cards, not an empty rail', async ({ page }) => {
    await installApi(page);
    await withChannels(page, [ON_AIR, OFF_AIR_TIMED]);
    await mockApp(page);
    await page.addInitScript(() => {
      sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([
        { page: 'browse.html', params: { tab: 'channels', rail: 'channels' }, label: 'On now' }
      ]));
    });
    await page.goto('/companion/browse.html');
    await expect(page.locator('.ph-chan')).toHaveCount(2);
    await expect(page.locator('#pager-name')).toHaveText('On now');
    await expect(page.locator('#grid-wrap')).toBeVisible();
    await expect(page.locator('.dock-tab[data-section="channels"]')).toHaveClass(/active/);
  });

  // TASK-626 story 9 — the rail the viewer walked into is the rail they come
  // back to. This is the check on `browseRestore`'s old premise: it answered
  // the channels rail from the tab alone "because the section has exactly one",
  // which with several rails reopened the phone on the first one every time.
  test('coming back lands on the rail you were in, not the first one', async ({ page }) => {
    await installApi(page);
    await withChannels(page, RAILED);
    await mockApp(page);
    await page.addInitScript(() => {
      sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([
        { page: 'browse.html', params: { tab: 'channels', rail: 'channel-rail:films' }, label: 'Films' }
      ]));
    });
    await page.goto('/companion/browse.html');
    await expect(page.locator('#pager-name')).toHaveText('Films');
    await expect(page.locator('.ph-chan')).toHaveCount(1);
    await expect(page.locator('.ph-chan[data-channel="after-dark"]')).toBeVisible();
  });

  // The mirror invariant (FEAT-017/028) — the same rails, in the same order, on
  // the phone. Both surfaces resolve them through the one railsForBrowseSection,
  // which is what makes that true rather than two lists agreeing by luck.
  test('the phone walks the same rails in the same order', async ({ page }) => {
    await installApi(page);
    await withChannels(page, RAILED);
    await mockApp(page);
    await page.goto('/companion/browse.html');
    await page.locator('.dock-tab[data-section="channels"]').click();
    await expect(page.locator('#pager-name')).toHaveText('Cartoons');
    await expect(page.locator('#pager-next').first()).toBeEnabled();
    await page.locator('#pager-next').first().click();
    await expect(page.locator('#pager-name')).toHaveText('Films');
    await page.locator('#pager-next').first().click();
    await expect(page.locator('#pager-name')).toHaveText('On now');
    await expect(page.locator('.ph-chan[data-channel="matinee"]')).toBeVisible();
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
