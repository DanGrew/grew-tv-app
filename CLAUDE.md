# CLAUDE.md

## Project

grew-tv-app — browse + play web app for the Grew family home video system. Static files (HTML/JS/CSS) **served by the media-manager backend** (in the `grew-tv` repo) over the LAN — the same server also serves the API and the media. Not GitHub Pages; not a separate file server.

**How it's served:** media-manager runs `--app-dir <clone-of-this-repo>` (default `~/grew-tv/repos/grew-tv-app` on the Mini) and serves the app, `/api/*`, and `/media/*` all from one origin on `:8765`. The app derives `serverUrl` from its own origin (TASK-133/134) and fetches `/api/*` same-origin — no hardcoded host or port.

## Architecture

```
TV (HDMI) ← 2014 Mac Mini (client) running Chrome in kiosk mode
                → loads this app from the server Mini's LAN address
Apple Silicon Mac Mini (server, wired) runs media-manager on :8765
                → serves the app (--app-dir), /api/*, and /media/* from one origin
                → media files live locally at ~/grew-tv/media
```

## Layer Structure

| Layer | Path | Rules |
|-------|------|-------|
| Core logic | `core/` | Pure JS only — no DOM, no UI imports. Every file must have a unit test in `tests/unit/` or pre-push blocks. |
| Screen components | `ui/screens/` | DOM allowed. No pure functions (move those to `core/`). One file per screen. |
| App entry | `app/homeview/` | HTML files only — no `.js`, `.css`, or media files (arch check enforces). |
| Content fixtures | `content/state/` | JSON state files: browse, detail, error, index, profile, video. |
| Companion remote | `companion/` | HTML only. |

## Key Files

- `core/screen-registry.js` — screen registration and d-pad key dispatch
- `core/log.js` — app-side logging emitter (POST /log) + seek coalescer (TASK-213)
- `core/error-reporter.js` — global browser-error capture → /log (TASK-213)
- `core/ws-protocol.js` — WebSocket protocol (companion ↔ app)
- `core/time.js` — time utilities
- `ui/screens/screen-browse.js` — content grid browse screen
- `ui/screens/screen-detail.js` — content detail / info screen
- `ui/screens/screen-video.js` — video playback screen
- `ui/screens/screen-profile.js` — profile selection screen
- `ui/screens/screen-error.js` — error screen

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

## Tests

```bash
npm run test:unit   # vitest — unit tests for core/ (run locally)
npm test            # playwright e2e — CI only; pre-push skips it
```

**Verify touched suites, not the whole world — CI is the gate.** When checking
a change locally, run the **touched + directly-relevant** e2e suites only
(`npx playwright test tests/<file>.test.js`). Do NOT re-run the full e2e suite
for confidence: it is slow and the repo carries a **pre-existing repo-wide
`toBeVisible` focus/nav flake** that fails ~75 unrelated tests under parallel
load but passes them in isolation. So **green-in-isolation + red-under-parallel
≠ a regression** — classify a suspicious failure with `--workers=1` (and/or
`--retries=2`, which tags flaky-vs-failed) before treating it as real, and
reason about whether your diff can even reach the failing suite. Re-running the
full suite repeatedly to "make sure" wastes time and tokens for no signal.

**The residual flake is a test-side settle-signal gap, not an app bug (BUG-019,
diagnosed 2026-06-28).** TASK-126 already killed the dominant cause (the live-WS
person-lock collision — the `installApi` default `person_active` stub). What
remained were tests that assert before the screen actually settles. Two confirmed
mechanisms, both fixed in `player-reset` / `playlist-bulk-add`:
- **Auto-hide timer disarms a control mid-test.** The video player hides
  `#controls` 3s after the last input (`screen-video-player.js showControls`);
  when they hide, a focused button blurs. The video Reset tests armed `#btn-reset`
  then asserted `Reset?` — under load the 3s elapsed first, blur fired, the button
  disarmed back to `Reset`. **Fix: press a d-pad key (`ArrowDown`) right before
  arming** to re-kick the timer — exactly what the audio Reset tests already do.
- **Interacting before init wires the handlers.** A nav helper that awaits only
  `toHaveURL` lets the test click a header button (`#btn-add-all`) before the
  page's async load → `buildDetailList` has attached its click listener; the click
  is a silent no-op and the sheet never opens. **Fix: await a render signal that
  proves init finished** (e.g. `.detail-row` first row visible), like the
  `openAlbum` helper does — never `toHaveURL`-then-interact.
