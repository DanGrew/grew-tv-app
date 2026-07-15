# CLAUDE.md

> **Working rules (process):** this is a **code repo**; it holds grew-tv-app code
> specifics only. The shared process rules — modes, the workflow state machine,
> worktrees, draft-PR / never-merge, hand-off — live in **claude-workflow**: read
> `/Users/dan/dan-grew-repos/claude-workflow/grew-tv/CLAUDE.md` (the grew-tv entry)
> → `WAYS-OF-WORKING.md`. Don't restate them here.

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

Grouped index of the two code layers. Each app page has a TV screen
(`ui/screens/screen-*-page.js` + `app/homeview/*.html`) and usually a companion
mirror (`ui/screens/companion-*.js` + `companion/*.html`) sharing the same `core/`
logic (FEAT-017/028 mirror invariant). **Add a row here when you add a `core/`
module or a screen** — this index rots otherwise (it did).

### `core/` — pure logic (no DOM), unit-tested

**Transport / plumbing**
- `screen-registry.js` — screen registration + d-pad key dispatch
- `app-api.js` — v3 normalized-model API client (FEAT-016)
- `app-ws.js` — TV-side app WebSocket connect (`connectApp`, FEAT-026 Ph2)
- `companion-ws.js` — companion WS: targets ONE screen by `device_id` (TASK-158)
- `ws-protocol.js` — message types + device/person registries, addressed relay
- `server-config.js` — single source for the media-manager WS URL (`fetchWsUrl`)
- `companion-manifest.js` — companion manifest fetch
- `remote.js` — WS watchdog (ping/reconnect)
- `log.js` — app-side logging emitter (POST /log) + seek coalescer (TASK-213)
- `error-reporter.js` — global browser-error capture → /log (TASK-213)
- `state.js` — durable device identity (which screen this is; FEAT-026)
- `volume-store.js` — one remembered session volume, shared by both players (BUG-034)
- `time.js` — time format helpers (`pad`, `fmt`)

**Model / view helpers (pure markup + view-models)**
- `tile-model.js` — shared card view-model (TASK-116)
- `home-rails.js` — group `/api/browse` cards into titled rails (TASK-117)
- `detail-view.js` / `series-detail.js` / `seasons.js` — series-detail logic (TASK-118/123)
- `artist-tracks.js` — artist page's album-grouped song model (TASK-322)
- `search-rank.js` — search overlay: build Video/Music candidates (cards + `/api/tracks`), rank a query (exact>prefix>substring, field-weighted), render result rows (TASK-324)
- `progress.js` — watch-progress model (FEAT-017)
- `breadcrumb.js` / `nav-trail.js` — ancestor-chain + sticky nav trail (FEAT-021/032)
- `queue-view.js` / `queue-tabs.js` / `queue-crumb.js` — music Queue View (FEAT-031/039)
- `video-queue-view.js` — video Queue View model + markup (FEAT-040)
- `video-player-router.js` — persistent video-player view-router (FEAT-037)
- `player-math.js` — pure video-player render arithmetic: `progressPct` / `clampTime` / `wrapIndex` / `frameDrop` (TASK-305)
- `lrc.js` — LRC parse + rolling-frame lyric selection (FEAT-018)
- `cover-mosaic.js` — playlist cover-mosaic markup (FEAT-039)
- `playlist-name.js` / `playlist-pick.js` — create-playlist + "add to playlist" (FEAT-036)
- `playlist-row-menu.js` — companion playlist row ⋮-popover logic: `rowActions` (which chips, edge-gated) + `popoverTop` (below/flip-above placement) (TASK-328)
- `external-destinations.js` — config-driven external-destination "door" (TASK-330): the `{ id, name, icon, port, tvPath, remotePath }` list (Atlas) + `destinationUrls(dest, host)` (builds the URLs against the caller's `location.hostname`, so the door follows grew-tv's own host — Mini/localhost/LAN-IP — instead of a baked-in address, BUG-054) + `launchExternalParams` (companion→TV intent shape). Static config, no runtime fetch — grew-tv holds no atlas specifics. Rendered as the companion `#door` pill in the sync-bar (Control/Browse) row (`companion-browse.js`); the TV has **no** Atlas button — it only receives the `launchExternal` intent (`screen-browse-page.js`) and crosses itself

**Profile / device plane**
- `profile-config.js` / `profile-rows.js` — persons + PIN gate, picker layout (FEAT-026)
- `switch-profile.js` — "back to profile picker" nav target (BUG-007)
- `device-colour.js` / `device-badge.js` — per-screen device colour identity (FEAT-026)
- `screen-chooser.js` — companion screen-chooser view-model (TASK-179)
- `companion-mode.js` / `companion-button-modes.js` / `companion-utils.js` — desync mode (FEAT-038)

