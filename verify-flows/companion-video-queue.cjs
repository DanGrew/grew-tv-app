#!/usr/bin/env node
// grew-verify golden flow — companion video-queue view, greyed Repeat button on a
// NON-REPEATABLE source (BUG-024 / the TASK-289 blind spot), phone mirror of
// tv-video-queue.cjs.
//
// The companion Video Queue View mirrors the TV overlay off the SAME snapshot
// (core/video-queue-view.js: phRepeatBtn -> phDisabledRepeat when repeatable is false).
// As with the TV side, no earlier flow drives a single-item source, so the greyed
// `.ph-tbtn.is-disabled` state renders in no snapshot. This flow plays a FILM (one clip)
// through the companion, opens its Video Queue View, asserts the Repeat button is
// disabled, and snaps it.
const { runFlow, bootTv, openCompanionBrowse } = require('./_harness.cjs');

const FILM = 'Friends With Benefits'; // single-clip romcom on the owner's real ~/rips catalog

runFlow({
  id: 'companion-video-queue',
  setup: async (browser, base) => { await bootTv(browser, base); return openCompanionBrowse(browser, base); },
  steps: [
    { name: '01-romcom', fn: async p => {
      await p.locator('#sections-row .chip', { hasText: 'Films' }).first().click();
      // Companion Films is genre-railed — the grid is empty until a genre chip is picked.
      await p.locator('#rails-row .chip', { hasText: 'Romcom' }).first().click();
      await p.locator('#txtgrid .ph-txt', { hasText: FILM }).first().waitFor();
    } },
    { name: '02-playing', fn: async p => {
      await p.locator('#txtgrid .ph-txt', { hasText: FILM }).first().click();
      await p.waitForURL(/video\.html/, { timeout: 15000 });
      await p.locator('#c-queue').waitFor();
    } },
    { name: '03-queue-repeat-disabled', fn: async p => {
      await p.locator('#c-queue').click();
      await p.waitForURL(/video-queue\.html/, { timeout: 15000 });
      // The proof: the Repeat transport button is greyed + disabled on this single-item source.
      await p.locator('.ph-tbtn.is-disabled[aria-label="Repeat"]').waitFor({ timeout: 15000 });
    } },
  ],
});
