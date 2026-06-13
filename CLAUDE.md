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
- `core/telemetry-schema.js` — telemetry event schema
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

## Tests

```bash
npm run test:unit   # vitest — unit tests for core/ (run locally)
npm test            # playwright e2e — CI only; pre-push skips it
```

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

Node is not on PATH — it lives at `~/.local/node/bin` (fallback `/opt/homebrew/bin`):
```bash
export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:$PATH"
```
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

**After app work in a worktree, surface the run command.** When you finish a
change on a worktree branch, END your summary with the exact command for the
user to run it locally against THAT worktree — `media-manager.py` with
`--app-dir <app-worktree-path>` (the user can't `git checkout` your worktree
branch, so point the server at the path instead):
```bash
python3 media-manager/core/media-manager.py \
  --app-dir /Users/dan/dan-grew-repos/<your-app-worktree-dir> \
  --content-root ~/rips
```
Run from the `grew-tv` repo root. Default ports 8765/8766 collide with the user's
live instance — note they must stop that first. Then the app URL:
`http://localhost:8765/app/homeview/profile.html`.

**If the change ALSO touches the backend in a `grew-tv` worktree, run
`media-manager.py` from THAT worktree, not primary.** `media-manager.py` is the
backend — running primary `grew-tv` serves the old backend, so a co-dependent
backend change (new API field, etc.) won't be exercised. Point the script at the
backend worktree by absolute path:
```bash
python3 /Users/dan/dan-grew-repos/<your-grew-tv-worktree-dir>/media-manager/core/media-manager.py \
  --app-dir /Users/dan/dan-grew-repos/<your-app-worktree-dir> \
  --content-root ~/rips
```

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
symlink the primary's for gate runs, but `rm` it before `git add -A` so the
ignore miss (`node_modules/` with a slash) doesn't commit the symlink.
**Branching:** off `main`. Naming: `<topic>/<descriptor>` — e.g. `feat/task-012-resume-screen`.
**PRs:** Always draft (`--draft`), one per logical unit. Merge target: `main`.
**Deploy:** no GitHub Pages. The app ships by updating the clone media-manager serves from (`--app-dir`, `~/grew-tv/repos/grew-tv-app` on the Mini) — pull `main` there + restart/reload. `setup-mac-mini.sh` clones it.

## Tooling

**gh CLI:** not on PATH in bash — always use full path.
- macOS (Homebrew): `/opt/homebrew/bin/gh`
- Windows: `"/c/Program Files/GitHub CLI/gh.exe"`

**Node:** not on PATH — lives at `~/.local/node/bin` (fallback `/opt/homebrew/bin`):
`export PATH="$HOME/.local/node/bin:/opt/homebrew/bin:$PATH"`
