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
- `channels.js` — the FEAT-560 Channels tab (TASK-563): the tab itself and where browse lands (Channels whenever the backend serves any, otherwise exactly where it landed before), one card per channel and its three states (on air; off air with a return time; off air naming nothing), and the arithmetic under the card — minutes as `2m/8m`, the bar's fill, and the offset ticked forward from the one the strip was fetched with. ⛔ **The bar is the CHANNEL's position, not the viewer's** — a channel plays to a clock nobody's watch history feeds, so nothing here may reach `progress.js`; the two look alike on screen and mean opposite things. `landingTab` is the only place the tab order and the landing choice are decided, so the TV and the phone cannot disagree about which section opens, and `tileVariant` the only place a card's renderer is chosen. Picking a channel is inert until TASK-564 brings the player entry
- `detail-view.js` / `series-detail.js` / `seasons.js` — series-detail logic (TASK-118/123)
- `artist-tracks.js` — artist page's album-grouped song model (TASK-322)
- `search-rank.js` — search overlay: build Video/Music candidates (cards + `/api/tracks`), rank a query (exact>prefix>substring, field-weighted), render result rows (TASK-324)
- `progress.js` — watch-progress model (FEAT-017)
- `breadcrumb.js` / `nav-trail.js` — ancestor-chain + sticky nav trail (FEAT-021/032)
- `queue-tabs.js` / `queue-crumb.js` — the Queue/Next/Coming-Up tab shell and the Queue crumb (FEAT-031/039); `queue-crumb.js` also carries the companion's own "‹ Now Playing › Queue" crumb (TASK-515), which the phone Queue pages hardcoded as a bare back button with no leaf. `queue-tabs.js` serves the shell alone (`qsTabShellHtml`/`phTabShellHtml`); its legacy TV `tabShellHtml` went with its one consumer, `video-queue-view.js`, in TASK-525
- `queue-shell-view.js` — **THE** FEAT-497 Queue UX shell (TASK-515): one implementation of `docs/QUEUE-UX-SHELL.md` for every media type, replacing the near-identical per-cutover copies below. Both surfaces come out of the same builders (only a class map differs), so TV and companion cannot drift in structure or behaviour — they are deliberately sized apart, each page's own `<style>` block owning what its classes measure (BUG-532: the TV pages had been carrying the phone's 390px metrics, and the mirror is parity of function, not identical pixels); `transportState` is the ONE transport rule (⏭ live whenever anything is ahead, from the override queue or the source; ⏮/Shuffle/Repeat disabled-but-visible with no source, never hidden) — and TASK-517 made it the rule at the PLAYER's own control row and the companion's too, not just the Queue hero, which is what BUG-510/512 were. All five media types run entirely on it — home movies (TASK-516), films (TASK-517), music (TASK-504) and music videos (TASK-505), the last cutover, after which a per-type difference is a data entry here and never a branch, which is all TV series (TASK-542) took
- `browse-continue.js` — what BROWSE knows about a media type, as DATA (TASK-501): the five Continue buttons (id, label, order), the `{ page, params }` each press resolves to, and the one wording both surfaces render. TV Series earned its own (TASK-542) — while an episode was a film-engine item Continue Films carried on with a series too, and the media-type split took that away. Continue itself is the queue engine's own advance — `next` on that media type, fired by the player's continue entry — so nothing here does queue maths, and whether a button is live is `queue-shell-view.js`'s `transportState().next`, the same rule ⏭ uses. A further media type is an entry here
- `queue-shell-config.js` — what the shell knows about a media type, as DATA (TASK-515): media noun, fallback glyph, hero source-line resolver, row sub-line resolver, transport rule, and the ＋Queue map entry. `queueAdd()` is THE ＋Queue producer — one call replacing the per-screen dispatch tables that left home movies posting to a retired engine; TASK-505 collapsed its own per-engine routing too, since every ＋ press now appends to the unified queue under its media type. Also `ITEM_MEDIA_TYPE`/`itemMediaType()` (BUG-531) — WHICH Queue a ＋ press fills, from the item's own `itemType` and never from the screen it was pressed on; a type resolving to no Queue makes `queueAdd()` reject, so the producer's own `.catch()` shows the failure. FEAT-541 flips one entry (`episode`) rather than thirteen producers, and TASK-542's fifth media type is an entry here, not new code
- `video-page-config.js` — what `ui/screens/screen-video-page.js` knows about a VIDEO media type, as DATA (TASK-524), the video page's twin of `queue-shell-config.js`: media_type, the Queue shell entry, the player row's own pill ids, and whether a type resumes, counts down at the end, fetches a source title, names its source in the crumb and reveals ＋Playlist. Also `videoRecord` (the ONE record `playVideo` loads, carrying both `ext` and `itemType` for every type), `MODE_ENGINE` (which of the three rails an `entryMode()` answer drives), the engine's registered `SOURCE_TYPE`/source-id params per entry mode, and `videoContext` (the companion context push, built from ONE live snapshot where three sat side by side and two were always empty). The page ran three parallel copies of all of it until TASK-524 — a per-type fix landed three times, and the copies had drifted. ⛔ Four things that look like fields deliberately are NOT: the entry shape, the stale-resync guard, the transport rule and the play record are ONE answer for all three rails — collapsing the copies turned each up as drift, not design, and they were brought into line rather than frozen as data (this closed `BUG-522` and a live defect where a tapped episode/track played its source from the top). See the module's own note before adding a per-rail bit for any of them
- `video-player-router.js` — persistent video-player view-router (FEAT-037) for the OLD video engine. ⚠️ Read ONLY by the companion's own legacy branch (`companion-video.js`): TASK-517 moved its last TV consumer (the browse "Play Queue" entry) onto the unified engine, and TASK-525 removed the TV rail that read it. Kept, like the engine's own routes, until that companion branch is retired too
- `queue-playback-router.js` — **THE** view-router for the TASK-498 unified queue engine's own `queue_playback` snapshot (item_id-keyed now_playing, `queue`/`next`/`coming_up` lookahead lists), over `video-player-router.js` — every media type reads it since TASK-505 cut the last one (music videos) over: home movies (TASK-499/516), films (TASK-503, plus the browse "Play Queue" entry in TASK-517), music (TASK-504) and music videos. `isStaleResync` is the BUG-521 entry-time guard every cut-over rail applies. TASK-501 removed `queueCount` with its one consumer, browse's 🎬/🎵 pills — the Continue buttons that replace them show no count and read `queue-shell-view.js`'s `transportState` instead
- `music-video-playthrough.js` — music-video ROUTING only: `entryMode` is the one shared video.html dispatch table screen-video-page.js reads (every mode routes through it), plus `playlistTrackTarget` (TASK-374/376). Its three other halves are gone — BUG-485 retired the client-owned order/index playthrough, TASK-505 the `mvTransportVisibility` show/hide gate that paired with it (the shell's one `transportState` decides now), BUG-531 the `playlistQueueKey` ＋Queue dispatch key (`queue-shell-config.js`'s `ITEM_MEDIA_TYPE` is the one map for every producer now)
- `player-math.js` — pure video-player render arithmetic: `progressPct` / `clampTime` / `wrapIndex` / `frameDrop` (TASK-305)
- `channels.js` — the Channels TAB's model (TASK-563): what a channel's card says in each of its three states, whether the tab exists at all, and the clock (`tickedOffset`) both surfaces tick on. ⚠️ Its bar is the CHANNEL's position, never watch progress — a channel card deliberately never goes through `tile-model.js`
- `channel-player.js` — the channel PLAYER's model (TASK-564), the half of the same feature the player needs: whether the viewer is behind the channel (`isBehindLive`, and the five-second tolerance a tune-in's own seek lands inside), when the player asks what's on again (`shouldRetune` — which deliberately does NOT fire for a viewer who restarted, or the channel would be a queue that waits), what the schedule plays next, the record to load, and which channel the volume rocker lands on. Reuses `channels.js` rather than re-deriving the clock, so the strip and the player can never disagree about where a channel has got to
- `night-mode.js` — Night Mode's three levels as DATA (TASK-568): Off/Soft/Strong, each with the compressor settings that squash a film's loud-quiet swing, the cycle one press makes, the one label both surfaces render, and the dB→linear makeup conversion. Off carries no settings at all — it is a bypass the graph routes around, not a compressor configured to do nothing. **Retuning Soft/Strong is an edit to this table**, never a code change and never a re-encode; the numbers shipped are the owner's sample and a first guess at Strong, neither tuned
- `lrc.js` — LRC parse + rolling-frame lyric selection (FEAT-018)
- `cover-mosaic.js` — playlist cover-mosaic markup (FEAT-039)
- `playlist-name.js` / `playlist-pick.js` — create-playlist + "add to playlist" (FEAT-036)
- `playlist-row-menu.js` — companion playlist row ⋮-popover logic: `rowActions` (which chips, edge-gated) + `popoverTop` (below/flip-above placement) (TASK-328)
- `downloads-filename.js` / `downloads-sync.js` / `downloads-handle-store.js` / `downloads-synced.js` / `downloads-status-text.js` / `downloads-disk-status.js` — offline playlist download to a local folder (TASK-403): sanitized `{artist} - {title}.{ext}` naming, the File System Access sync + `.m3u` write (dedup by filename presence), the IndexedDB-backed remembered folder handle + write-permission check, the synced-playlist-id set (localStorage), and the Downloads page's per-row status text — BUG-066: leads with "N tracks"/"1 track" (from the browse card's `clipCount`, threaded through `playlist-pick.js`), same wording `tile-model.js`'s playlist sub-label already established, before any sync starts. BUG-064: `syncPlaylist` catches each track individually instead of aborting the batch on the first failure — the `.m3u` lists only tracks that actually have a file, a playlist with any failed track is never `markSynced`, and `downloads-status-text.js`'s `syncFailureText` names what failed (track + HTTP status/FS error) for the post-sync status line. BUG-437: `downloads-disk-status.js`'s `refreshPlaylistSyncStatus` re-derives each row's Synced flag from what's actually in `grew-tv/<title>/` on page load (read-only, never `{create:true}`) instead of only trusting the last sync run's persisted flag — same "audio count matches clipCount AND the `.m3u` is present" contract `syncPlaylist` writes to, gated on `downloads-handle-store.js`'s `hasReadPermission` (`queryPermission({mode:'read'})`, never prompts, so it's safe with no user gesture)
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
- `screen-video-page.js` — persistent video player (FEAT-037), the four QUEUE-ENGINE rails · `screen-audio-page.js` — music player (FEAT-031)
- `screen-channel-player.js` — CHANNEL MODE on that same player (TASK-564/FEAT-560): `app/homeview/video.html` dispatches here on `?channel=` and to `screen-video-page.js` otherwise, and both drive the SAME `screen-video-player.js` transport, `#controls`, `#progress` bar and `#video-upnext` line — a mode flag, not a second player. It is a sibling rather than a fifth entry in `core/video-page-config.js` because every field in that table answers a question about a queue and a channel has none: no media_type, no snapshot, no Queue View, no engine action. What plays is what `GET /api/channels/{id}` says is on, and only the wall clock moves it on. ⚠️ It builds the player with `savesProgress: false` — a channel play records NOTHING (decision 16), which is why `#btn-clear-progress` is hidden here too
- `screen-playlist-detail-page.js` / `screen-playlist-create-page.js` — playlists (FEAT-036)

