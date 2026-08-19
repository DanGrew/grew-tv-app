#!/usr/bin/env node
// Mutation gate entrypoint (TASK-305 / SYS-016), wired from `npm run test:mutation`.
//
// Bare (`npm run test:mutation`) runs the full Stryker pass over `stryker.conf.json`'s
// `mutate` glob, same as before.
//
// --changed (TASK-448, mirrors media-manager/tools/mutation-test.sh's TASK-482 shape)
// scopes the run to this branch's diff against `origin/main`, intersected with the
// already-configured `mutate` glob — never wider than what's already gated, via
// Stryker's own `--mutate` CLI override. At or under 10 files in that intersection it
// runs with no approval needed. Over 10, it stops before invoking Stryker and prints
// the count and file list — surfacing that to the owner and waiting for a go-ahead is
// the caller's job, not this script's; pass --approved once approved, to proceed at
// the larger (still diff-scoped) number.
//
// Usage:
//   npm run test:mutation
//   npm run test:mutation -- --changed [--approved]

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');

const args = process.argv.slice(2);
const CHANGED = args.includes('--changed');
const APPROVED = args.includes('--approved');
const unknown = args.filter(a => a !== '--changed' && a !== '--approved');
if (unknown.length) {
  console.error(`mutation-test.js: unknown arg(s) '${unknown.join(' ')}' (try --changed [--approved])`);
  process.exit(2);
}

function globToRegExp(glob) {
  // Supports **/ (zero or more path segments), ** (anything) and * (any run
  // of non-slash chars) — enough for stryker.conf.json's mutate globs, e.g.
  // "core/**/*.js" matching both "core/player-math.js" and "core/a/b.js".
  // Tokenise the glob operators first (order matters: **/ before **, then *)
  // so the literal-char escape pass can't mangle them, then substitute each
  // token for its regex form.
  const GLOBSTAR_SLASH = ' A ';
  const GLOBSTAR = ' B ';
  const STAR = ' C ';
  const tokenised = glob
    .split('**/').join(GLOBSTAR_SLASH)
    .split('**').join(GLOBSTAR)
    .split('*').join(STAR);
  const escaped = tokenised.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const re = escaped
    .split(GLOBSTAR_SLASH).join('(?:.*/)?')
    .split(GLOBSTAR).join('.*')
    .split(STAR).join('[^/]*');
  return new RegExp(`^${re}$`);
}

function runStryker(mutateOverride) {
  const strykerArgs = ['run'];
  if (mutateOverride) {
    strykerArgs.push('--mutate', mutateOverride.join(','));
  }
  const result = spawnSync('node_modules/.bin/stryker', strykerArgs, { stdio: 'inherit' });
  process.exit(result.status === null ? 1 : result.status);
}

if (!CHANGED) {
  runStryker(null);
}

const { mutate: mutateGlobs } = JSON.parse(fs.readFileSync('stryker.conf.json', 'utf8'));
const patterns = mutateGlobs.map(globToRegExp);

const diffFiles = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const onlyMutate = diffFiles.filter(f => patterns.some(re => re.test(f)));

if (onlyMutate.length === 0) {
  console.log('mutation-test.js --changed: no changed file is in the mutated set — nothing to mutate.');
  process.exit(0);
}

console.log(`mutation-test.js --changed: ${onlyMutate.length} changed file(s) in the mutated set: ${onlyMutate.join(' ')}`);

if (onlyMutate.length > 10 && !APPROVED) {
  console.log('');
  console.log(`MUTATION GATE: needs approval — ${onlyMutate.length} changed files is over the 10-file cap.`);
  console.log(`Files: ${onlyMutate.join(' ')}`);
  console.log('Surface this to the owner; re-run with --changed --approved once approved (still');
  console.log('diff-scoped, never a full/unscoped sweep).');
  process.exit(1);
}

runStryker(onlyMutate);
