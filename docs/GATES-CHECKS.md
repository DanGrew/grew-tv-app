# Style, cyclomatic complexity, and the pre-flight landmines

## Guidelines

- No framework, no build step — vanilla HTML + JS only
- HTML: inline styles only, no unused rules, no comments
- SVG: no comments, no decorative whitespace
- All UI must be d-pad navigable (arrow keys + Enter)
- Minimum font size 20px — TV viewing distance
- Focus ring: `border-color` or `outline` on `:focus` for all interactive elements
- Error element (id or class containing `error`) required in every app HTML page

## Code Patterns

**Cyclomatic complexity is capped at 1 for every function in `ui/**/*.js` and
`app/**` inline `<script>` blocks** (`scripts/check-ui-cyclomatic.js`). That
means NO branching keywords in those functions: no `if`/`else`, `for`/`while`,
ternary `?:`, or `&&`/`||`/`??`. `core/` is EXEMPT (use `if` freely there).
Express conditionals as:

```js
// branch -> boolean dispatch table (parens required as a statement)
({ true: () => doThis(), false: () => doThat() })[condition]();

// `a || fallback` -> filter+concat (|| would add complexity)
var x = [maybe].filter(Boolean).concat([fallback])[0];

// forbidden — triggers no-filter-conditional arch check
[condition].filter(Boolean).forEach(() => doThis());
[condition ? fn : null].filter(Boolean).forEach(f => f());
```

`[value].filter(Boolean).forEach(...)` for a real *value* is fine (and common);
only a bare boolean/negated-param sentinel is rejected.

Pure functions with no DOM access belong in `core/`, not `ui/` or `app/`
(`no-pure-fn-outside-core`). A function counts as "has DOM" only if it contains a
DOM token (`document`, `.style`, `.classList`, `.appendChild`, …) — an
HTML-string builder (e.g. `'<div style="…">'`, no leading dot) reads as pure, so
move shared markup helpers into `core/` (with a unit test).

## Before you edit (pre-flight)

Read this BEFORE writing screen code — these gate the PR in CI even when local
`git push` passes:

- **CI cyclomatic blocks PRE-EXISTING violations in any file you touch.** It
  classifies by filename (`git diff origin/main...HEAD`), not by which lines you
  changed. Touch a screen that already has a complexity-2 function and you must
  make it complexity-1 too. Local pre-push often passes anyway (its touched-file
  set goes empty when `origin/main` is stale) — **CI is the real gate.** Check
  with: `node scripts/check-ui-cyclomatic.js /tmp/o.txt`.
- **e2e tests assert screen behaviour.** Change or remove a screen feature and
  you must update/delete its `tests/*.test.js` (e.g. removing the resume prompt
  obsoleted `tests/screen-resume.test.js`). Mock new endpoints in
  `tests/fixtures/api.js`. e2e is CI-only; run locally with
  `npx playwright test tests/<file>.test.js` before pushing.
- **One page can be backed by SEVERAL e2e suites — grep, don't guess.** A screen's
  behaviour is often split across multiple `tests/*.test.js` by feature, not one
  file per page. The companion playlist page (`companion/playlist.html`) alone is
  covered by `companion-playlist.test.js` (rows/reorder/delete), `-track-add`,
  `-bulk-add`, `-add`, and `-create` — change the row markup and you must update
  every suite that asserts it, not just the obvious one (TASK-328 shipped a fix
  green in `companion-playlist.test.js` but red in `-track-add`). Before finishing
  a screen change, `grep -rl "<the class/id you touched>" tests/*.test.js` and run
  each hit.
- **Some screen modules are shared by more than one HTML page — any element they
  touch must be optional-safe (`[el].filter(Boolean).forEach(...)`), and you must
  run BOTH pages' e2e.** Known sharers: `screen-detail.js` (`buildDetailList` +
  the d-pad fns) backs **both** `app/homeview/detail.html` (series) AND
  `app/homeview/album-detail.html` (FEAT-018 albums reuse the series rows) — the
  album page has no `#season-chips`, so a bare `getElementById('season-chips')`
  threw and broke the music/lyrics suites. Before finishing a change to a shared
  screen, grep for every page that imports it and run each one's tests
  (`tests/screen-detail.test.js` AND `tests/music.test.js`/`tests/lyrics.test.js`
  for the detail module).