**Shared screen modules** (imported by pages, some by two)
- `screen-detail.js` — detail render; **shared by series AND album pages** (must be element-optional-safe — see `GATES-CHECKS.md` pre-flight)
- `screen-browse.js` / `screen-rail-grid.js` — browse + rail-grid render
- `screen-video-player.js` — THE video transport, for both `video.html` modes (graduated skips, auto-hide controls). TASK-564 added `savesProgress` (opt OUT — the ONE gate on watch-progress writes, so "a channel play records nothing" is one place rather than a rule repeated at each call site), plus `seekTo`/`position` for the absolute moves channel mode needs and the graduated Jump grid deliberately has no equivalent of
- `screen-audio-player.js` — audio transport (FEAT-018)
- `screen-queue-shell.js` — **THE** TV Queue View overlay, for every media type (TASK-515/FEAT-497): one controller replacing the per-cutover copies, which differed only in which view module they imported. `config.media` is the `core/queue-shell-config.js` entry; `config.getSourceTitle()` supplies the hero's source line for a type whose source id is opaque, read fresh on every render (so a late-resolving title lands via `refreshSourceTitle()`); `config.onToggle` is the one device-local control. All five media types run entirely on it — home movies (TASK-516) derive their own source line, while a film's boxset id (TASK-517), a TV series' own id (TASK-542), music's album/playlist/artist (TASK-504) and a music video's playlist/artist (TASK-505) resolve through `getSourceTitle`
- `continue-menu.js` — **THE** browse Continue cluster, for BOTH surfaces (TASK-501/FEAT-497): builds the four buttons from `core/browse-continue.js`'s `CONTINUE_TYPES` into a caller-supplied mount, reads each type's `queue_playback` snapshot to render it live or disabled-but-visible, and calls back with the media type on a press. The TV's play menu (`screen-browse-page.js`) and the companion's (`companion-browse.js`) differ only in where that press goes — the TV navigates itself, the phone drives the TV — which is why story 4 holds by construction rather than by two copies agreeing
- `screen-search.js` — TV search overlay (🔍): reuses the create-playlist on-screen keyboard, ranked results via `core/search-rank` (TASK-324; companion mirror lives in `companion-browse.js`)
- `night-mode-audio.js` — the Web Audio graph behind the Night Mode control (TASK-568), driven by `core/night-mode.js`'s table: element → source → compressor → makeup → destination, with Off routed straight past the compressor. Built on the FIRST press, never at play time — wiring an element into Web Audio is one-way for its life, so a viewer who never presses it keeps an untouched audio path (story 6), and a press is the user gesture an AudioContext needs. `rebindSink()` is the BUG-061 half a graph needs: the element remount on `devicechange` re-grabs the current output for the element and does nothing for the graph, so the context is `setSinkId('')`-ed on the same event or Night Mode goes silent when the Bluetooth speaker reconnects
- `screen-error.js` — error screen · `breadcrumb.js` / `device-badge.js` — trail + badge mounts

