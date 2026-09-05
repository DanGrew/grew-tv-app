# grew-verify — golden-flow coverage registry

What each golden flow snaps, and where the blind spots are. This is the
**things-to-check** list (TASK-291): re-read it whenever we spot a missing snapshot
or ship a feature on a surface, and grow the suite to close the gap.

**Unit of coverage is a `(surface, function/state)` pair, not a page.** A page can be
"rendered" by a flow yet a *state* on it stays a blind spot — e.g. the greyed video-queue
Repeat pill (TASK-289): the page snaps, but no flow drives the non-repeatable source, so
before/after render pixel-identical. Rows below are per function/state for that reason.

**Grow-vs-add rule.** New surface *on an existing flow's path* → add a step (extend).
New entry→drill *journey*, or a surface unreachable without contorting a flow → new flow.
Overlap on shared chrome is fine (catches regressions repeatedly); re-snapping the same
`(surface, state)` in N flows is waste (dossier noise, no new coverage).

Legend: ✅ covered · ⚠️ partial · ❌ gap · ➖ low-value (skip)

---

## Flows

| id | surface | file | snaps |
|----|---------|------|-------|
| `companion` | companion remote — video journey | `companion-journey.cjs` | browse → TV-series → grid → detail → video play/pause → breadcrumb → films |
| `music` | companion remote — audio | `companion-music.cjs` | Music → Albums → album detail → audio play/pause → queue → back |
| `playlists` | companion — playlists | `companion-playlists.cjs` | create form → created tile → album detail → add-sheet → added toast → **populated playlist view** |
| `tv-app` | **TV** app-side | `tv-app.cjs` | profile → browse → detail → video play/pause → breadcrumb → **Continue Watching rail** |
| `tv-music` | **TV** app-side — music | `tv-music.cjs` | profile → Music tab (Artists/Albums rails) → album detail → audio play/pause |
| `companion-artist` | companion — artist drill | `companion-artist.cjs` | Music → Artists rail → artist → albums grid → album detail |
| `tv-artist-playlist` | **TV** — artist + playlist detail | `tv-artist-playlist.cjs` | Music → Artists rail → artist (rail-grid) → album → build playlist → populated playlist-detail |

Harness: `_harness.cjs` (`runFlow`, `bootTv`, `openCompanionBrowse`, `DEFAULT_MASK`).

---

## Companion (`companion/*.html`)

| Surface | Function / state | Flow(s) | Status | Notes / churn |
|---------|------------------|---------|--------|----------------|
| browse | sections + rails nav (TV Series / Films / Music) | companion, music, playlists | ✅ | |
| browse | film tile ＋Queue in-row control | — | ❌ | TASK-286 (state on browse, unsnapped) |
| browse | Channels tab — on-air / off-air cards | — | ❌ | TASK-563 (new tab, and the section browse now LANDS on whenever any channel exists) |
| browse | Continue Watching/Listening rail (mid-play) | — | ❌ | FEAT-044 (TASK-285) |
| detail | TV-series tracklist | companion | ⚠️ | list snaps; NEXT tag not asserted — BUG-033 |
| detail | album tracklist | music | ✅ | |
| detail | add-to-playlist sheet | playlists | ✅ | |
| artist | artist drill → albums grid | companion-artist | ✅ | BUG-035 (crumb), TASK-274 (covers) |
| audio | remote play / pause | music | ✅ | |
| audio | ＋Queue toast confirmation | — | ❌ | BUG-030 (state) |
| video | remote play / pause | companion | ✅ | |
| queue | audio queue list | music | ✅ | minimal (body-only snap) |
| queue-shell | FEAT-497 Queue page + dimmed non-repeatable controls | — | ❌ | TASK-525: the `companion-video-queue` flow went with the legacy Queue page it drove. The shell that replaced it (`companion-queue-shell.js`, all four types) has never had a flow of its own — the TASK-289 `(surface, state)` pair is open again on the shell |
| playlist | populated tracklist + cover thumbs + NEXT | playlists | ✅ | populated view snapped (playlists step 07); text-only baseline — TASK-287 (thumbs), BUG-033 (NEXT) land here |
| playlist-create | create form | playlists | ✅ | |
| profile | profile pick | — | ➖ | low visual value |
| error | error state | — | ➖ | |
| index | entry / redirect | — | ➖ | no visual |

## TV app (`app/homeview/*.html`)

