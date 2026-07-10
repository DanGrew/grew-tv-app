# grew-verify Golden Stories — implementation spec

Owner-authored user-intent journeys for the grew-verify visual-regression dossier.
Each story is a **flow** (`verify-flows/<id>.cjs`) driven against a real, isolated
media-manager on both builds of a PR. **The step receipt is the verification; the
snaps illustrate result-defects.** Stories are named by the *accomplishment*, not
the surface — a whole journey with entry → core act → come-back, one observable
per step.

> Status of this doc: authored 2026-07-05 from a live app review (selectors +
> anchors verified against the real `~/rips` catalog / `config.json`). Sufficient
> to fan out one flow per session. NOT yet all built — see per-story status.
>
> **This is a REFERENCE/PROPOSAL under owner review — NOT a commitment to build.**
> No implementation tasks are open for it. Adopt story-by-story only when decided.

---

## 0. What a good story is (the shape every flow follows)

- **One named user intent** (PLAY MUSIC ALBUM, QUEUE VIDEOS, SWITCHING PROFILES).
- **One meaningful UI action per step**, each landing on a visible landmark worth a
  snap (rail appears / title shows / grid with a named item). Not micro (no "focus
  button"), not macro (drill isn't collapsed into one leap).
- **Prove-both-states**: a player step snaps paused (▶) *and* playing (⏸).
- **Come-back**: breadcrumb / back steps are deliberate (retrace, not just forward).
- **Real anchored DATA** so before/after only diffs on a real UI change.
- **Per-snap CHECK** = the *result-defect a reviewer's eye should catch* (layout,
  art, ordering, wrong label, presence/absence), NOT "does it function".

## 1. Harness contract (how a flow is written)

`_harness.cjs` exports `runFlow`, `bootTv`, `openCompanionBrowse`, `DEFAULT_MASK`.
A flow declares `{ id, setup, steps, maskSelectors? }`:

- `setup(browser, base, log)` boots the surfaces and returns the page to snap.
- `steps: [{ name, fn }]` — each `fn(page)` asserts-then-acts; the runner waits
  300ms and snaps `<id>-<name>.png`. A throw records the failure and STOPS the flow
  (fail-loud), keeping earlier snaps.
- `maskSelectors` overrides `DEFAULT_MASK` (`#conn-status #screen-bar #device-badge
  #time #bar-fill`) — the run-variable chrome masked black for determinism.
- Result → `<id>.result.json` (`passed`, `failedAt`, per-step `ok`).

**Determinism rules (non-negotiable for a judgeable dossier):**
- **Feed fixed state, don't rely on real-time playback.** Set an explicit progress
  (POST `/api/progress` ~30% / seek `currentTime`) — never "play for N seconds".
- **Hide the video frame** (`#video` visibility hidden) — a decoded frame is
  nondeterministic and can't be masked without covering the controls.
- **Mask live timecode / progress / device-id / lyrics** unless the state *is* the
  subject (then feed it a fixed value and keep it visible — see CONTINUE stories).
- **Author on a COLD, fresh per-flow DB** (matching grew-verify isolation) — never a
  warm/seeded one (dirty-DB false pass; this bit TASK-299).

## 2. Surface mechanics (companion vs TV)

Two surfaces of one feature (FEAT-017/028 mirror invariant: companion drives, TV
mirrors, shared `core/`). Same arcs, different mechanics.

### Companion (remote — drives a bound TV over WS)
- **Boot**: `bootTv(browser, base, {profileBtn:'#btn-mom', pin:'1111'})` then
  `openCompanionBrowse(browser, base)` → bound companion on `browse.html`.
- **Browse**: `#sections-row .chip` (TV Series / Films / Music / Home Movies) →
  `#rails-row .chip` (rails/genres) → `#txtgrid .ph-txt` (tiles).
- **Play**: tap tile/track → the TV plays; companion follows to `video.html` /
  `audio.html`; toggle = `#c-toggle` (▶/⏸); music queue btn `#c-queue`.
- **Breadcrumb**: `#breadcrumb .crumb-link` (Home / ancestor / leaf).
- **Modes**: Control (bound, drives TV — all stories run here) vs Browse/desync
  (local nav; out of scope this batch).

