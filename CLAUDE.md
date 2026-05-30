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

## Repository Structure

- `index.html` — redirect to app/
- `app/homeview/` — main browse + playback UI
- `poc/` — proof of concept pages (reference only)

## Guidelines

- No framework, no build step — vanilla HTML + JS only
- HTML: inline styles only, no unused rules, no comments
- SVG: no comments, no decorative whitespace
- All UI must be d-pad navigable (arrow keys + Enter)
- Minimum font size 36px — TV viewing distance
- Focus ring: 4px solid yellow on all interactive elements
- on-screen errors always — never a blank screen

## Content

App fetches content from `http://localhost:8080/manifest.json`. Content schema defined in `grew-tv` private repo.

## Git and GitHub

**Branching:** Feature branches off `main`. Naming: `<topic>-<descriptor>`.
**PRs:** Always draft (`--draft`), one per logical unit. Merge target: `main`.
**GitHub Pages:** served from `main` branch root.

## Tooling

**gh CLI:** not on PATH in bash — always use full path: `"/c/Program Files/GitHub CLI/gh.exe"`
