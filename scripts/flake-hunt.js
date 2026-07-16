#!/usr/bin/env node
//
// TASK-329 — the e2e flake hunt, run LOCALLY on demand (`npm run test:flake`).
//
// The e2e suite answers "does it pass?". This answers a stricter question: "is
// every test DETERMINISTICALLY green under parallel load?" It runs the WHOLE
// suite N times over with retries OFF, so a test that only survives on a retry —
// the BUG-019 settle-signal family this repo keeps re-growing — is caught and
// NAMED instead of masked.
//
// Same trigger model as the Stryker mutation sweep (TASK-336): on-demand and
// local, not a CI job. It is a hunt, not a gate — nothing merges or breaks on it.
//
// WHY IT OVERSUBSCRIBES THE WORKERS. The flake is a *load* phenomenon, so the
// hunt is only as good as the contention it creates. Playwright defaults to half
// your cores, which on a fast dev mac is nowhere near enough: TASK-329's own run
// went 1569/1569 green locally at the default while CI's small 2-core runners
// named a real flake (BUG-055) on the same commit. So we default to one worker
// per core (2x Playwright's default) to oversubscribe the box and squeeze the
// settle-signal gaps out. Crank it higher to hunt harder.
//
// Usage:
//   npm run test:flake                      # whole suite x3, workers = cores
//   npm run test:flake -- --repeat 5        # hunt harder (more repeats)
//   npm run test:flake -- --workers 16      # hunt harder (more contention)
//   npm run test:flake -- tests/foo.test.js # scope it while chasing one suite
//
// Anything after the flags is passed through to `playwright test`, so you can
// scope to a file while investigating. The DEFAULT is the whole suite via
// Playwright's own testDir discovery — no curated list to rot (WAYS: gates are
// opt-out, not opt-in).

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function parseArgs(argv) {
  const opts = { repeat: 3, workers: os.cpus().length, passthrough: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--repeat' || arg === '--repeat-each') opts.repeat = Number(argv[++i]);
    else if (arg === '--workers') opts.workers = Number(argv[++i]);
    else opts.passthrough.push(arg);
  }
  return opts;
}

// The report goes to the OS temp dir, never the repo — `no-json-in-repo` (and a
// stray report is noise in `git status`).
function reportPath() {
  return path.join(os.tmpdir(), `grew-flake-hunt-${process.pid}.json`);
}

// A spec is every (test x repeat) run of one test. `ok: false` means at least one
// repeat failed — i.e. NOT deterministically green. That is exactly the finding.
function collectSpecs(suite, out) {
  (suite.specs || []).forEach(spec => out.push(spec));
  (suite.suites || []).forEach(child => collectSpecs(child, out));
  return out;
}

// `--repeat-each=N` reports each repeat as its OWN spec (…-repeat1, …-repeat2), so
// the raw spec list counts one test N times. Fold them back onto their identity —
// file:line:title — or the digest reads "3 flaky tests, each failed 1 of 1 run"
// when the truth is "1 test failed 3 of 3". Aggregating is also what tells you
// WHICH kind of problem you have: failed 3 of 3 is deterministic at this
// contention, 1 of 3 is a genuine coin-flip.
function fold(specs) {
  const byTest = new Map();
  specs.forEach(spec => {
    const key = `${spec.file}:${spec.line}:${spec.title}`;
    const entry = byTest.get(key) || { title: spec.title, file: spec.file, line: spec.line, runs: 0, failures: 0 };
    (spec.tests || []).forEach(t => (t.results || []).forEach(r => {
      entry.runs += 1;
      if (r.status !== 'passed') entry.failures += 1;
    }));
    byTest.set(key, entry);
  });
  return Array.from(byTest.values());
}

function readFindings(file) {
  if (!fs.existsSync(file)) return null;
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const specs = (report.suites || []).reduce((acc, s) => collectSpecs(s, acc), []);
  const tests = fold(specs);
  const flaky = tests.filter(t => t.failures > 0)
    .sort((a, b) => b.failures - a.failures || a.file.localeCompare(b.file));
  return { total: tests.length, flaky };
}

function report(findings, opts) {
  console.log('\n' + '─'.repeat(72));
  if (!findings) {
    console.log('FLAKE HUNT — no report produced; the run itself failed to start.');
    return 1;
  }
  if (!findings.flaky.length) {
    console.log(`FLAKE HUNT — clean. ${findings.total} tests x${opts.repeat}, ` +
                `${opts.workers} workers, retries off: all deterministically green.`);
    console.log('Note: a clean local hunt is evidence, not proof — CI\'s smaller runners');
    console.log('create contention a dev mac cannot. Raise --workers/--repeat to hunt harder.');
    return 0;
  }
  console.log(`FLAKE HUNT — ${findings.flaky.length} of ${findings.total} tests not ` +
              `deterministically green (${opts.repeat}x, ${opts.workers} workers):\n`);
  findings.flaky.forEach(f => {
    console.log(`  ✗ ${f.file}:${f.line}`);
    console.log(`    ${f.title}`);
    console.log(`    failed ${f.failures} of ${f.runs} runs\n`);
  });
  console.log('These are settle-signal gaps, not app bugs (see CLAUDE.md → "residual flake").');
  console.log('Fix by awaiting the real settle signal — never --retries, never a longer timeout,');
  console.log('never a skip. If you are not fixing it now, raise a follow-up so it is not lost.');
  return 1;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const json = reportPath();
  const args = [
    'playwright', 'test',
    `--repeat-each=${opts.repeat}`,
    '--retries=0',
    `--workers=${opts.workers}`,
    // dot, not line: a whole-suite hunt is ~1.5k cases, and one progress LINE each
    // buries the digest below. One char each still shows it moving.
    '--reporter=dot,json'
  ].concat(opts.passthrough);

  console.log(`Hunting flakes: whole suite x${opts.repeat}, ${opts.workers} workers, retries off.`);
  console.log('This oversubscribes the box on purpose — expect it to be slow and loud.\n');

  spawnSync('npx', args, {
    stdio: 'inherit',
    env: Object.assign({}, process.env, {
      PLAYWRIGHT_JSON_OUTPUT_NAME: json,
      // Hush the static server's per-request stderr log — over a whole-suite hunt
      // it is ~9MB of noise that buries the report (see playwright.config.js).
      GREW_HUSH_WEBSERVER: '1'
    })
  });

  const findings = readFindings(json);
  const code = report(findings, opts);
  fs.rmSync(json, { force: true });
  process.exit(code);
}

main();