| Surface | Function / state | Flow(s) | Status | Notes / churn |
|---------|------------------|---------|--------|----------------|
| profile | profile pick + PIN | tv-app | ✅ | |
| browse | film tiles + rails | tv-app | ✅ | |
| browse | Continue Watching rail (mid-play) | tv-app | ✅ | FEAT-044; tv-app seeks a video to ~30% then snaps the rail (Continue **Listening** / playlist tiles still ❌ — TASK-285) |
| browse | Channels tab — on-air / off-air cards | — | ❌ | TASK-563. A flow here needs a frozen clock: the card's bar and its `2m/8m` advance every second off wall time, so an unpinned snap differs from itself between runs — a determinism case `VERIFY-STORIES.md` has no anchor for yet |
| detail | TV-series detail + NEXT tag | tv-app | ✅ | |
| album-detail | album detail (music) | tv-music | ✅ | |
| audio | TV music player controls | tv-music | ✅ | TASK-288 (two-row), BUG-034 (volume), TASK-283 (startAt/endAt) |
| artist | TV artist / album-by-year | tv-artist-playlist | ✅ | FEAT-029 |
| playlist-detail | TV playlist detail + per-track ＋ | tv-artist-playlist | ✅ | TASK-262, BUG-033 |
| rail-grid | "see all" rail grid | tv-artist-playlist | ✅ | artist page renders via screen-rail-grid.js (same grid renderer) |
| playlist-create | create form | — | ➖ | companion create covers the path |
| video | TV player play / pause | tv-app | ✅ | video frame hidden for determinism |
| video | channel mode — ident, live marker, Back to live, Restart | — | ❌ | TASK-564. Same frozen-clock problem as the Channels tab above, and worse: the marker's position and whether the Back to live pill is even shown both move every second off wall time, so two of the three things worth snapping are the non-deterministic ones |
| video | channel mode — the card in the gap, and the off-air holding card | — | ❌ | TASK-565. The one channel surface a frozen clock would actually make snappable: the card is a fixed layout over black, and its three timed lines come out of the programme rather than off the wall clock. What still moves is the bed's track credit, which is a function of real time by design — so a flow here needs the clock pinned for the credit alone, not for the card |
| queue-shell | FEAT-497 Queue overlay + dimmed non-repeatable controls | — | ❌ | TASK-525: the `tv-video-queue` flow went with the legacy Queue overlay it drove. The shell that replaced it (`screen-queue-shell.js`, all three video types) has never had a flow of its own — the TASK-289 `(surface, state)` pair is open again on the shell |
| error | error state | — | ➖ | |

## Cross-cutting

| Function | Flow(s) | Status |
|----------|---------|--------|
| breadcrumb back-nav | companion, tv-app | ✅ |
| deterministic masking (device id / timecode / progress / conn) | harness (`DEFAULT_MASK`) | ✅ |

---

## Proposed next flows (from the gaps)

Ranked by churn. Extend where the surface sits on an existing path; else new flow.

1. ~~**`tv-music`** *(new)* — TV: profile → Music → Albums → album detail → play audio → player.
   Closes TV `audio`, `album-detail`. Highest churn: TASK-288, BUG-034, TASK-283.~~ ✅ **landed** (`tv-music.cjs`).
2. ~~**`companion-artist`** *(new)* — companion: Music → Artists rail → artist → album → detail.
   Closes companion `artist`. BUG-035, TASK-274.~~ ✅ **landed** (`companion-artist.cjs`).
3. ~~**`video-queue`** *(new)* — build a video queue → open queue view → snap greyed Repeat pill
   (companion + TV). Closes the TASK-289 blind spot; BUG-024.~~ ✅ **landed** — two files, one per surface
   (`tv-video-queue.cjs` + `companion-video-queue.cjs`); a single-item film is the non-repeatable source.
   ⚠️ **Both removed by TASK-525** with the pre-FEAT-497 Queue they drove. The pair they covered is a
   gap again — it wants re-doing against the FEAT-497 shell, which serves every media type, so ONE
   flow per surface now covers what four types used to need separately.
4. ~~**`tv-artist-playlist`** *(new)* — TV: Music → Artists → album-by-year → playlist-detail.
   Closes TV `artist`, `playlist-detail`, `rail-grid`.~~ ✅ **landed** (`tv-artist-playlist.cjs`) — one
   journey; playlist built via a Queen album's Add-all → New playlist (catalog seeds none).
5. ~~**populated `playlist.html`** *(extend `playlists`)* — already flagged as a follow-on in
   `companion-playlists.cjs`: after add, view the populated companion playlist (thumbs + NEXT).
   TASK-287, BUG-033.~~ ✅ **landed** — `playlists` step 07 (playlist.html back-nav now sorted, TASK-297).
6. ~~**Continue rail** *(extend `tv-app` tail)* — play partway → back to browse → snap the
   Continue Watching/Listening rail. FEAT-044.~~ ✅ **landed** — `tv-app` steps 08–09 (seek a
   video to ~30%, back to browse, snap the Continue Watching rail; tile progress-fill masked).

When a flow lands, flip its `(surface, state)` rows to ✅ and name it in Flow(s).

---

**TASK-299 batch complete** — all six ranked flows landed (7 flow files total):
`tv-music`, `companion-artist`, `tv-video-queue` + `companion-video-queue`,
`tv-artist-playlist`, populated-playlist (extended `companion-playlists`), Continue-rail
(extended `tv-app`). Remaining ❌ rows above are follow-ons outside this batch (e.g. the
companion browse Continue rail, companion ＋Queue toast, audio ＋Queue toast).

**TASK-525** removed `tv-video-queue.cjs` + `companion-video-queue.cjs` with the legacy
Queue they drove — 5 flow files now. The Queue View's own `(surface, state)` pair is
unsnapped on both surfaces until a shell flow replaces them.
