// Shared runner for grew-verify golden flows. A flow file declares its identity, a
// setup() that boots whatever surfaces it needs and returns the page to snap, and an
// ordered list of {name, fn} steps. This runner owns everything else: the browser,
// deterministic masking, fail-loud stepping, named-snap capture, and the per-flow
// result.json. Authoring a new flow is therefore just setup + steps — no boilerplate.
//
// Env (set by grew-verify): BASE_URL, OUT_DIR (shared per side), SIDE, APP_MODULES.
// Snaps are written as <id>-<name>.png so every flow's snaps share one out dir and
// still pair by filename downstream; the flow's steps are written to <id>.result.json.
const path = require('path');
const fs = require('fs');

// The run-to-run-variable chrome masked for determinism (see companion-journey notes):
// random device id + connection status + live media timecode/progress. Default covers
// the companion pages; a flow may override for a different surface (e.g. the TV player).
const DEFAULT_MASK = ['#conn-status', '#screen-bar', '#device-badge', '#time', '#bar-fill'];

async function runFlow({ id, viewport, setup, steps, maskSelectors }) {
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
    // The companion pages theme with `background-attachment: fixed`, anchored to the
    // viewport. A `fullPage` capture stretches to the document height but the fixed
    // gradient only paints the first viewport-height, leaving the rest WHITE (content
    // there sits on semi-transparent surfaces → renders ~invisible, so long lists look
    // "cut"). Pin the background to the document before shooting so the whole page is
    // painted — snapshot-only, no effect on the flow's live-DOM assertions. (BUG-036)
    await target.evaluate(() => {
      for (const el of [document.documentElement, document.body]) el.style.backgroundAttachment = 'scroll';
    });
    return target.screenshot({
      path: path.join(OUT, `${id}-${name}.png`), fullPage: true,
      mask: masks.map(s => target.locator(s)), maskColor: '#0d1117'
    });
  };

  // Each step asserts-then-acts; a throw is recorded and STOPS the flow (fail-loud),
  // keeping the snaps taken before the break so the dossier shows how far it got.
  async function step(name, fn) {
    if (done.find(s => !s.ok)) return;
    try { await fn(target); await target.waitForTimeout(300); await snap(name); done.push({ name, ok: true }); log('✓', name); }
    catch (e) { done.push({ name, ok: false, err: e.message.split('\n')[0] }); log('✗', name, '—', e.message.split('\n')[0]); }
  }

  try {
    target = await setup(browser, BASE, log);
    for (const s of steps) await step(s.name, s.fn);
  } catch (e) {
    log('SETUP FAILED:', e.message.split('\n')[0]);
    done.push({ name: 'setup', ok: false, err: e.message.split('\n')[0] });
  }

  await browser.close();
  const passed = done.length > 0 && done.every(s => s.ok);
  const failedAt = (done.find(s => !s.ok) || {}).name || null;
  fs.writeFileSync(path.join(OUT, `${id}.result.json`), JSON.stringify({ flow: id, side: SIDE, passed, failedAt, steps: done }, null, 2));
  log(passed ? 'PASSED' : 'FAILED at ' + failedAt, `(${done.filter(s => s.ok).length}/${done.length} steps)`);
}

// ---- Shared helpers reused across companion flows ----

// Boot a TV surface and pick a profile so a catalog is present and the companion can
// bind + drive it. Adults (Mommy/1111) reaches Comedy/Music; kids profiles need no PIN.
async function bootTv(browser, base, opts = {}) {
  const profileBtn = opts.profileBtn || '#btn-mom';
  const pin = opts.pin || '1111';
  const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await tv.goto(base + '/app/homeview/index.html');
  await tv.locator(profileBtn).click({ timeout: 15000 });
  for (const d of pin.split('')) await tv.locator('.key[data-key="' + d + '"]').click();
  await tv.waitForURL(/browse\.html/, { timeout: 15000 }); // PIN auto-submits at 4 digits
  return tv;
}

// Open the companion, bound to the TV that bootTv registered, on browse.html with the
// catalog loaded — the common start point for companion journeys.
async function openCompanionBrowse(browser, base) {
  const p = await (await browser.newContext({ viewport: { width: 430, height: 1280 } })).newPage();
  await p.goto(base + '/companion/browse.html');
  await p.locator('#screen-bar .screen-current', { hasText: 'Screen' }).waitFor({ timeout: 15000 }); // bound
  await p.locator('#sections-row .chip').first().waitFor({ timeout: 15000 }); // catalog loaded
  return p;
}

module.exports = { runFlow, bootTv, openCompanionBrowse, DEFAULT_MASK };
