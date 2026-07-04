#!/usr/bin/env node
// grew-verify golden flow — companion music: Albums → album → audio play → queue.
//
// Same shape as companion-journey but on the MUSIC surface: the companion browse
// Music section → Albums rail → an album's track list (detail.html) → a track's audio
// remote (audio.html), which drives the TV's audio the way the video remote drives
// the player. Uses the Albums rail (catalog-stable) + first item by position (same
// data both builds, so position is stable; only a deleted catalog breaks it).
const { runFlow, bootTv, openCompanionBrowse } = require('./_harness.cjs');

const chip = (p, title) => p.locator('#rails-row .chip', { hasText: title }).first();
const crumb = (p, title) => p.locator('#breadcrumb .crumb-link', { hasText: title }).first();

runFlow({
  id: 'music',
  setup: async (browser, base) => { await bootTv(browser, base); return openCompanionBrowse(browser, base); },
  steps: [
    { name: '01-music', fn: async p => { await p.locator('#sections-row .chip', { hasText: 'Music' }).first().click(); await chip(p, 'Albums').waitFor(); } },
    { name: '02-albums', fn: async p => { await chip(p, 'Albums').click(); await p.locator('#txtgrid .ph-txt').first().waitFor(); } },
    { name: '03-album-detail', fn: async p => { await p.locator('#txtgrid .ph-txt').first().click(); await p.waitForURL(/detail\.html/, { timeout: 15000 }); await p.locator('#ctx-title').waitFor(); await p.locator('button').filter({ hasText: /^\s*1\.\s/ }).first().waitFor(); } },
    { name: '04-audio', fn: async p => { await p.locator('button').filter({ hasText: /^\s*1\.\s/ }).first().click(); await p.waitForURL(/audio\.html/, { timeout: 15000 }); await p.locator('#c-toggle').waitFor(); } },
    { name: '05-paused', fn: async p => { await p.locator('#c-toggle').click(); await p.locator('#c-toggle', { hasText: '▶' }).waitFor(); } },
    { name: '06-playing', fn: async p => { await p.locator('#c-toggle').click(); await p.locator('#c-toggle', { hasText: '⏸' }).waitFor(); } },
    { name: '07-queue', fn: async p => { await p.locator('#c-queue').click(); await p.waitForURL(/queue\.html/, { timeout: 15000 }); await p.locator('body').waitFor(); } },
    { name: '08-back-to-player', fn: async p => { await p.getByText('Now Playing', { exact: false }).first().click(); await p.waitForURL(/audio\.html/, { timeout: 15000 }); await p.locator('#c-toggle').waitFor(); } },
  ],
});
