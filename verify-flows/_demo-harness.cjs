// Tolerant DEMO runner — the engine behind grew-demo's generated, ephemeral demo flows
// (see claude-config/verify-demo.md). Sibling of _harness.cjs: it REUSES that file's boot
// helpers (bootTv / openCompanionBrowse) and snap/mask internals, and differs only in the
// stepping discipline.
//
// _harness.runFlow is FAIL-LOUD (a missing element stops the flow and marks it FAILED) —
// correct for regression, wrong for a demo. runDemo OBSERVES: it runs each step, snaps the
// result, and on a step whose element is ABSENT on a build (e.g. an after-only affordance
// photographed on the before build) it SKIPS that shot and CONTINUES — no failure, no stop.
// A one-sided snap (new addition / removal) is expected, not an error; a symmetric skip
// (neither build shot the step) surfaces downstream as the dossier's loud "NOT CAPTURED".
// There is no pass/fail — the owner reads the before/after side-by-sides and judges.
//
// This runner is grew-tv-coupled (its boot helpers drive the companion + TV). The dossier
// renderer it feeds (claude-config/verify-demo-dossier.js) is product-neutral.
const path = require('path');
const fs = require('fs');
const { bootTv, openCompanionBrowse, DEFAULT_MASK } = require('./_harness.cjs');

async function runDemo({ id, setup, steps, maskSelectors }) {
  const APP = process.env.APP_MODULES || '/Users/dan/dan-grew-repos/grew-tv-app';
  const { chromium } = require(APP + '/node_modules/@playwright/test');
  const BASE = process.env.BASE_URL || 'http://127.0.0.1:8770';
  const OUT = process.env.OUT_DIR;
  const SIDE = process.env.SIDE || 'run';
  if (!OUT) { console.error('OUT_DIR required'); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const log = (...a) => console.log(`[${SIDE}:${id}]`, ...a);
  const masks = maskSelectors || DEFAULT_MASK;
  const done = [];

  const browser = await chromium.launch();
  let target = null;

  const snap = async (name) => {
    // Same background-attachment fix as the golden harness (a fixed gradient + fullPage
    // would leave the tail white). Snapshot-only; no effect on the live DOM.
    await target.evaluate(() => { for (const el of [document.documentElement, document.body]) el.style.backgroundAttachment = 'scroll'; });
    return target.screenshot({ path: path.join(OUT, `${id}-${name}.png`), fullPage: true, mask: masks.map(s => target.locator(s)), maskColor: '#0d1117' });
  };

  // Tolerant: act + snap; if the action can't complete on THIS build (element absent),
  // skip the shot and continue — a one-sided (new/removed) state, not a failure.
  async function step(name, fn) {
    try { await fn(target); await target.waitForTimeout(300); await snap(name); done.push({ name, shot: true }); log('✓', name); }
    catch (e) { done.push({ name, shot: false, note: e.message.split('\n')[0] }); log('–', name, '(no shot this build) —', e.message.split('\n')[0]); }
  }

  try {
    target = await setup(browser, BASE, log);
    for (const s of steps) await step(s.name, s.fn);
  } catch (e) {
    log('SETUP FAILED:', e.message.split('\n')[0]);
    done.push({ name: 'setup', shot: false, note: e.message.split('\n')[0] });
  }

  await browser.close();
  // A demo is never "failed" — passed:true keeps the dossier flow header clean. Each step
  // records whether THIS build produced a shot (a no-shot step = one-sided or symmetric).
  fs.writeFileSync(path.join(OUT, `${id}.result.json`), JSON.stringify({
    flow: id, side: SIDE, passed: true, failedAt: null,
    steps: done.map(s => ({ name: s.name, ok: true, err: s.shot ? '' : 'no shot this build (affordance absent)' })),
  }, null, 2));
  log(`${done.filter(s => s.shot).length}/${done.length} shots`);
}

module.exports = { runDemo, bootTv, openCompanionBrowse };
