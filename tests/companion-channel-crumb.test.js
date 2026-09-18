const { test, expect } = require('@playwright/test');
const {
  installApi,
  CHANNEL_ON_AIR: ON_AIR,
  CHANNEL_OFF_AIR_TIMED: OFF_AIR_TIMED,
  CHANNEL_OFF_AIR_PLAIN: OFF_AIR_PLAIN
} = require('./fixtures/api.js');

// BUG-632 — a channel's breadcrumb on the phone names the rail it was tuned in
// from, and both that crumb and the channel's own go back to it. The bug as the
// owner met it: the phone recorded the rail as { tab, rail } but the TV pushed
// the channel crumb as { tab } alone, so pressing it missed the recorded entry,
// cleared the trail, and browse reopened somewhere else.
//
// One tab, walked end to end: browse on the phone, tap a channel on a rail that
// is NOT the tab's first (story 4 — the first rail would pass by accident), then
// the player page with the TV's own context push, then back onto browse.

// Two rails and On now: Cartoons (cartoon-club), Films (after-dark), On now.
const RAILED = [
  Object.assign({}, ON_AIR, { rails: ['cartoons'] }),
  Object.assign({}, OFF_AIR_TIMED, { rails: ['films'] }),
  OFF_AIR_PLAIN
];

// The TV's crumb target for a channel, as ui/screens/screen-channel-player.js
// builds it and pushes it.
const CHANNEL_SOURCE = { label: 'After Dark', page: 'browse.html', params: { tab: 'channels' } };

async function withChannels(page, channels) {
  await page.route('**/api/channels**', function(route) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ channels: channels }) });
  });
}