### `ui/screens/` — DOM screens

**TV pages** (`screen-*-page.js`, each backs `app/homeview/*.html`)
- `screen-profile-page.js` — person picker · `screen-browse-page.js` — browse
- `screen-detail-page.js` — series detail · `screen-album-detail-page.js` — album detail
- `screen-artist-page.js` — artist song list, album-grouped (FEAT-046/TASK-322; was FEAT-029 album grid) · `screen-rail-grid-page.js` — L3 poster grid (FEAT-028)
- `screen-video-page.js` — persistent video player (FEAT-037) · `screen-audio-page.js` — music player (FEAT-031)
- `screen-playlist-detail-page.js` / `screen-playlist-create-page.js` — playlists (FEAT-036)

**Shared screen modules** (imported by pages, some by two)
- `screen-detail.js` — detail render; **shared by series AND album pages** (must be element-optional-safe — see pre-flight)
- `screen-browse.js` / `screen-rail-grid.js` — browse + rail-grid render
- `screen-video-player.js` — video transport (graduated skips, auto-hide controls)
- `screen-audio-player.js` — audio transport (FEAT-018)
- `screen-queue.js` / `screen-video-queue.js` — Queue View overlays (FEAT-031/040)
- `screen-search.js` — TV search overlay (🔍): reuses the create-playlist on-screen keyboard, ranked results via `core/search-rank` (TASK-324; companion mirror lives in `companion-browse.js`)
- `screen-error.js` — error screen · `breadcrumb.js` / `device-badge.js` — trail + badge mounts

**Companion mirrors** (`companion-*.js`, back `companion/*.html`)
- `companion-profile.js` · `companion-browse.js` · `companion-detail.js`
- `companion-artist.js` · `companion-audio.js` · `companion-video.js`
- `companion-queue.js` · `companion-video-queue.js`
- `companion-playlist.js` · `companion-playlist-create.js`
- `companion-breadcrumb.js` · `companion-screen-bar.js` · `companion-sync-bar.js` · `companion-error.js`

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
  TASK-327; see Tests below and `docs/mutation-testing.md`.)

## Tests

```bash
npm run test:unit   # vitest — unit tests for core/ (run locally)
npm test            # playwright e2e — CI only; pre-push skips it
```

**Stryker mutation gate (`core/**`, TASK-305).** `npm run test:mutation` (Stryker +
vitest-runner, `stryker.conf.json`, `mutate: ["core/**/*.js"]`) mutates every `core/`
module and reruns the unit suite against each mutant; a *survivor* is a mutation no
test caught — a behaviour you didn't actually assert. **Kill every survivor with a
test.** Never exclude one as "equivalent" to move the number, and never narrow the
`mutate` glob to an include-list; if a mutant is genuinely unkillable, raise it with
the owner rather than silencing it. **As of 2026-07-14 (TASK-336) the full pass runs
*locally*, not in CI** — the `.github/workflows/mutation.yml` gate + its `mutation-gate`
issue notifier were removed; run it via the cross-repo sweep
`claude-workflow/tools/mutation-all` (or `npm run test:mutation` here directly). The 100%
target, `stryker.conf.json`, and the runner are unchanged — only the trigger moved off
Actions. The backlog survivor sweep is TASK-327. Details in `docs/mutation-testing.md`.

