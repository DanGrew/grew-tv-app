#!/usr/bin/env node
// grew-verify golden flow — companion browse → play → breadcrumb journey.
//
// The companion is a REMOTE: its browse drill only reveals once bound to a TV
// screen, and it PLAYS by driving that TV (Control/synced mode). So setup() boots a
// TV surface (adults profile behind its PIN, so the Comedy catalog is present) and
// returns the bound companion; the steps drive it and snap at ten chosen points.
// Navigation is by TITLE (robust to reordering — same data both builds, so a
// shifted-but-present item still pairs; only a DELETED title breaks, by design).
const { runFlow, bootTv, openCompanionBrowse } = require('./_harness.cjs');

const chip = (p, row, title) => p.locator(row + ' .chip', { hasText: title }).first();
const crumb = (p, title) => p.locator('#breadcrumb .crumb-link', { hasText: title }).first();

runFlow({
  id: 'companion',
  setup: async (browser, base) => { await bootTv(browser, base); return openCompanionBrowse(browser, base); },
  steps: [
    { name: '01-browse', fn: p => p.locator('#sections-row .chip', { hasText: 'TV Series' }).first().waitFor() },
    { name: '02-tv-series', fn: async p => { await chip(p, '#sections-row', 'TV Series').click(); await chip(p, '#rails-row', 'Comedy').waitFor(); } },
    { name: '03-comedy-grid', fn: async p => { await chip(p, '#rails-row', 'Comedy').click(); await p.locator('#txtgrid .ph-txt', { hasText: 'Black Books' }).waitFor(); } },
    { name: '04-detail', fn: async p => { await p.locator('#txtgrid .ph-txt', { hasText: 'Black Books' }).first().click(); await p.waitForURL(/detail\.html/, { timeout: 15000 }); await p.locator('#ctx-title', { hasText: 'Black Books' }).waitFor(); } },
    { name: '05-video', fn: async p => { await p.locator('button').filter({ hasText: /^\s*1\.\s/ }).first().click(); await p.waitForURL(/video\.html/, { timeout: 15000 }); await p.locator('#c-toggle').waitFor(); } },
    { name: '06-paused', fn: async p => { await p.locator('#c-toggle').click(); await p.locator('#c-toggle', { hasText: '▶' }).waitFor(); } },
    { name: '07-playing', fn: async p => { await p.locator('#c-toggle').click(); await p.locator('#c-toggle', { hasText: '⏸' }).waitFor(); } },
    { name: '08-crumb-detail', fn: async p => { await crumb(p, 'Black Books').click(); await p.waitForURL(/detail\.html/, { timeout: 15000 }); await p.locator('#ctx-title', { hasText: 'Black Books' }).waitFor(); } },
    { name: '09-crumb-grid', fn: async p => { await crumb(p, 'Comedy').click(); await p.waitForURL(/browse\.html/, { timeout: 15000 }); await p.locator('#txtgrid .ph-txt', { hasText: 'Black Books' }).waitFor(); } },
    { name: '10-films', fn: async p => { await chip(p, '#sections-row', 'Films').click(); await p.locator('#rails-row .chip').first().waitFor(); } },
  ],
});
