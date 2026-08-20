const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-483 — mirrors tests/atlas-door.test.js for the Ark destination
// (core/external-destinations.js). The TV has NO Ark button of its own — same as
// Atlas, the door lives only on the companion; the TV only RECEIVES the
// companion's `launchExternal` intent over the app WS and crosses itself to the
// carried tvUrl.
//
// The ark host is stubbed so the cross navigation lands on a controllable page
// instead of the real (possibly-down) LAN ark — this proves the URL fired without
// needing a live ark.
const ARK_HOST = /192\.168\.1\.242:8095/;
const ARK_TV_URL = /192\.168\.1\.242:8095\/tank\.html/;

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.route(ARK_HOST, route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>ark</title>ARK'
  }));
  await page.goto('/app/homeview/profile.html');
});

test('Story 2 (TV half): a launchExternal intent from the companion crosses the TV to the carried tvUrl', async ({ page }) => {
  let appWs = null;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) appWs = null; });
  await page.routeWebSocket(/:8766/, ws => { appWs = ws; });
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect.poll(() => appWs !== null).toBe(true);
  await appWs.send(JSON.stringify({ type: 'intent', payload: { intent: 'launchExternal', params: { tvUrl: 'http://192.168.1.242:8095/tank.html' } } }));
  await page.waitForURL(ARK_TV_URL);
});

test('the TV home screen shows NO Ark button (the door lives only on the companion)', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('[data-external="ark"]')).toHaveCount(0);
  // The usual content still renders.
  await expect(page.locator('.film-tile[data-id="bluey"]')).toBeVisible();
});
