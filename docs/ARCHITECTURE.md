# Architecture — layers, layout, and the module index

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
- `server-config.js` — single source for the media-manager WS URL (`fetchWsUrl`) and the HTTPS door's origin (`fetchHttpsOrigin`, TASK-405)
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
- `music-video-playthrough.js` — client-owned playthrough for a single music video, a music-video playlist or an artist's music videos: order + index, no server engine, no repeat, no resume (TASK-374)
- `player-math.js` — pure video-player render arithmetic: `progressPct` / `clampTime` / `wrapIndex` / `frameDrop` (TASK-305)
- `lrc.js` — LRC parse + rolling-frame lyric selection (FEAT-018)
- `cover-mosaic.js` — playlist cover-mosaic markup (FEAT-039)
- `playlist-name.js` / `playlist-pick.js` — create-playlist + "add to playlist" (FEAT-036)
- `playlist-row-menu.js` — companion playlist row ⋮-popover logic: `rowActions` (which chips, edge-gated) + `popoverTop` (below/flip-above placement) (TASK-328)
- `downloads-filename.js` / `downloads-sync.js` / `downloads-handle-store.js` / `downloads-synced.js` / `downloads-status-text.js` — offline playlist download to a local folder (TASK-403): sanitized `{artist} - {title}.{ext}` naming, the File System Access sync + `.m3u` write (dedup by filename presence), the IndexedDB-backed remembered folder handle + write-permission check, the synced-playlist-id set (localStorage), and the Downloads page's per-row status text. BUG-064: `syncPlaylist` catches each track individually instead of aborting the batch on the first failure — the `.m3u` lists only tracks that actually have a file, a playlist with any failed track is never `markSynced`, and `downloads-status-text.js`'s `syncFailureText` names what failed (track + HTTP status/FS error) for the post-sync status line
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
- `screen-detail.js` — detail render; **shared by series AND album pages** (must be element-optional-safe — see `GATES-CHECKS.md` pre-flight)
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
- `companion-quick-pause.js` — the disconnected "background mode" page (TASK-367): no WS, three buttons POST straight to TASK-366's `/api/quick-intent/{action}`, targeting the device the full companion already persisted. No TV counterpart by design.
- `companion-downloads.js` — the Downloads page (TASK-403), reached from a Download button on `companion-playlist.js`'s manage-actions row: no WS (a phone-local folder choice, like `companion-quick-pause.js`), DOM glue only over the `downloads-*` core modules. No TV counterpart — syncing to this phone's storage has no TV analogue. TASK-405: that one link crosses to the HTTPS door's origin (`server-config.js` `fetchHttpsOrigin`) instead of staying same-origin like every other companion navigation — `window.showDirectoryPicker` needs a secure context the app's normal `http://` origin never satisfies. BUG-065: since that cross-origin jump means the phone's own back gesture/button can't be relied on, the originating page's URL rides along as a `back` query param (read straight off `window.location.href` before the jump) and a plain `#btn-back` link returns to it — falls back to the playlist library if reached without one.

## Content

App fetches content from media-manager's `/api/*` endpoints, same-origin
(`serverUrl` is derived from the page origin — no hardcoded host/port). Content
schema defined in the `grew-tv` private repo.

**Refs:** [`../CLAUDE.md`](../CLAUDE.md) · [`GATES.md`](GATES.md)