- **A detail/browse change must update the companion mirror in the SAME task.**
  Each app screen (`ui/screens/screen-*.js` + `app/homeview/*.html`) has a
  companion counterpart (`ui/screens/companion-*.js` + `companion/*.html`) that
  reuses the same `core/` logic — they are two surfaces of one feature
  (FEAT-017/028 mirror invariant: companion drives, TV mirrors). Ship both halves
  + a `tests/companion-*.test.js`. Both companion AND app-screen e2e mock the WS
  with `page.routeWebSocket(/:8766/)` so neither collides with a live server: the
  app-screen `installApi()` fixture now installs a default stub granting
  `person_active` (a test needing a scripted verdict registers its own route after
  it — most-recent-first wins). Before that default existed the app-screen e2e
  connected for real, and under parallel load collided on the shared person
  registry (`person_busy` → take-over prompt → nav never fires) — the repo-wide
  flake. Keep new app-screen suites on the fixture (don't hand-roll a live WS).
- **A companion action page keys its `/api/*` POSTs on `person`, captured in
  `onAppState` — keep that handler throw-free, or EVERY action silently no-ops.**
  Companion pages (queue, player, detail) read `state.person` from the per-person
  `app_state` snapshot in `onAppState`, then POST `…?person=<that>`. If `onAppState`
  throws BEFORE the person-capture line, `person` stays empty, the POST goes to
  `?person=` and the server drops it — so move/next/remove/play all "do nothing"
  with no error in the UI (FEAT-040 queue-fixes bug: a stray `syncBar.updateStatus`
  call threw — `mountSyncBar` returns nothing, so don't assign or call it).
  Capture person FIRST / keep `onAppState` minimal, and an e2e that asserts
  `req.url()` contains `person=<id>` guards it (an empty-person POST still 204s in
  the fixture's global state, so assert the person, not just that the POST fired).
- **A `core/` logic change ships tests that would FAIL if the logic broke —
  `core/**` is mutation-gated by Stryker (TASK-305).** Coverage proves a line ran;
  mutation proves a test *catches* a change to it. Assert the actual values and
  branches you add, not just that the code executes — a surviving mutant means a
  behaviour you left unasserted. **Always write the mutation-killing test; no
  opt-out exclusions.** Run `npm run test:mutation` for the modules you touched and
  drive their survivors to 0 before you push. (The existing backlog sweep is
  TASK-327; see [`GATES-MUTATION.md`](GATES-MUTATION.md).)

## Pre-push Hook

Runs automatically on `git push`. Checks in order:

1. **Arch checks** — layer boundaries, no DOM in core, no stray files, no pure fns outside core, etc.
2. **TV checks** — focus rings, min font size, error screen presence
3. **Cyclomatic complexity** — UI screens
4. **Unit tests** — `npm run test:unit`

E2E tests run in CI only. **Per-file `core/` coverage is a CI-only gate too** —
the `coverage` job runs `npm run test:coverage`, whose `vitest.config.js`
`coverage.thresholds` (perFile, over `core/**`) fail if any `core/` file drops
below the floor (TASK-307 replaced the old `check-untested` string-match — a real
coverage floor now enforces that every `core/` file is genuinely exercised, not
merely name-matched). It's **advisory** (a red floor never blocks a merge or a
local push); lift uncovered files via a follow-up rather than gold-plating to
green.

### Running the gates by hand

Node lives at `~/.local/node/bin` (fallback `/opt/homebrew/bin`). On Dan's dev
mac it is already on `PATH` via `~/.claude/settings.json` `env.PATH` (see
`grew-tv/docs/dev-machine-setup.md`), so just run `node`/`npx` directly. If a
shell lacks it, fall back to `export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:$PATH"`.
The pre-push hook is non-executable, so **CI is the real gate** — run the checks
yourself before pushing. `arch-check.js` and `tv-check.js` are per-rule: each
takes `<rule> <outputFile>` (bare invocation just prints usage). The canonical
rule list + exact invocations live in `.githooks/pre-push` — read it and run the
same loop, e.g.:
```bash
for r in no-dom-in-core no-ui-imports no-stray-files no-app-exports no-guard-chain \
  no-filter-conditional app-index-only no-media-outside-assets no-css-outside-styles \
  no-md-outside-docs no-json-in-repo no-pure-fn-outside-core; do
  node scripts/arch-check.js $r /tmp/$r.txt || echo "FAIL $r";
done
for r in tv-focus-rings tv-min-font-size tv-no-blank-screen; do
  node scripts/tv-check.js $r /tmp/$r.txt || echo "FAIL $r"; done
node scripts/check-ui-cyclomatic.js /tmp/cyclo.txt
npm run test:unit
npm run test:coverage   # per-file core/ coverage floor (CI `coverage` job; advisory)
```
**Cyclomatic gate false-passes on a fresh branch** (its touched-file set goes
empty when `origin/main` is stale). Verify your own edited `ui/**` files
directly instead:
```bash
npx eslint --no-eslintrc --parser-options ecmaVersion:2022,sourceType:module \
  --rule '{"complexity":["error",1]}' ui/screens/<file>.js
```
Run the relevant e2e locally too (CI-only otherwise):
`npx playwright test tests/<file>.test.js`.

**Refs:** [`GATES.md`](GATES.md) · [`GATES-TESTS.md`](GATES-TESTS.md)