### TV (app-side — plays the real media itself)
- **Boot**: `app/homeview/index.html` → `profile.html`; `#btn-mom` +
  `.key[data-key="N"]` × PIN → `browse.html`.
- **Browse**: `.sidebar-tab` (TV Series / Films / Home Movies / Music) →
  `.rail`/`.rail-title` → `.film-tile` (click or d-pad).
- **Play**: `#btn-play-pause` (▶/⏸); detail `#btn-play-next`; video `#btn-queue` →
  `#queue-overlay`; hide `#video`.
- **Detail**: `#detail-title`, `.detail-row`; album at `album-detail.html`.
- **Breadcrumb**: `#breadcrumb`.
- **Masks (TV)**: `#conn-status #device-badge #sound-prompt #time-display
  #progress-fill #amb-lyrics` (+ hide `#video`).

## 3. Verified DATA anchors (real in `~/rips` / `config.json`)

- **Persons**: Mommy (`mom`, adults, PIN **1111**), Daddy (`dad`, adults, 4444);
  kids **Oliver / Millicent / Guest** (no PIN).
- **Series**: **Black Books** (Comedy).
- **Film**: **Friends With Benefits** (Romcom, single-clip).
- **Album**: **…Like Clockwork** (QOTSA, lyrics-bearing) for named TV; companion
  music uses first-by-position.
- **Artist**: **Queen** (multi-album); album **Made in Heaven** seeds a playlist.
- **Home movie (standalone)**: **Jungle Gym (26-05-21)** (`itemType:home-movie`,
  Home Movies → Videos rail).
- **Home movie (collection)**: **Ollie** (`collectionType:home-movies`, 8 clips,
  Home Movies → Collections rail).
- **Playlist**: built in-flow (no catalog seed) — name "Verify Flow" / "MIX".

## 4. Gates & feasibility legend

- ✅ **exists** · ➕ **extend existing flow** · 🆕 **new** · ❌ **N/A on this surface**
- ⚠️ **gate** — a dependency that must clear before it runs reliably:
  - **G-CRUMB (BUG-037)**: a *film / standalone home-movie* video page crumb is
    `Home › Title` only (no genre/grid crumb) — a come-back step can only reach
    Home until BUG-037 lands. Series/collections keep the two-hop crumb.
  - **G-COLD (TASK-299)**: the browse Continue rail intermittently empties on a
    cold DB (root cause unconfirmed; flaked on TV). CONTINUE stories gated on it.
  - **G-ARTIST (resolved TASK-322)**: the artist page is now a SONG LIST — you start
    by tapping a song (there is no whole-artist Play/Shuffle to confirm). C7 + T7 tap
    a song row (`#songlist .song` / `#detail-list .detail-row`) to land the player.

---

# COMPANION STORIES (14)

### C1 · PLAY TV SERIES  ✅ exists (`companion-journey.cjs`)
Entry→drill→play→both states→retrace→lateral.
```
01-browse       browse (bound), TV Series chip visible
02-tv-series    tap TV Series → Comedy rail appears
03-comedy-grid  tap Comedy → grid, "Black Books" visible
04-detail       tap Black Books → detail.html, #ctx-title shows
05-video        tap episode 1 → video.html, #c-toggle visible
06-paused       #c-toggle → ▶
07-playing      #c-toggle → ⏸
08-crumb-detail crumb "Black Books" → detail
09-crumb-grid   crumb "Comedy" → grid
10-films        tap Films section → films rails appear
```
CHECK: grid tiles + names; detail tracklist; toggle state flips; crumb retrace lands right.
DATA: Black Books (Comedy).

### C2 · PLAY MUSIC ALBUM  ✅ exists (`companion-music.cjs`)
```
01-music        tap Music → Albums rail appears
02-albums       tap Albums → album grid
03-album-detail tap first album → detail.html, track 1 visible
04-audio        tap track 1 → audio.html, #c-toggle
05-paused       ▶   06-playing  ⏸
07-queue        tap #c-queue → queue.html
08-back-to-player tap "Now Playing" → audio.html
```
CHECK: album tracklist order; player controls; queue list renders.
DATA: first album by position.  NOTE: 07 is a thin (body-only) snap today → strengthen (show the queue list).

