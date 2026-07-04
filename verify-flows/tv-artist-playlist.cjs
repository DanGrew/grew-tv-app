#!/usr/bin/env node
// grew-verify golden flow — TV artist page + playlist-detail (with rail-grid render).
//
// One continuous TV journey closing three previously-❌ TV music surfaces
// (COVERAGE.md): the ARTIST page (an artist's albums, rendered by screen-rail-grid.js
// — so this snap also covers the RAIL-GRID grid renderer), and PLAYLIST-DETAIL (a
// populated TV playlist with per-track reorder/remove + the NEXT tag). Churn: FEAT-029
// (artist / album grid), TASK-262 (per-track ＋ on playlist pages), BUG-033 (NEXT tag).
//
// Playlist-detail needs a populated playlist and the catalog seeds none, so the flow
// BUILDS one the real way: from a Queen album's "Add all to playlist" → New playlist →
// name it on the d-pad keyboard → Create. The create carries addSourceType=album, so
// the new playlist opens already populated with that album's tracks (TASK-212). Each
// grew-verify run gets a fresh per-flow DB, so the playlist can't leak between runs.
const { runFlow } = require('./_harness.cjs');

const PIN = (process.env.TV_PIN || '1111').split('');
const ARTIST = 'Queen';            // a multi-album artist on the owner's real ~/rips catalog
const ALBUM = 'Made in Heaven';    // one of Queen's albums — seeds the playlist
const NAME = ['M', 'I', 'X'];      // playlist name, typed on the on-screen keyboard

runFlow({
  id: 'tv-artist-playlist',
  maskSelectors: ['#conn-status', '#device-badge'],
  setup: async (browser, base) => {
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await p.goto(base + '/app/homeview/index.html');
    await p.waitForURL(/profile\.html/, { timeout: 15000 });
    await p.locator('#btn-mom').waitFor({ timeout: 15000 });
    await p.locator('#btn-mom').click();
    for (const d of PIN) await p.locator('.key[data-key="' + d + '"]').click();
    await p.waitForURL(/browse\.html/, { timeout: 15000 });
    await p.locator('.sidebar-tab', { hasText: 'Music' }).click();
    await p.locator('.rail-title', { hasText: 'Artists' }).waitFor({ timeout: 15000 });
    return p;
  },
  steps: [
    { name: '01-artist', fn: async p => {
      // Artist page = screen-rail-grid render, so this snap covers artist + rail-grid.
      // The tile reads "💿Queen4 albums"; a bare 'Queen' also matches 'Queens of the
      // Stone Age', so anchor on the album-count digit that follows the exact name.
      await p.locator('.rail', { has: p.locator('.rail-title', { hasText: 'Artists' }) })
        .locator('.film-tile', { hasText: new RegExp(ARTIST + '\\d') }).first().click();
      await p.waitForURL(/artist\.html/, { timeout: 15000 });
      await p.locator('#grid-title').waitFor();
      await p.locator('#rail-grid .film-tile').first().waitFor();
    } },
    { name: '02-playlist-detail', fn: async p => {
      // Build a populated playlist the real way, then land on its detail page.
      await p.locator('#rail-grid .film-tile', { hasText: ALBUM }).first().click();
      await p.waitForURL(/album-detail\.html/, { timeout: 15000 });
      await p.locator('#detail-title').waitFor();
      await p.locator('#btn-add-all').click();
      await p.locator('#btn-add-create').click();
      await p.waitForURL(/playlist-create\.html/, { timeout: 15000 });
      for (const ch of NAME) await p.locator('.pl-key', { hasText: new RegExp('^' + ch + '$') }).first().click();
      await p.locator('#btn-create').click();
      await p.waitForURL(/playlist-detail\.html/, { timeout: 15000 });
      await p.locator('#detail-title').waitFor();
      await p.locator('#detail-list .detail-row').first().waitFor();
    } },
  ],
});
