const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend } = require('./fixtures/api.js');

// BUG-532 (FEAT-497) — the phone half of "size the two surfaces apart".
//
// TASK-515 left the Queue as ONE renderer emitting one set of `.qs-*` class
// names, with each surface's own <style> block defining them — the TV pages'
// blocks and companion/*-queue.html's. `.qs-art` and `.qs-tbtn-*` therefore
// carry the SAME names on both surfaces while meaning different sizes, so a
// number edited in the wrong block reshapes the phone silently and nothing
// else here would notice. That is exactly what BUG-532's story 3 asks about:
// the phone Queue looks exactly as it did before the TV was resized.
//
// These are the companion's 390px-native numbers, held so the TV's own metrics
// (tests/queue-shell-tv-metrics.test.js) can never leak across.

const PHONE = {
  art: 64,          // .qs-art — shared NAME with the TV's 96px hero art
  tbtnSm: 36,       // .qs-tbtn-sm — shared name, TV is 44
  tbtnLg: 44,       // .qs-tbtn-lg — shared name, TV is 56
  grip: 48,         // .ph-qname .grip, the phone's own row thumb
  act: 34,          // .ph-ract, the phone's own row action
  titleFont: '16px',
  rowFont: '15px',
  tabFont: '14px'
};

// Query and measure in the SAME evaluate. The shell repaints by replacing its
// markup wholesale on every snapshot the relay pushes, so a node resolved by a
// locator can be detached by the time it is measured a tick later — a detached
// node reports 0×0 with empty computed styles, which reads as a real failure.
// document.querySelector inside the page closes that window.
async function boxOf(page, selector) {
  return page.evaluate(sel => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }, selector);
}

async function fontOf(page, selector) {
  return page.evaluate(sel => getComputedStyle(document.querySelector(sel)).fontSize, selector);
}

async function openFilmQueue(page) {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('play-source', { source_type: 'series', source_id: 'bluey', item_id: 'bluey-s1e01' });
  backend.seed('queue-item', { item_id: 'bluey-s1e03' });
  await page.setViewportSize({ width: 390, height: 844 });   // the phone this page is built at
  await page.goto('/companion/film-queue.html');
  await expect(page.locator('.qs-ph-title')).toHaveText('Daddy Putdown');   // settle signal
}

test('the phone Queue keeps its own hero and transport sizes', async ({ page }) => {
  await openFilmQueue(page);
  expect(await boxOf(page, '.qs-art')).toEqual({ w: PHONE.art, h: PHONE.art });
  expect(await boxOf(page, '.qs-tbtn-sm')).toEqual({ w: PHONE.tbtnSm, h: PHONE.tbtnSm });
  expect(await boxOf(page, '.qs-tbtn-lg')).toEqual({ w: PHONE.tbtnLg, h: PHONE.tbtnLg });
  expect(await fontOf(page, '.qs-ph-title')).toBe(PHONE.titleFont);
});

test('the phone Queue keeps its own row and tab sizes', async ({ page }) => {
  await openFilmQueue(page);
  const row = '.ph-qtab-panel.active .ph-qrow ';
  expect(await boxOf(page, row + '.grip')).toEqual({ w: PHONE.grip, h: PHONE.grip });
  expect(await boxOf(page, row + '.ph-ract')).toEqual({ w: PHONE.act, h: PHONE.act });
  expect(await fontOf(page, row + '.ph-qname')).toBe(PHONE.rowFont);
  expect(await fontOf(page, '.ph-qtab')).toBe(PHONE.tabFont);
});

// The page never declares a width of its own — the phone IS the width. Nothing
// the TV gains may introduce one here.
test('the phone Queue fills the phone, uncapped', async ({ page }) => {
  await openFilmQueue(page);
  const body = await boxOf(page, 'body');
  const hero = await boxOf(page, '.qs-ph-hero');
  expect(body.w).toBe(390);
  expect(hero.w).toBe(body.w - 32);   // body padding: 16px
});
