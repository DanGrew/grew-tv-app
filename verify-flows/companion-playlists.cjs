#!/usr/bin/env node
// grew-verify golden flow — companion playlists: create → view → add.
//
// Exercises the playlist surfaces: the Playlists rail grid, the create form
// (playlist-create.html), the playlist detail view (playlist.html), and the
// add-to-playlist sheet reached from an album track's ＋. Creates a fixed-named
// playlist in the flow's own fresh state (both builds create it identically, so it's
// deterministic). Navigates by title.
const { runFlow, bootTv, openCompanionBrowse } = require('./_harness.cjs');

const NAME = 'Verify Flow';
const rail = (p, title) => p.locator('#rails-row .chip', { hasText: title }).first();
const crumb = (p, title) => p.locator('#breadcrumb .crumb-link', { hasText: title }).first();

runFlow({
  id: 'playlists',
  setup: async (browser, base) => { await bootTv(browser, base); return openCompanionBrowse(browser, base); },
  steps: [
    { name: '01-music', fn: async p => { await p.locator('#sections-row .chip', { hasText: 'Music' }).first().click(); await p.locator('[data-create-playlist]').first().waitFor(); } },
    { name: '02-create-form', fn: async p => { await p.locator('[data-create-playlist]').first().click(); await p.waitForURL(/playlist-create/, { timeout: 15000 }); await p.locator('#pl-name').waitFor(); } },
    { name: '03-created', fn: async p => { await p.locator('#pl-name').fill(NAME); await p.locator('#btn-create').click(); await p.waitForURL(/browse\.html/, { timeout: 15000 }); await p.locator('#sections-row .chip', { hasText: 'Music' }).first().click(); await rail(p, 'Playlists').click(); await p.locator('#txtgrid .ph-txt', { hasText: NAME }).first().waitFor(); } },
    { name: '04-album-detail', fn: async p => { await rail(p, 'Albums').click(); await p.locator('#txtgrid .ph-txt').first().waitFor(); await p.locator('#txtgrid .ph-txt').first().click(); await p.waitForURL(/detail\.html/, { timeout: 15000 }); await p.locator('button').filter({ hasText: /^\s*1\.\s/ }).first().waitFor(); } },
    { name: '05-add-sheet', fn: async p => { await p.locator('button').filter({ hasText: /^＋$/ }).first().click(); await p.locator('#add-sheet').waitFor({ state: 'visible' }); await p.locator('#add-sheet-list', { hasText: NAME }).first().waitFor(); } },
    { name: '06-added', fn: async p => { await p.locator('#add-sheet-list').getByText(NAME, { exact: false }).first().click(); await p.locator('#add-status').waitFor({ state: 'visible' }); } },
  ],
});
// Note: `view` of the created playlist is snap 03 (grid); the album detail + add-sheet
// (04/05/06) cover the add path. A dedicated populated-playlist detail snap is a
// follow-on once playlist.html's own back-nav is sorted.
