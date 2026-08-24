# Local dev — running the app, git, and tooling

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

## Git and GitHub

Process rules — worktree off `origin/main` (never branch-switch the shared
primary), `cd` into the repo/worktree before any `git` (never `git -C`, which
breaks the per-verb perm allowlist), branch naming `<topic>/<descriptor>`,
draft-PR / never-merge / commit-push-PR-autonomously, wait-for-merge,
present-PRs — live in **claude-workflow** → `docs/WAYS.md` (via the grew-tv
entry `CLAUDE.md`, `claude-config/grew-product-dir grew-tv`). grew-tv-app specifics:

- **Fresh worktree has no `node_modules`** — run `npm ci` in the worktree before
  any gate run. A symlink to the primary's looks cheaper but has bitten twice
  (TASK-517): worktrees live in `grew-tv-app-worktrees/<name>/`, NOT beside the
  primary, so the `../grew-tv-app/node_modules` relative path silently resolves
  to nothing, and the primary's own `node_modules` is often empty (it never runs
  the gates — worktrees do). Symlink only after checking the target exists and is
  populated, at an absolute path. `.gitignore` lists `node_modules` (NO trailing
  slash) so either shape is ignored and `git add -A` won't commit it — no manual
  `rm` step needed.
- **Deploy:** no GitHub Pages. The app ships by updating the clone media-manager
  serves from (`--app-dir`, `~/grew-tv/repos/grew-tv-app` on the Mini) — pull
  `main` there + restart/reload. `setup-mac-mini.sh` clones it.

## Tooling

**gh CLI** path + general prompt-minimising guidance: see claude-workflow
`docs/WAYS-NORMS.md`. grew-tv-app tooling specifics:

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

**Refs:** [`../CLAUDE.md`](../CLAUDE.md)
