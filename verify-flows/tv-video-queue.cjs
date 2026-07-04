#!/usr/bin/env node
// grew-verify golden flow — TV video-queue view, greyed Repeat pill on a
// NON-REPEATABLE source (BUG-024 / the TASK-289 blind spot).
//
// The Repeat pill in the Queue View greys + disables itself when the now-playing
// source has a single item (core/video-queue-view.js: repeatable = items.length > 1,
// repeatPill -> disabledPill). No earlier flow drives a single-item source, so the
// greyed state renders in NO snapshot — TASK-289 named this exact gap (the logic is
// unit-covered but not visually). This flow plays a FILM (one clip = non-repeatable),
// opens the Queue overlay, asserts the pill is `.is-disabled`, and snaps it. A regression
// that un-greys the pill (or greys it on a repeatable series) shows up as a diff.
const { runFlow } = require('./_harness.cjs');

const PIN = (process.env.TV_PIN || '1111').split('');
const FILM = 'Friends With Benefits'; // a single-clip film on the owner's real ~/rips catalog
// The TV plays a real fullscreen video behind the overlay; hide the element so the decoded
// frame can't make the snap nondeterministic (same trick as tv-app.cjs).
const hideVideo = p => p.evaluate(() => { const v = document.querySelector('#video'); if (v) v.style.visibility = 'hidden'; });

runFlow({
  id: 'tv-video-queue',
  maskSelectors: ['#conn-status', '#device-badge', '#sound-prompt'],
  setup: async (browser, base) => {
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await p.goto(base + '/app/homeview/index.html');
    await p.waitForURL(/profile\.html/, { timeout: 15000 });
    await p.locator('#btn-mom').waitFor({ timeout: 15000 });
    return p;
  },
  steps: [
    { name: '01-films', fn: async p => {
      await p.locator('#btn-mom').click();
      for (const d of PIN) await p.locator('.key[data-key="' + d + '"]').click();
      await p.waitForURL(/browse\.html/, { timeout: 15000 });
      await p.locator('.sidebar-tab', { hasText: 'Films' }).click();
      await p.locator('.film-tile', { hasText: FILM }).first().waitFor();
    } },
    { name: '02-playing', fn: async p => {
      await p.locator('.film-tile', { hasText: FILM }).first().click();
      await p.waitForURL(/video\.html/, { timeout: 15000 });
      await p.locator('#btn-queue').waitFor();
      await hideVideo(p);
    } },
    { name: '03-queue-repeat-disabled', fn: async p => {
      await p.locator('#btn-queue').click();
      // The proof: the Repeat pill in the overlay is greyed + disabled on this single-item source.
      await p.locator('#queue-overlay .np-pill.is-disabled', { hasText: 'Repeat' }).waitFor({ timeout: 15000 });
      await hideVideo(p);
    } },
  ],
});
