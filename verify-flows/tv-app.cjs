#!/usr/bin/env node
// grew-verify golden flow — TV app-side journey: profile → browse → detail → play.
//
// This flow drives the TV surface itself (app/homeview/*), the screens the companion
// mirrors — the biggest review surface. Unlike the companion flows there is no remote:
// the TV plays the real video, so the mask covers the <video> frame (nondeterministic
// decoded content) plus the TV's device id + live timecode/progress. Tiles are
// clickable (the d-pad is one input, not the only one), so we navigate by title like
// the companion flows.
const { runFlow } = require('./_harness.cjs');

const PIN = (process.env.TV_PIN || '1111').split('');
const crumb = (p, title) => p.locator('#breadcrumb').getByText(title, { exact: false }).first();
// The TV plays a real, fullscreen video — a nondeterministic decoded frame that also
// can't be Playwright-masked without the (fullscreen) mask box hiding the controls on
// top. So HIDE the video element instead: the transport UI stays, the frame is gone,
// and the snap is deterministic (before/after differ only by real UI changes).
const hideVideo = p => p.evaluate(() => { const v = document.querySelector('#video'); if (v) v.style.visibility = 'hidden'; });

runFlow({
  id: 'tv-app',
  // Small variable chrome still masked: device id, live timecode + progress bar, the
  // autoplay sound prompt. (The video frame is handled by hideVideo above, not a mask.)
  maskSelectors: ['#conn-status', '#device-badge', '#sound-prompt', '#time-display', '#progress-fill'],
  setup: async (browser, base) => {
    const p = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await p.goto(base + '/app/homeview/index.html');
    await p.waitForURL(/profile\.html/, { timeout: 15000 });
    await p.locator('#btn-mom').waitFor({ timeout: 15000 });
    return p;
  },
  steps: [
    { name: '01-profile', fn: p => p.locator('#btn-mom').waitFor() },
    { name: '02-browse', fn: async p => { await p.locator('#btn-mom').click(); for (const d of PIN) await p.locator('.key[data-key="' + d + '"]').click(); await p.waitForURL(/browse\.html/, { timeout: 15000 }); await p.locator('.film-tile').first().waitFor(); } },
    { name: '03-detail', fn: async p => { await p.locator('.film-tile', { hasText: 'Black Books' }).first().click(); await p.waitForURL(/detail\.html/, { timeout: 15000 }); await p.locator('#detail-title').waitFor(); } },
    { name: '04-video', fn: async p => { await p.locator('#btn-play-next').click(); await p.waitForURL(/video\.html/, { timeout: 15000 }); await p.locator('#btn-play-pause').waitFor(); await hideVideo(p); } },
    { name: '05-paused', fn: async p => { await p.locator('#btn-play-pause').click(); await p.locator('#btn-play-pause', { hasText: '▶' }).waitFor(); await hideVideo(p); } },
    { name: '06-playing', fn: async p => { await p.locator('#btn-play-pause').click(); await p.locator('#btn-play-pause', { hasText: '⏸' }).waitFor(); await hideVideo(p); } },
    { name: '07-crumb-detail', fn: async p => { await crumb(p, 'Black Books').click(); await p.waitForURL(/detail\.html/, { timeout: 15000 }); await p.locator('#detail-title').waitFor(); } },
  ],
});
