# CLAUDE.md

## Project

grew-tv-app — public GitHub Pages web app for the Grew family home video system. Browse and play personal DVD collection served from a local file server (localhost:8080) running on a Mac Mini or equivalent device.

**Live URL:** `https://dangrew.github.io/grew-tv-app/`

## Architecture

```
TV (HDMI) ← Mac Mini running Chrome in kiosk mode
                → loads this GitHub Pages app
                → fetches videos from http://localhost:8080
                   (Ruby file server serving USB drive)
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

Boolean dispatch table — not `if/else`:
```js
// correct
{ true: () => doThis(), false: () => doThat() }[condition]();

// forbidden — triggers no-filter-conditional arch check
[condition].filter(Boolean).forEach(() => doThis());
[condition ? fn : null].filter(Boolean).forEach(f => f());
```

Pure functions with no DOM access belong in `core/`, not `ui/` or `app/`.

## Tests

```bash
npm run test:unit   # vitest — unit tests for core/ (run locally)
npm test            # playwright e2e — CI only; pre-push skips it
```

## Pre-push Hook

Runs automatically on `git push`. Checks in order:

1. **Arch checks** — layer boundaries, no DOM in core, no stray files, no pure fns outside core, etc.
2. **TV checks** — focus rings, min font size, error screen presence
3. **Untested check** — every `core/` file referenced in `tests/unit/`
4. **Cyclomatic complexity** — UI screens
5. **Unit tests** — `npm run test:unit`

E2E tests run in CI only.

## Local Dev

Open `app/homeview/index.html` directly in a browser. It fetches `http://localhost:8080/manifest.json`.

Mock the content server:
```bash
python3 -m http.server 8080   # run from a directory containing manifest.json
```

## Content

App fetches content from `http://localhost:8080/manifest.json`. Content schema defined in `grew-tv` private repo.

## Git and GitHub

**Branching:** Feature branches off `main`. Naming: `<topic>/<descriptor>` — e.g. `feat/task-012-resume-screen`.
**PRs:** Always draft (`--draft`), one per logical unit. Merge target: `main`.
**GitHub Pages:** served from `main` branch root.

## Tooling

**gh CLI:** not on PATH in bash — always use full path: `"/c/Program Files/GitHub CLI/gh.exe"`
