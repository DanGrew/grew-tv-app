const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-330 — the TV half of the external-destination "Atlas" door. The TV has NO
// Atlas button of its own (owner 2026-07-14 — the door lives only on the companion);
// it only RECEIVES the companion's `launchExternal` intent over the app WS and
// crosses itself to the carried tvUrl. Config lives in core/external-destinations.js
// (port + paths, host-derived at cross time — BUG-054); grew-tv holds no atlas code.
// This TV half just assigns whatever tvUrl the intent carries, so the injected value
// below is arbitrary — it proves the cross fires, not how the URL is built.
//
// The atlas host is stubbed so the cross navigation lands on a controllable page
// instead of the real (possibly-down) LAN atlas — this proves the URL fired without
// needing a live atlas.
const ATLAS_HOST = /192\.168\.1\.242:8090/;
const ATLAS_TV_URL = /192\.168\.1\.242:8090\/app\/tv\.html/;

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.route(ATLAS_HOST, route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>atlas</title>ATLAS'
  }));
  await page.goto('/app/homeview/profile.html');
});

test('Story 2 (TV half): a launchExternal intent from the companion crosses the TV to the carried tvUrl', async ({ page }) => {
  let appWs = null;
  await page.routeWebSocket(/:8766/, ws => { appWs = ws; });
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect.poll(() => appWs !== null).toBe(true);
  await appWs.send(JSON.stringify({ type: 'intent', payload: { intent: 'launchExternal', params: { tvUrl: 'http://192.168.1.242:8090/app/tv.html' } } }));
  await page.waitForURL(ATLAS_TV_URL);
});

test('a params-less launchExternal intent is a no-op, not a throw (stays on browse)', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let appWs = null;
  await page.routeWebSocket(/:8766/, ws => { appWs = ws; });
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect.poll(() => appWs !== null).toBe(true);
  await appWs.send(JSON.stringify({ type: 'intent', payload: { intent: 'launchExternal' } }));
  await page.waitForTimeout(200);
  await expect(page).toHaveURL(/browse\.html/);
  expect(errors).toEqual([]);
});

test('the TV home screen shows NO Atlas button (the door lives only on the companion)', async ({ page }) => {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('[data-external="atlas"]')).toHaveCount(0);
  // The usual content still renders.
  await expect(page.locator('.film-tile[data-id="bluey"]')).toBeVisible();
});