**Companion mirrors** (`companion-*.js`, back `companion/*.html`)
- `companion-profile.js` · `companion-browse.js` · `companion-detail.js`
- `companion-artist.js` · `companion-audio.js` · `companion-video.js`
- `companion-queue-shell.js` — **THE** companion Queue page, for every media type (TASK-515/FEAT-497): the phone mirror of `screen-queue-shell.js`, replacing the per-cutover copies. `initQueueShellPage({ media, loadSourceName, contextPage })` — `media` picks the `queue_playback` snapshots this page repaints on and the media type its POSTs go to; `loadSourceName` is the source-title lookup a type with an opaque source id needs, absent for one that derives its own. Renders the "‹ Now Playing › Queue" crumb into the page's `#queue-crumb` mount rather than the page hardcoding a bare back button. All four pages run on it: `home-movies-queue.html` (TASK-516, deriving its own source line), `film-queue.html` (TASK-517, `loadSeriesTitle`), `music-queue.html` (TASK-504, `loadMusicSourceTitle`) and `music-video-queue.html` (TASK-505, `loadMusicVideoSourceTitle`)
- `companion-playlist.js` · `companion-playlist-create.js`
- `companion-breadcrumb.js` · `companion-screen-bar.js` · `companion-sync-bar.js` · `companion-error.js`
- `companion-status-menu.js` — the header popout menu (TASK-412, rolled out to every companion page by TASK-415): opens/closes `#status-menu` off a single `#btn-status` icon, never on an outside tap. Consolidates whichever of Mode (`companion-sync-bar.js`), Screen (`companion-screen-bar.js`), Profile (`#switch-profile`), Atlas (`#door`) and Row (`companion-row-step.js`, `#row-step`) a page names into one menu by building each row's empty mount `<div>` itself — that row's own mount function then fills it, unchanged. `browse.html` is the only page carrying all five; the rest show the subset they already had (e.g. `profile.html` shows Screen only — no Mode, since picking a profile precedes any TV context there is to desync from).
- `companion-row-step.js` — the ▲/▼ row-step control (TASK-408), a `companion-status-menu.js` row (`'row'`) mounted by the 4 browse-family mirrors (`companion-browse.js` for browse+rail-grid, `companion-detail.js` for series+album detail, `companion-artist.js`, `companion-playlist.js`): sends the existing `navigate_up`/`navigate_down` intents (already gated synced-only by `companion-ws.js`'s `sendIntent`) and dims the whole row (label included) while desynced, like every other TV-driving control.
- `companion-quick-pause.js` — the disconnected "background mode" page (TASK-367): no WS, three buttons POST straight to TASK-366's `/api/quick-intent/{action}`, targeting the device the full companion already persisted. No TV counterpart by design.
- `companion-downloads.js` — the Downloads page (TASK-403), reached from a Download button on `companion-playlist.js`'s manage-actions row: no WS (a phone-local folder choice, like `companion-quick-pause.js`), DOM glue only over the `downloads-*` core modules. No TV counterpart — syncing to this phone's storage has no TV analogue. TASK-405: that one link crosses to the HTTPS door's origin (`server-config.js` `fetchHttpsOrigin`) instead of staying same-origin like every other companion navigation — `window.showDirectoryPicker` needs a secure context the app's normal `http://` origin never satisfies. BUG-065: since that cross-origin jump means the phone's own back gesture/button can't be relied on, the originating page's URL rides along as a `back` query param (read straight off `window.location.href` before the jump) and a plain `#btn-back` link returns to it — falls back to the playlist library if reached without one. BUG-437: once the folder loads (restored handle or freshly chosen), a `#sync-summary` line above the row list ("N of M synced", a plain derived render off `isSynced`) plus each row's own status text picks up `downloads-disk-status.js`'s per-playlist on-disk re-check as it resolves — one pass per page view/folder load, not a poller.

## Content

App fetches content from media-manager's `/api/*` endpoints, same-origin
(`serverUrl` is derived from the page origin — no hardcoded host/port). Content
schema defined in the `grew-tv` private repo.

**Refs:** [`../CLAUDE.md`](../CLAUDE.md) · [`GATES.md`](GATES.md)