// One mock TV for both pages: `tv.screen` says which page the TV is on, and
// `tv.channelId` which channel it is playing when that page is the player.
async function installTv(page) {
  var tv = { screen: 'browse', channelId: 'after-dark', intents: [] };
  var version = 1;
  await page.routeWebSocket(/:8766/, function(ws) {
    function send(type, payload) { ws.send(JSON.stringify({ type: type, payload: payload })); }
    var CONTEXT = {
      browse: function() {
        send('context', { version: version, context_id: 'browse' });
        send('app_state', { screen: 'home', profile: 'kids' });
      },
      video: function() {
        send('context', {
          context_id: 'video', version: version,
          display: { id: 'film-8-mile-main', title: '8 Mile' },
          channel: true, channelSource: CHANNEL_SOURCE, channelId: tv.channelId, channelCard: null,
          musicVideo: false, homeMovie: false, film: false, series: false
        });
        send('app_state', { person: 'dad', profile: 'kids', screen: 'player', itemId: 'film-8-mile-main', positionSec: 300, durationSec: 6356, playing: true });
      }
    };
    ws.onMessage(function(raw) {
      var m = JSON.parse(raw);
      [m].filter(function(x) { return x.type === 'intent'; }).forEach(function(x) { tv.intents.push(x.payload); });
      [m].filter(function(x) { return x.type === 'list_devices'; }).forEach(function() {
        send('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] });
      });
      [m].filter(function(x) { return x.type === 'snapshot_request'; }).forEach(function() {
        version += 1;
        CONTEXT[tv.screen]();
      });
    });
  });
  return tv;
}

function navigates(tv) {
  return tv.intents.filter(function(i) { return i.intent === 'navigate'; });
}

// Browse → Channels → the Films rail → tap After Dark → the player page.
async function tuneInFromFilmsRail(page, tv) {
  tv.screen = 'browse';
  await page.goto('/companion/browse.html');
  await page.locator('.dock-tab[data-section="channels"]').click();
  await expect(page.locator('#pager-name')).toHaveText('Cartoons');
  await page.locator('#pager-next').first().click();
  await expect(page.locator('#pager-name')).toHaveText('Films');
  await page.locator('.ph-chan[data-channel="after-dark"]').click();
  await expect.poll(function() { return tv.intents.filter(function(i) { return i.intent === 'select'; }).length; }).toBeGreaterThan(0);
  // Browse's own drill sent intents too; only what the player page sends is asked about.
  tv.intents.length = 0;
  tv.screen = 'video';
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('8 Mile');
}

function crumbLabels(page) {
  return page.locator('#breadcrumb .crumb').allTextContents();
}

// The phone following the TV back onto browse, as onContext does.
async function followToBrowse(page, tv) {
  tv.screen = 'browse';
  await page.goto('/companion/browse.html');
}

test.describe('a channel\'s breadcrumb on the phone', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await withChannels(page, RAILED);
  });

  // Story 1.
  test('names the rail the channel was tapped on', async ({ page }) => {
    const tv = await installTv(page);
    await tuneInFromFilmsRail(page, tv);
    await expect.poll(function() { return crumbLabels(page); }).toEqual(['Home', 'Films', 'After Dark', '8 Mile']);
  });

  // Stories 3, 4 and 5 — the channel crumb, from a rail that is not the first.
  test('the channel crumb returns to that rail, and the TV to its Channels tab', async ({ page }) => {
    const tv = await installTv(page);
    await tuneInFromFilmsRail(page, tv);
    await page.locator('#breadcrumb').getByText('After Dark').click();
    await expect.poll(function() { return navigates(tv).length; }).toBe(1);
    expect(navigates(tv)[0].params).toEqual({ page: 'browse.html', params: { tab: 'channels' } });
    await followToBrowse(page, tv);
    await expect(page.locator('#pager-name')).toHaveText('Films');
    await expect(page.locator('.ph-chan[data-channel="after-dark"]')).toBeVisible();
  });

  // Stories 2, 4 and 5 — the rail crumb.
  test('the rail crumb returns to that rail, and the TV to its Channels tab', async ({ page }) => {
    const tv = await installTv(page);
    await tuneInFromFilmsRail(page, tv);
    await page.locator('#breadcrumb').getByText('Films').click();
    await expect.poll(function() { return navigates(tv).length; }).toBe(1);
    expect(navigates(tv)[0].params).toEqual({ page: 'browse.html', params: { tab: 'channels' } });
    await followToBrowse(page, tv);
    await expect(page.locator('#pager-name')).toHaveText('Films');
  });

  // Story 6 — Browse mode: the phone goes, the TV is left alone.
  test('in Browse mode the phone lands on the rail and the TV stays put', async ({ page }) => {
    const tv = await installTv(page);
    await tuneInFromFilmsRail(page, tv);
    await page.evaluate(function() { sessionStorage.setItem('grew-tv:companion-mode', 'desynced'); });
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('8 Mile');
    await page.locator('#breadcrumb').getByText('After Dark').click();
    await expect(page).toHaveURL(/\/companion\/browse\.html/);
    await expect(page.locator('#pager-name')).toHaveText('Films');
    // Browse's own restore drives the TV once bound; a desynced phone's WS layer
    // drops it before it leaves, so nothing at all reaches the TV.
    expect(navigates(tv)).toEqual([]);
  });

  // Story 7 — the TV changed channel under the phone: the channel playing is not
  // the one tapped on the rail, so no rail is named and the crumb is today's.
  test('a channel the phone did not tap names no rail', async ({ page }) => {
    const tv = await installTv(page);
    await tuneInFromFilmsRail(page, tv);
    tv.channelId = 'cartoon-club';
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('8 Mile');
    await expect.poll(function() { return crumbLabels(page); }).toEqual(['Home', 'After Dark', '8 Mile']);
    await page.locator('#breadcrumb').getByText('After Dark').click();
    await expect.poll(function() { return navigates(tv).length; }).toBe(1);
    expect(navigates(tv)[0].params).toEqual({ page: 'browse.html', params: { tab: 'channels' } });
  });

  // Story 7 — reached with no rail on the trail at all (the Guide, a fresh phone).
  test('with nothing tapped on the phone, the crumb is Home › channel › what\'s on', async ({ page }) => {
    const tv = await installTv(page);
    tv.screen = 'video';
    await page.goto('/companion/video.html');
    await expect.poll(function() { return crumbLabels(page); }).toEqual(['Home', 'After Dark', '8 Mile']);
  });
});
