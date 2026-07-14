const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');

// TASK-330 — the config-driven external-destination "Atlas" door on the TV home
// screen. It is a small `.sidebar-door` icon button at the foot of the sidebar (the
// nav/control column), below the content-type tabs, reachable by d-pad Down past the
// last tab. Selecting it (native button Enter / click) crosses the TV to the
// destination's tvUrl; a `launchExternal` intent from the companion does the same.
// Config lives in core/external-destinations.js — grew-tv holds only the URL pair,
// no atlas code.
//
// The atlas host is stubbed so the cross navigation lands on a controllable page
// instead of the real (possibly-down) LAN atlas — this proves the URL fired without
// needing a live atlas, and lets us assert grew-tv makes NO atlas request at render.
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

test('Story 1: an Atlas door renders in the sidebar alongside content', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  const door = page.locator('#sidebar .sidebar-door[data-external="atlas"]');
  await expect(door).toBeVisible();
  await expect(door.locator('.door-name')).toHaveText('Atlas');
  // Alongside the usual content (the Series tab's Bluey rail).
  await expect(page.locator('.film-tile[data-id="bluey"]')).toBeVisible();
});

test('Story 3: selecting the Atlas door on the TV crosses the TV to the atlas TV page', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-door[data-external="atlas"]').click();
  await page.waitForURL(ATLAS_TV_URL);
});

test('Story 3 (d-pad): Enter on the focused Atlas door crosses the TV', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  const door = page.locator('.sidebar-door[data-external="atlas"]');
  await door.focus();
  await expect(door).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL(ATLAS_TV_URL);
});

test('Story 2 (TV half): a launchExternal intent from the companion crosses the TV to the carried tvUrl', async ({ page }) => {
  let appWs = null;
  await page.routeWebSocket(/:8766/, ws => { appWs = ws; });
  await page.locator('#btn-kids').click();
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
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect.poll(() => appWs !== null).toBe(true);
  await appWs.send(JSON.stringify({ type: 'intent', payload: { intent: 'launchExternal' } }));
  await page.waitForTimeout(200);
  await expect(page).toHaveURL(/browse\.html/);
  expect(errors).toEqual([]);
});

test('degrades gracefully: grew-tv makes NO atlas request at render, and the tile + content render with no error', async ({ page }) => {
  let atlasHits = 0;
  page.on('request', r => { atlasHits += ATLAS_HOST.test(r.url()) ? 1 : 0; });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  // The door still renders — nothing verified the atlas is up (no runtime dependency).
  await expect(page.locator('.sidebar-door[data-external="atlas"]')).toBeVisible();
  await expect(page.locator('.film-tile[data-id="bluey"]')).toBeVisible();
  expect(atlasHits).toBe(0);
  expect(errors).toEqual([]);
});