### C3 · CREATE PLAYLIST  ✅ exists (`companion-playlists.cjs`)
```
01-music         Music → create-playlist control visible
02-create-form   tap create → playlist-create.html, #pl-name
03-created       type "Verify Flow" → #btn-create → Playlists rail shows it
04-album-detail  Albums → first album → detail, track 1
05-add-sheet     track ＋ → #add-sheet, playlist listed
06-added         tap playlist in sheet → #add-status toast
07-view-populated Home → Music → Playlists → open → playlist.html rows
```
CHECK: created tile appears; add-sheet lists playlist; populated rows render.
DATA: playlist "Verify Flow".  NOTE: 06 toast text not asserted today → strengthen.

### C4 · PLAY FILM  🆕 new  ⚠️ G-CRUMB
Films are genre-railed; a film has no detail page (plays direct); crumb Home›Title.
```
01-browse       browse (bound)
02-films        tap Films → genre rails appear (grid empty until a genre picked)
03-romcom-grid  tap Romcom → grid, "Friends With Benefits" visible
04-video        tap the film → video.html directly (no detail page)
05-paused ▶    06-playing ⏸
07-crumb-home   crumb "Home" → browse (Home›Title only — G-CRUMB)
```
CHECK: genre-gated grid; direct-play; the single Home crumb.
DATA: Romcom / Friends With Benefits.

### C5 · PLAY HOME VIDEO (standalone)  🆕 new  ⚠️ G-CRUMB
```
01-browse       browse (bound, adults)
02-home-movies  tap Home Movies → rails (Collections, Videos)
03-videos-grid  tap Videos rail → grid, "Jungle Gym (26-05-21)" visible
04-video        tap it → video.html directly (standalone plays direct)
05-paused ▶    06-playing ⏸
07-crumb-home   crumb "Home" → browse (Home›Title only — G-CRUMB)
```
CHECK: Home Movies tab + Videos rail; direct-play; Home crumb.
DATA: Jungle Gym (26-05-21).