**Backend contract conformance (SYS-017 / TASK-311).** `tests/unit/contract-conformance.test.js`
feeds the backend's OWN frozen response fixtures (TASK-310:
`grew-tv media-manager/tests/contract/*.json`) through the app's `core/` readers
(`home-rails`, `progress`, `tile-model`, `detail-view`, `series-detail`,
`player-math`) and goes RED when a backend field the app reads is renamed/removed —
the guard against silent stub↔backend drift. The fixtures live in the **private**
`DanGrew/grew-tv`, so they are **not** committed here: CI's `contract-conformance`
job sparse-checks-them-out into the gitignored `tests/.contract/` (needs a repo
secret **`GREW_TV_CONTRACT_TOKEN`** — a read token for grew-tv; the default
`GITHUB_TOKEN` can't clone a private repo). When `tests/.contract/` is **absent**
(any local `npm run test:unit` without the checkout) the suite **skips** — CI is the
gate. Populate it locally to run it: `npm run contract:pull`.

**Stub↔contract shape conformance (SYS-017 / TASK-326).** `tests/unit/stub-contract-shape.test.js`
closes the *other* half of the drift gap: TASK-311 checks `contract → readers`, but
the e2e stub (`tests/fixtures/api.js installApi`) could still emit a wrong field name
and nothing went red. This test compares the **key-set/nesting** (not values —
content differs by design) of the objects `installApi` emits per route
(browse/continue-watching/video/album/playlist), via the pure `*Response()` builders
the route handlers delegate to, against the same-route `tests/.contract/` fixture;
any renamed/added/dropped field on either side → RED. Legitimate shape gaps are
excused **per-key with a one-line reason** (`expectShape`'s `stubOnly`/`contractOnly`
maps) — never a blanket ignore; a stale exclusion also fails. Same gitignored
`tests/.contract/` + skip-when-absent as TASK-311, run in the **same CI
`contract-conformance` job** (no second private checkout). When you add a field the
app reads to `installApi`, mirror it on the backend contract (or excuse it with a
reason) or this goes red.

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
**Reproducing multi-device/companion bugs in isolation (TASK-297 — now trivial):**
both surfaces derive their ports from the server the page was loaded from — the
API origin from `window.location.origin`, and the WS port from `/api/config.wsPort`
(via `core/server-config.js fetchWsUrl`). The companion pages
(`ui/screens/companion-*.js`) and the TV app screens (`ui/screens/screen-*-page.js`
via `core/app-ws.js connectApp`) both take the origin now — no more hardcoded
`:8765` / `WS_PORT = 8766`. So booting your own media-manager on `--port <p>
--ws-port <q>` fully isolates: every page (TV **and** companion) reaches THAT
server for HTTP + WS, and they share its device/person registry so the companion
can bind + drive the TV. No app copy / `sed` needed — just run media-manager
`--app-dir <this repo> --port <p> --ws-port <q> --content-root ~/rips` (rips has
`config.json`) and open both TV + companion on `<p>`. (`core/server-config.js`
still exports `WS_PORT = 8766` as the fetch fallback only.) Zombie instances
ignore SIGTERM — `kill -9`.

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

Process rules — worktree off `origin/main` (never branch-switch the shared
primary), `cd` into the repo/worktree before any `git` (never `git -C`, which
breaks the per-verb perm allowlist), branch naming `<topic>/<descriptor>`,
draft-PR / never-merge / commit-push-PR-autonomously, wait-for-merge,
present-PRs — live in **claude-workflow** → `WAYS-OF-WORKING.md` (via the grew-tv
entry `CLAUDE.md`). grew-tv-app specifics:

- **Fresh worktree has no `node_modules`** — symlink the primary's for gate runs
  (`ln -s ../grew-tv-app/node_modules node_modules`); `.gitignore` lists
  `node_modules` (NO trailing slash) so the symlink is ignored and `git add -A`
  won't commit it — no manual `rm` step needed.
- **Deploy:** no GitHub Pages. The app ships by updating the clone media-manager
  serves from (`--app-dir`, `~/grew-tv/repos/grew-tv-app` on the Mini) — pull
  `main` there + restart/reload. `setup-mac-mini.sh` clones it.

## Tooling

**gh CLI** path + general prompt-minimising guidance: see claude-workflow
`WAYS-OF-WORKING.md`. grew-tv-app tooling specifics:

**Node:** lives at `~/.local/node/bin` (fallback `/opt/homebrew/bin`). Already on
`PATH` via `~/.claude/settings.json` `env.PATH` on Dan's dev mac (see
`grew-tv/docs/dev-machine-setup.md`) — run `node`/`npx` directly, no `export`.
Fallback for a shell without it: `export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:$PATH"`

**Minimise permission prompts — use the native tool, not a novel shell shape.**
- **Read** files with the **Read tool** (`offset`/`limit`), not `sed -n`/`head`/
  `tail`/`cat`. **Edit / write / append** with the **Edit / Write tools**, never a
  shell write-shape (`cat >> f <<EOF`, `perl -0pi -e`, `sed -i`, `tee`, `>`/`>>`
  redirects) — those prompt AND are error-prone (heredoc/quoting slips). Applies to
  test tweaks too — Read then Edit. (Commit messages via `git commit -F -` are fine.)
- `gh pr create` is allowlisted broadly (`gh pr create:*`), so flag order doesn't
  matter — still pass `--draft` (PR convention). `git` verbs, `npx playwright/
  eslint/vitest`, `node scripts/*`, `lsof`, `ln` are allowlisted; reach for a
  native tool / allowlisted command before a one-off shell shape. Recurring
  read-only shapes with no native equivalent → propose for the global allowlist
  (`~/.claude/settings.json` + the committed `grew-tv/.claude/settings.backup.json`
  mirror), don't keep re-prompting.
