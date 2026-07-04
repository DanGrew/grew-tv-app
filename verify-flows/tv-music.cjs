#!/usr/bin/env node
// grew-verify golden flow — TV app-side MUSIC journey: profile → Music tab → album
// detail → play audio → player play/pause.
//
// Sibling of tv-app.cjs (which covers the video path); this drives the TV's music
// surfaces the companion mirrors — the Music-tab rails, album-detail, and the audio
// player — none of which any earlier flow snapped (COVERAGE.md: TV audio + album-detail
// were ❌). Like tv-app there is no remote: the TV plays the real audio, so the mask
// covers the run-variable chrome — device id, live timecode + progress bar, and the
// ambient lyrics region (it scrolls with the decoded playback position, so it differs
// frame-to-frame and can't be snapped deterministically). Tiles are clickable, so we
// navigate by title like the other flows.
const { runFlow } = require('./_harness.cjs');

const PIN = (process.env.TV_PIN || '1111').split('');
const ALBUM = '…Like Clockwork'; // a lyrics-bearing album on the owner's real ~/rips catalog

runFlow({
  id: 'tv-music',
  // Variable chrome masked: device id, the sound-autoplay prompt, live timecode +
  // progress fill, and the ambient lyric lines (position-driven, nondeterministic).
  maskSelectors: ['#conn-status', '#device-badge', '#sound-prompt', '#time-display', '#progress-fill', '#amb-lyrics'],
  setup: async (browser, base) => {
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await p.goto(base + '/app/homeview/index.html');
    await p.waitForURL(/profile\.html/, { timeout: 15000 });
    await p.locator('#btn-mom').waitFor({ timeout: 15000 });
    return p;
  },
  steps: [
    { name: '01-profile', fn: p => p.locator('#btn-mom').waitFor() },
    { name: '02-music', fn: async p => {
      await p.locator('#btn-mom').click();
      for (const d of PIN) await p.locator('.key[data-key="' + d + '"]').click();
      await p.waitForURL(/browse\.html/, { timeout: 15000 });
      await p.locator('.sidebar-tab', { hasText: 'Music' }).click();
      await p.locator('.rail-title', { hasText: 'Albums' }).waitFor({ timeout: 15000 });
      await p.locator('.rail', { has: p.locator('.rail-title', { hasText: 'Albums' }) }).locator('.film-tile').first().waitFor();
    } },
    { name: '03-album-detail', fn: async p => {
      await p.locator('.rail', { has: p.locator('.rail-title', { hasText: 'Albums' }) }).locator('.film-tile', { hasText: ALBUM }).first().click();
      await p.waitForURL(/album-detail\.html/, { timeout: 15000 });
      await p.locator('#detail-title').waitFor();
      await p.locator('.detail-row').first().waitFor();
    } },
    { name: '04-audio', fn: async p => {
      await p.locator('#btn-play-next').click();
      await p.waitForURL(/audio\.html/, { timeout: 15000 });
      await p.locator('#btn-play-pause').waitFor();
      await p.locator('#audio-title').waitFor();
    } },
    { name: '05-paused', fn: async p => { await p.locator('#btn-play-pause').click(); await p.locator('#btn-play-pause', { hasText: '▶' }).waitFor(); } },
    { name: '06-playing', fn: async p => { await p.locator('#btn-play-pause').click(); await p.locator('#btn-play-pause', { hasText: '⏸' }).waitFor(); } },
  ],
});
