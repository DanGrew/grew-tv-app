#!/usr/bin/env node
// grew-verify golden flow — companion music, ARTIST drill: Music → Artists rail →
// artist → the artist SONG LIST (grouped by album).
//
// Sibling of companion-music.cjs (which takes the Albums rail → album detail); this
// takes the ARTISTS rail — the artist grid (companion browse `#txtgrid`), then the
// per-artist SONG LIST (companion/artist.html: every track grouped under album
// headers, newest album first). TASK-322 (FEAT-046) replaced the old per-artist
// albums grid with this song list — tapping a song drives the TV to the artist
// player from there (no companion album-detail hop; album detail is covered by
// companion-music.cjs). Picks an artist with several albums (Queen) so the grouping
// is non-trivial; navigates by title.
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
    { name: '02-artist-songs', fn: async p => {
      // Anchor 'Queen' exactly — a bare hasText 'Queen' also matches 'Queens of the Stone Age'.
      await p.locator('#txtgrid .ph-txt', { hasText: /^Queen$/ }).first().click();
      await p.waitForURL(/artist\.html/, { timeout: 15000 });
      await p.locator('#ctx-title').waitFor();
      // The song list: album headers + song rows (TASK-322).
      await p.locator('#songlist .song').first().waitFor();
      await p.locator('.album-head').first().waitFor();
    } },
  ],
});
