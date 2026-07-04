#!/usr/bin/env node
// grew-verify golden flow — companion music, ARTIST drill: Music → Artists rail →
// artist → albums grid → album detail.
//
// Sibling of companion-music.cjs (which takes the Albums rail); this takes the ARTISTS
// rail — the artist grid, the per-artist albums grid (companion/artist.html), and an
// album's track list — none of which an earlier flow snapped (COVERAGE.md: companion
// `artist` was ❌). Churn behind it: BUG-035 (the artist self-load "No albums") and
// TASK-274 (album covers on the artist + album tiles, currently text-only — this flow
// captures the text-only baseline so the covers show up as the diff). Picks an artist
// with several albums (Queen) so the albums grid is non-trivial; navigates by title.
const { runFlow, bootTv, openCompanionBrowse } = require('./_harness.cjs');

const chip = (p, title) => p.locator('#rails-row .chip', { hasText: title }).first();

runFlow({
  id: 'companion-artist',
  setup: async (browser, base) => { await bootTv(browser, base); return openCompanionBrowse(browser, base); },
  steps: [
    { name: '01-artists', fn: async p => {
      await p.locator('#sections-row .chip', { hasText: 'Music' }).first().click();
      await chip(p, 'Artists').waitFor();
      await chip(p, 'Artists').click();
      await p.locator('#txtgrid .ph-txt').first().waitFor();
    } },
    { name: '02-artist-albums', fn: async p => {
      // Anchor 'Queen' exactly — a bare hasText 'Queen' also matches 'Queens of the Stone Age'.
      await p.locator('#txtgrid .ph-txt', { hasText: /^Queen$/ }).first().click();
      await p.waitForURL(/artist\.html/, { timeout: 15000 });
      await p.locator('#ctx-title').waitFor();
      await p.locator('#txtgrid .ph-txt').first().waitFor();
    } },
    { name: '03-album-detail', fn: async p => {
      await p.locator('#txtgrid .ph-txt').first().click();
      await p.waitForURL(/detail\.html/, { timeout: 15000 });
      await p.locator('#ctx-title').waitFor();
      await p.locator('button').filter({ hasText: /^\s*1\.\s/ }).first().waitFor();
    } },
  ],
});