### C6 · PLAY HOME VIDEOS (collection)  🆕 new
Collection = kind `series`; opens detail with a clip list; keeps the two-hop crumb.
```
01-browse           browse (bound, adults)
02-home-movies      tap Home Movies → rails
03-collections-grid tap Collections rail → grid, "Ollie" visible
04-collection-detail tap Ollie → detail.html, 8-clip list
05-video            tap clip 1 → video.html
06-paused ▶        07-playing ⏸
08-crumb-detail     crumb "Ollie" → collection detail (retains ancestor)
09-crumb-grid       crumb → Home Movies grid (nav-trail crumb)
```
CHECK: Collections rail; clip list; two-hop retrace (contrast C5's Home-only).
DATA: Ollie (8 clips).

### C7 · PLAY ARTIST (song list)  🔁 reworked (TASK-322)
```
01-music        Music → Artists rail appears
02-artists      tap Artists → artist grid
03-artist       tap "Queen" → artist.html: SONG LIST, tracks grouped by album header
04-audio        tap a song (#songlist .song → play intent) → drives TV to audio.html
05-paused ▶    06-playing ⏸
07-crumb-artist crumb "Queen" → artist page (Control mode ok; Browse-mode = BUG-035)
```
CHECK: artist song list grouped by album; tapping a song lands the player; crumb back.
DATA: Queen.  (TASK-322: no whole-artist Play/Shuffle — you tap a song to start.)

### C8 · PLAY PLAYLIST  🆕 new
Cold DB seeds no playlist → build first (create + add a track), then play.
```
01-create        Music → create → "Verify Flow" → Create
02-populate      Albums → first album → track ＋ → add to "Verify Flow"
03-open-playlist Home → Music → Playlists → open "Verify Flow" → playlist.html
04-audio         tap Play (#btn-play → play_next) → audio.html
05-paused ▶     06-playing ⏸
07-crumb-playlist crumb back to the playlist
```
CHECK: populated playlist rows; whole-playlist play; resume-ordering.
DATA: playlist "Verify Flow" (1 seeded track).  NOTE: overlaps C3 by necessity.

### C9 · SWITCHING PROFILES  🆕 new
Both directions: kid direct-switch (no PIN) + adult PIN gate.
```
01-adult-home   bound on Mommy's Home (adults, full catalog)
02-switch-tap   tap Switch Profile (#switch-profile) → picker "Who's watching?"
03-picker       cards: Mommy/Daddy 🔒, Oliver/Millicent/Guest unlocked
04-pick-kid     tap Oliver (no PIN) → both jump to Oliver's Home
05-kids-home    browse re-scoped to kids catalog (no PIN content)
06-switch-again tap Switch Profile → picker
07-pin-gate     tap Mommy (🔒) → PIN keypad "Enter code — Mommy"
08-adult-home   enter 1111 → Mommy's Home (adult catalog restored)
```
CHECK: correct persons + lock badges; kids Home ≠ adult Home; PIN keypad renders.
DATA: Mommy(1111) ↔ Oliver.

### C10 · SWITCHING SCREENS  🆕 new  (companion-only; ❌ N/A on TV)
Needs TWO booted TVs. Screen bar re-target (A→B), first screen left running.
```
[setup: boot TWO TVs → two screens online; companion binds Screen A]
01-bound-A      bound to A, browse; screen pill shows A ▾
02-picker-open  tap pill → "Drive screen", both screens listed (A on, B off) w/ swatches
03-switch-B     tap Screen B → re-targets; pill now shows B
04-drive-B      drive B (open a section) → B follows; A untouched
```
CHECK: pill reflects bound screen; picker lists all online; bind flips; driving hits B only.
DETERMINISM: swatch colour derives from a RANDOM device_id → this snap false-diffs
every run. **Accepted** (auto-approval out of scope; eyeball it). Do NOT mask the bar
(it's the subject); target "Screen B" by picking the **non-bound device**, not colour.
OVERRIDE mask to keep `#screen-bar` visible.

### C11 · CONTINUE WATCHING  🆕 new  ⚠️ G-COLD
store → view → resume.
```
[store] 01-play    TV Series → Comedy → Black Books → play ep1 → video.html
        02-partway set FIXED progress (~30%, POST/seek) → pause
[view]  03-back-browse crumb Home → browse; Continue Watching rail shows Black Books, tile bar ~30%
        04-detail-resume open detail → ep1 row ~30% bar + "▶ Play next"
[resume]05-resume  tap ▶ Play next → video.html, playhead ~30% (not 0)
        06-playing ⏸
```
CHECK: rail shows the item; tile/row progress bar at fixed %; resume seeks to ~30%.
DETERMINISM: fixed-progress (not live play); OVERRIDE mask to KEEP the progress bar +
resumed time VISIBLE (they're the subject).  GATE: G-COLD — cold rail may be empty;
spike live before committing.

### C12 · CONTINUE LISTENING  🆕 new  ⚠️ G-COLD
Mirror of C11, album-anchored (Continue Listening rail = collection-level).
```
[store] 01-play    Music → Albums → first album → play track 1 → audio.html
        02-partway set FIXED progress (~30%) → pause
[view]  03-back-browse crumb Home → browse Music tab; Continue Listening rail shows the album
        04-detail-resume open album → track 1 row ~30% + "▶ Play next"
[resume]05-resume  tap ▶ Play next → audio.html, resumes ~30%
        06-playing ⏸
```
CHECK/DETERMINISM/GATE: as C11.

### C13 · QUEUE VIDEOS  🆕 new
Full CRUD; queue self-built on cold DB (deterministic, no G-COLD). Series episodes
queue from detail via ＋ → ☰ Play Next.
```
[build] 01-detail   TV Series → Comedy → Black Books → detail
        02-add      ep2 ＋ → ☰ Play Next (queue-video); ep3 same → toasts
        03-play-source play ep1 → video.html (ep2, ep3 queued)
        04-queue-view open Video Queue → video-queue.html, ep2 & ep3 listed
[reorder]05-reorder ↑/↓ on a queued row → order swaps (move-queue-entry)
[pop]   06-play-now tap a queued row → play-now (removes entry + plays it)
[delete]07-remove   ✕ on remaining queued row → remove-queue-entry, gone
```
CHECK: queued rows render right titles/order; reorder swaps; pop removes+plays; delete drops row.
DATA: Black Books ep 1/2/3.

### C14 · QUEUE MUSIC  🆕 new
```
[build] 01-play      Music → Albums → first album → play track 1 → audio.html
        02-add       crumb to detail → track 2 ＋ ☰ Play Next; track 3 same → toasts
        03-queue-view open Queue → queue.html, Queue tab lists tracks 2 & 3
[reorder]04-reorder  ↑/↓ queued row → swap (move-queue-entry)
[play]  05-play-track tap queued row → play-track (plays now; music has no combined pop)
[delete]06-remove    ✕ queued row → remove-queue-entry, row gone
```
CHECK: queue tab list; reorder; play-from-queue; delete.
DATA: first album, tracks 2 & 3.

---

# TV STORIES (10 new/partial + 1 N/A)

Same arcs as the companion twins; mechanics per §2 (sidebar tabs, `.film-tile`,
`#btn-play-pause`, PIN keypad, no bind/screen-bar). Existing TV flows: `tv-app`,
`tv-music`, `tv-artist-playlist`, `tv-video-queue`.

### T1 · PLAY TV SERIES  ✅ exists (`tv-app.cjs`)
profile → PIN → browse → Black Books detail → #btn-play-next → paused/playing → crumb. Hide `#video`.

### T2 · PLAY MUSIC ALBUM  ✅ exists (`tv-music.cjs`)
Music tab → Albums rail → album-detail → play → paused/playing. Mask `#amb-lyrics`.

### T3 · CREATE PLAYLIST  ➕ extend (partial in `tv-artist-playlist.cjs`)
Today: builds a playlist via album Add-all → New. NEW work: the full create-form
journey (playlist-create keyboard `.pl-key` → `#btn-create`) storied on its own.
CHECK: create form; created playlist-detail populated.

### T4 · PLAY FILM  🆕 new  ⚠️ G-CRUMB
Films sidebar tab → genre rail → `.film-tile` → plays direct → `#btn-play-pause` paused/playing → crumb (Home›Title). Hide `#video`.
DATA: Romcom / Friends With Benefits.

### T5 · PLAY HOME VIDEO (standalone)  🆕 new  ⚠️ G-CRUMB
Home Movies sidebar tab → Videos rail → tile → plays direct → paused/playing.
DATA: Jungle Gym (26-05-21).

### T6 · PLAY HOME VIDEOS (collection)  🆕 new
Home Movies tab → Collections rail → "Ollie" → detail (clip list) → play clip → paused/playing → crumb retrace (two-hop).
DATA: Ollie.

### T7 · PLAY ARTIST (song list)  🔁 reworked (TASK-322)
Music tab → Artists rail → artist page (`#detail-title`, `#detail-list` — a SONG LIST grouped by album header) → **tap a song** → audio → paused/playing.
DATA: Queen.  (TASK-322: no whole-artist Play/Shuffle control — tap a song to start, same as album/playlist.)

### T8 · PLAY PLAYLIST  🆕 new
Build (or reuse tv-artist-playlist's build) → `playlist-detail.html` (`#detail-list .detail-row`) → play → paused/playing. Cold DB → build first.

### T9 · SWITCHING PROFILES  🆕 new
Browse `#profile-label` control → `profile.html` → pick kid (no PIN) / adult (`.key` PIN keypad) → re-scoped browse. Mirror of C9 (no take-over-from-companion nuance).
DATA: Mommy(1111) ↔ Oliver.

### T10 · SWITCHING SCREENS  ❌ N/A
The TV *is* a screen — nothing to re-target. Multi-device switching is companion-only. **Do not author.**

### T11 · CONTINUE WATCHING  🆕 new  ⚠️ G-COLD (the confirmed-flaky one)
= the TASK-299 tv-app EXTEND that flaked ~30-50% cold. store→view→resume on the TV
browse Continue rail. **Highest feasibility risk — pin behind the TASK-299 rework.**
Fixed-progress; keep progress bar visible.

### T12 · CONTINUE LISTENING  🆕 new  ⚠️ G-COLD
Mirror of T11 on the TV Music-tab Continue Listening rail. Same cold-rail gate.

### T13 · QUEUE VIDEOS (full CRUD)  ➕ extend (partial in `tv-video-queue.cjs`)
Today: queue view + greyed Repeat pill only. NEW: full CRUD via the d-pad grid
(Up/Down rows, Left/Right across `[select, shift-up, shift-down, remove]`, Enter) —
add (detail ＋ Play Next) → `#queue-overlay` → reorder → play-now (pop) → remove.
DATA: Black Books ep 1/2/3.

### T14 · QUEUE MUSIC (full CRUD)  🆕 new
TV music queue overlay (`screen-queue.js`) d-pad CRUD: add → open queue → reorder →
play-track → remove.
DATA: first album, tracks 2 & 3.

---

# 5. Cross-cutting dependencies & related work

- **BUG-037** (REFINEMENT) — film / standalone-home-movie crumb collapses to
  `Home › Title`. Blocks the *back-to-grid* come-back on C4/C5/T4/T5. Until it
  lands, those crumb steps only reach Home (author as-is, note the limitation).
- **TASK-299** (REFINEMENT rework) — cold-server Continue-rail flake. Gates C11/C12
  and especially T11/T12. Spike live before committing any CONTINUE story.
- **Dossier action-trail** (idea, not tracked) — show each snap's click-path so the
  dossier is judgeable without booting the app. Load-bearing IF this direction is
  adopted; not a committed task while the initiative is under review.
- **This registry** — when adopted, this file (`verify-flows/STORIES.md`) is the
  story source of truth; keep `COVERAGE.md`'s `(surface,state)` matrix as a
  secondary gap-spotting section.
- **Determinism inversions**: C10 (screen swatch false-diffs — accepted),
  C11/C12/T11/T12 (feed fixed progress, KEEP bars visible — the opposite of the
  default mask).

# 6. Named gaps (deferred, NOT in this batch)

- **Desync / Browse mode** (companion-only — a whole interaction mode; BUG-035 lives
  here). High value, unstoried.
- **Playlist editing CRUD** (rename / delete / reorder / remove / add-source) — only
  create + play storied; edit surface carries active churn (TASK-262/287, BUG-033).
- **Player-control depth** (seek / jump / reset / volume-persist BUG-034 / shuffle /
  repeat / CC) — play stories tap play/pause only.
- **Lyrics + subtitles rendering** (BUG-027/028; video CC) — masked everywhere.

# 7. Fan-out plan

- **One flow per session / PR** (mirrors the TASK-299/292 pattern). PRs go to
  **grew-tv-app** (flows live in `verify-flows/`). Flip this registry's status +
  the `(surface,state)` matrix in the same PR.
- **Author DRIVING LIVE on a COLD per-flow DB** — never blind, never warm/seeded.
- **File-disjoint** by design (each flow is its own `.cjs`) — fan-out safe, but
  gate-blocked stories (G-COLD) must be spiked first, not fanned blind.
- **Suggested order** (value × feasibility, cheapest-reliable first):
  1. C4 PLAY FILM, C5/C6 HOME VIDEO(S) — new content types, no gate (bar C4/C5 crumb note).
  2. C13/C14 QUEUE (companion) — high value, deterministic, no gate.
  3. C7 PLAY ARTIST, C8 PLAY PLAYLIST — confirm G-ARTIST first.
  4. C9 SWITCHING PROFILES; C10 SWITCHING SCREENS (accept false-diff).
  5. TV batch T4–T9, T13/T14 — mirror the proven companion flows.
  6. **Gated last**: C11/C12 + T11/T12 CONTINUE — only after the TASK-299 cold-rail
     race is understood.
- **Before fanning the full set**: decide (a) per-PR flow selection + (b) parallel
  execution — run-time at ~24 flows is ~30–60 min serial today (full catalog
  re-ingest per flow per side dominates).