Rule for new suites: **await the real post-nav settle signal (a rendered row /
the element you're about to use), never just the URL; and keep auto-hiding player
controls alive with a key press before interacting.** Don't paper over either
with `--retries`.

**Running e2e from a secondary worktree — use your own port.** The Playwright
`webServer` is a `python3 -m http.server 3456` with `reuseExistingServer` on
(non-CI). If another worktree/session already has a server on `:3456`, your run
**reuses it** — and that server serves the *other* worktree's files, so your
tests (and any screenshots) silently exercise the wrong branch's code, often
still "passing". Two worktrees running e2e at once both hit the one `:3456`
tree. When a concurrent session may be testing, run e2e/screenshots from one
worktree at a time, or stand up your own `python3 -m http.server <port>` in your
worktree root and `page.goto('http://localhost:<port>/…')` with absolute URLs.

## Pre-push Hook

Runs automatically on `git push`. Checks in order:

1. **Arch checks** — layer boundaries, no DOM in core, no stray files, no pure fns outside core, etc.
2. **TV checks** — focus rings, min font size, error screen presence
3. **Untested check** — every `core/` file referenced in `tests/unit/`
4. **Cyclomatic complexity** — UI screens
5. **Unit tests** — `npm run test:unit`

E2E tests run in CI only.

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
node scripts/check-untested.js
npm run test:unit
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

## Local Dev

**App (`app/homeview/index.html`):** don't open via `file://` — it derives `serverUrl` from its origin and fetches `/api/*` same-origin, so it must be served by media-manager (see the `--app-dir` command below).

**Companion (`companion/`):** must be served over HTTP — ES modules require it.

**After app work in a worktree, surface ONE run command that works against your
worktree(s) — never tell the user to pull, switch, or run `main`.** END your
summary with a single copy-paste `media-manager.py` invocation using ABSOLUTE
worktree paths (the user can't `git checkout` your branch — point the server at
the path). Pick the backend path by one rule:

- **App-only task** (no backend change this session) → run `media-manager.py`
  from the **primary `grew-tv`** checkout. `--app-dir` = your app worktree.
- **Cross-repo task** (you also changed the backend in a `grew-tv` worktree —
  whether or not that PR is merged yet) → run `media-manager.py` from the
  **backend worktree** by absolute path, so the new API field/route is actually
  served. `--app-dir` = your app worktree.

```bash
# cross-repo: backend worktree serves, app worktree is the UI
python3 /Users/dan/dan-grew-repos/<your-grew-tv-worktree-dir>/media-manager/core/media-manager.py \
  --app-dir         /Users/dan/dan-grew-repos/<your-app-worktree-dir> \
  --manifest-dir    ~/dan-grew-repos/grew-tv-state/manifests \
  --content-root    ~/rips \
  --state-repo-dir  /tmp/grew-state
```

Always pass all four flags (this exact shape):
- `--app-dir <app-worktree>` — serve the UI under test.
- `--manifest-dir ~/dan-grew-repos/grew-tv-state/manifests` — the real catalog
  (the defaults point at the Mini's `~/grew-tv/...`, which is empty on the dev
  mac → no content, no repro).
- `--content-root ~/rips` — the media files.
- `--state-repo-dir /tmp/grew-state` — a THROWAWAY state checkout so the boot
  progress round-trip can't pollute the user's real `grew-tv-state`.

NEVER hand the user a `git pull`/`git checkout`/"run from primary on updated
main" step. If the backend lives in a worktree, serve from that worktree — even
after it merges, because primary may be stale. Always note: stop the live
:8765/:8766 server first; then the app URL is
`http://localhost:8765/app/homeview/profile.html` (companion at
`http://localhost:8765/companion/`).

Preferred — use `media-manager.py` from the `grew-tv` repo (serves app + WebSocket server together):
```bash
python3 media-manager/core/media-manager.py --app-dir <path-to-grew-tv-app> --content-root ~/rips
# Companion at http://localhost:8765/companion/
# WebSocket at ws://localhost:8766
```
**Reproducing multi-device/companion bugs in isolation:** `core/server-config.js`
**hardcodes `WS_PORT = 8766`** (the app ignores `/api/config.wsPort`), so booting
your own media-manager on a different `--ws-port` does NOT isolate — pages still
open `ws://host:8766` and register on the live registry (stale devices +
`person_busy` lock contention). To truly isolate: copy the app
(`rsync -a --exclude node_modules --exclude .git`), `sed WS_PORT 8766→<your-port>`
in the copy's `core/server-config.js`, run media-manager `--app-dir <copy>
--ws-port <your-port> --content-root ~/rips` (rips has `config.json`), and assert
every page's WS url uses your port. Zombie instances ignore SIGTERM — `kill -9`.

Standalone (no WebSocket — UI only):
```bash
# run from grew-tv-app repo root
python3 -m http.server 3000   # then open http://localhost:3000/companion/
```
Do NOT run server from inside `companion/` — module imports (`../ui/screens/`) will 404.

To run the app **with real content**, use media-manager `--app-dir` (the
`--app-dir` command above) — a plain `http.server` can't serve the `/api/*`
endpoints the app fetches, so it's UI-only.

## Content

App fetches content from media-manager's `/api/*` endpoints, same-origin
(`serverUrl` is derived from the page origin — no hardcoded host/port). Content
schema defined in the `grew-tv` private repo.

## Git and GitHub

**All dev happens in a `git worktree`, never on a branch in the primary checkout.**
The primary checkout (`/Users/dan/dan-grew-repos/grew-tv-app`) is shared by
concurrent Claude sessions and the user's live `--app-dir` server, and it stays
on `main`. For ANY change — feature, fix, doc — create a dedicated worktree off
`origin/main` and work there:
```bash
git worktree add ../grew-tv-app-<topic>-wt origin/main -b <topic>/<descriptor>
```
Do NOT `git checkout -b`/branch-switch the primary tree. (A worktree pins HEAD
per directory, so a stash/checkout slip can't silently drop your commit onto
`main` in the shared tree — that exact failure happened once on the old
"plain branch in primary" convention.) A fresh worktree has no `node_modules` —
symlink the primary's for gate runs (`ln -s ../grew-tv-app/node_modules
node_modules`); `.gitignore` lists `node_modules` (NO trailing slash) so the
symlink is ignored and `git add -A` won't commit it — no manual `rm` step needed.

**`cd` into the repo/worktree before any `git` — never `git -C <path>`.** A
session's cwd starts at `/Users/dan` (above the repos), but the perm allowlist
grants granular per-verb git rules (`Bash(git fetch:*)`, `Bash(git worktree
add:*)`, `Bash(git commit:*)`, …). Inserting `-C <path>` between `git` and the
verb breaks prefix-matching (`git -C /p fetch` ≠ `git fetch …`), so every call
then prompts. `cd` is allowlisted — so `cd` into the primary checkout to create
the worktree, then `cd` into the **worktree** and run bare git verbs there (commit
/ push / status all match their rules, no `-C`, no prompts). Same for `gh`.
**Branching:** off `main`. Naming: `<topic>/<descriptor>` — e.g. `feat/task-012-resume-screen`.
**PRs:** Always draft (`--draft`), one per logical unit. Merge target: `main`.
**Commit + push + open the draft PR without asking** (owner decision 2026-06-27).
Once a change is built and its gates pass, commit, push, and open the draft PR
autonomously — do NOT pause for commit/push/PR approval (the owner reviews and
merges from the PR). Two things still hold: **WAIT for the user to merge before
starting the next task**, and always present the PR link(s) prominently at the
end of the reply.
**Deploy:** no GitHub Pages. The app ships by updating the clone media-manager serves from (`--app-dir`, `~/grew-tv/repos/grew-tv-app` on the Mini) — pull `main` there + restart/reload. `setup-mac-mini.sh` clones it.

## Tooling

**gh CLI:** not on PATH in bash — always use full path.
- macOS (Homebrew): `/opt/homebrew/bin/gh`
- Windows: `"/c/Program Files/GitHub CLI/gh.exe"`

**Node:** lives at `~/.local/node/bin` (fallback `/opt/homebrew/bin`). Already on
`PATH` via `~/.claude/settings.json` `env.PATH` on Dan's dev mac (see
`grew-tv/docs/dev-machine-setup.md`) — run `node`/`npx` directly, no `export`.
Fallback for a shell without it: `export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:$PATH"`
