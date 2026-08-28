# Scale — what costs more as the library grows

Every screen, payload and per-row computation in the app whose cost scales with
catalog size, its real max size at today's library, and whether that is a live
risk. Audit only — nothing here has been changed (TASK-496).

**Measured 2026-08-26** against the live catalog (`grew-tv-state/manifests`,
1,927 manifests) through a local media-manager, in headless Chrome 151 at
1920×1080, adults profile. Re-measure rather than trust these numbers once the
library has grown — they moved a long way in the five days between this task
being written and being run (see [Today's library](#todays-library)).

## The recommendation

Two separate answers, and it matters not to conflate them.

**Three sites hurt today:**

| site | what to do |
|---|---|
| Home Movies clip list | **Both levers.** Revive TASK-360's `loading="lazy"` + `decoding="async"` — it is no longer inert here (1,033 image requests → 22), and cap the home-movie poster at ingest, where 79% of them currently escape the 500px cap every other section respects. |
| Queue View, whole-catalog Play All | **Capped page size.** Its images are already lazy; the cost is 18,632 DOM nodes and a 513 KB snapshot per repaint. Cap `next`/`coming_up` in `build_snapshot` — the client only ever shows a lookahead. |
| Search overlay | **Capped page size.** A one-character query renders every match — 1,047 rows for `2`. Cap the rendered result list. |

**But only three of seventeen sites are actually guarded.** Thirteen render every
item they are given and nothing in them stops at any size; the fourteenth
(companion browse) has a partial cap that a growing rail defeats — see
[What caps each site](#what-caps-each-site). The three above are simply the ones
whose content type grew first. Ranking by today's pain is what this task asked
for; it is the wrong basis for deciding what to protect.

So the durable recommendation is a **shared cap, not three point fixes**. Every
unbounded site is one of four renderers — `screen-detail.js`'s `renderList`,
`components/tile.js` via `screen-browse.js`/`screen-rail-grid.js`,
`core/queue-shell-view.js`, and `core/search-rank.js`'s `searchResultsHtml`
(with each companion mirror carrying its own copy of the first). A page-size cap
at those, rather than at the three screens currently complaining, is what stops
this recurring every time a different content type has its own bulk-ingest week.

The app already ships the capped-page idiom three times — a series detail renders
one season at a time (Bluey: 52 of 154 rows), Home Movies offers a "Play All by
month" route (60 rows at the biggest month), and companion browse pages one rail
at a time. Each was added for one screen rather than adopted as the rule.

TASK-360's blanket conclusion ("`loading="lazy"` is inert on this app") **no
longer holds**, and it was never wrong — it was measured at a max of ~19 tiles,
and the app now has a screen with 1,035 rows. Worth knowing when reviving it:
**the three TV image sites are now the only places in the app without it.** Every
companion mirror already sets `img.loading = 'lazy'`, and so do the queue shell
and the search overlay. This is bringing the TV up to the standard the rest of
the app already meets, not introducing a new technique.

## Today's library

| | count |
|---|---|
| manifests total | 1,927 |
| home-movie clips | 1,033 |
| tracks / episodes / films / music videos | 351 / 325 / 93 / 76 |
| albums / series | 28 / 20 |
| `/api/browse` cards, adults | 1,211 (**1,035 of them home movies — 85%**) |
| `/api/browse` cards, kids | 48 |

Home movies were **742** when this task was written on 2026-08-21 and are
**1,033** five days later — +39%. The per-kid tagging moved with it (spec: ollie
238, millie 197, untagged 350 — today: ollie 819, millie 269, untagged 2).

### How it is growing

Every manifest's add date, from `grew-tv-state`'s own history. **Nothing here is
in steady state — the whole library was built in the last 80 days**, so treat
these as the shape of ingest, not a forecast.

| type | total | added in the last 90 days | typical add |
|---|---|---|---|
| home-movie | 1,033 | **1,033** | **bulk dumps of ~300** — 371 (19 Aug), 350 (21 Aug), 291 (23 Aug) |
| track | 351 | 351 | batches of 10–149 |
| episode | 345 | 345 | batches of 2–172 |
| film | 90 | 90 | 1–14 a day |
| music-video | 76 | 76 | 2–22 a day, all since 8 Aug |
| album / series | 28 / 28 | 28 / 28 | 1–11 a day |

The useful distinction is **step size, not rate**. Home movies arrive in dumps of
hundreds, so a site keyed to them crosses a threshold between one sitting and the
next. Everything else arrives in tens, so a site keyed to films or albums has
many months of warning — but no more of a *cap* than the home-movie screens had.
Music videos are the one to watch: 76 in seventeen days, and the Queen rail is
already the joint-largest rail in the app.

## Every site

Sorted worst first. "imgs at rest" is TASK-360's own measurement — image
requests actually issued once the page settles — run on two servers from the
same catalog: **now** = the app as it stands, **lazy** = the same app with
`loading="lazy" decoding="async"` added at the three image sites
(`components/tile.js`, `core/cover-mosaic.js`, `screen-detail.js`'s
`thumbMarkup`).

🟢 here means **fine at today's size**, not guarded — for what actually stops
each one growing, read [What caps each site](#what-caps-each-site) instead.

Every number below was painted in a real browser, with two exceptions, both
flagged in their row: the Queue View (mounted from the shared builder's own
output) and the companion Home Movies list. Both of those pages need a paired TV
session to populate, which this audit did not set up.

| site | what scales | real max today | DOM nodes | imgs at rest: now → lazy | verdict |
|---|---|---|---|---|---|
| **Home Movies clip list · All** (`screen-home-movies-list-page.js`) | one row + thumb per clip | **1,035 rows** | 7,307 (1,047 buttons, 2,082 focus targets) | **1,033 → 22** · **214 MB** of poster JPEG | 🔴 **risk** |
| **Home Movies clip list · ollie** | as above, per-kid scope | **819 rows** | 5,785 | **819 → 22** | 🔴 **risk** |
| **Companion Home Movies list** (`companion-home-movies-list.js`) | the same clips, its own renderer | **1,035 rows** | *not painted* — read from source, see below | already lazy — its `posterImg` sets `loading` | 🔴 **risk** — DOM only |
| **Queue View, Play All (All)** (`core/queue-shell-view.js`) | one row per queued item, both surfaces | **2,067 rows** (queue 2 + next 1,032 + coming-up 1,033) | **18,632** (5,177 buttons), 1.28 MB markup, 44 ms to mount, 31,600 px tall | 90 (already lazy) | 🔴 **risk** — DOM + payload, not images |
| **Search overlay** (`core/search-rank.js`) | one row per match, uncapped | **1,047 rows** for query `2`; pool is 1,501 video + 392 music candidates | 6,282 | already lazy | 🔴 **risk** |
| `GET /api/browse` | whole catalog per profile, no pagination, no compression | **391 KB / 1,211 cards** (323 B per card) | — | — | 🟠 **watch** |
| Home Movies clip list · millie | per-kid scope | 269 rows | 1,923 | 269 → 22 | 🟠 **watch** |
| TV browse · Music Videos tab (`screen-browse.js`) | every tile of every rail in the tab | 77 tiles | 520 | **76 → 15** | 🟠 **watch** |
| TV browse · Films tab | as above | 65 tiles | 502 | **55 → 23** | 🟠 **watch** |
| Series detail · Bluey (`screen-detail.js`) | one row + thumb per episode, **one season at a time** | 52 of 154 rows | 395 | 53 → 22 | 🟢 fine |
| TV browse · Music tab | tiles per rail | 53 tiles | 408 | 28 → 18 | 🟢 fine |
| Home Movies clip list · month | per-month scope | 60 rows | 449 | 60 → 22 | 🟢 fine |
| Rail grid "See All" (`screen-rail-grid.js`) | every tile of one rail | 28 tiles (Albums, MV Queen); 44 with no posters (HM months) | 191 | 28 → 20 / 28 → 28 / 0 → 0 | 🟢 fine |
| Artist page · QOTSA (`screen-artist-page.js`) | one row per track, album-grouped, no chips | 111 rows | 816 | 9 → 3 (tracks share album art) | 🟢 fine |
| Playlist detail (`screen-playlist-detail-page.js`) | one row per track | 29 rows | 332 | 3 → 3 | 🟢 fine |
| Album detail | one row per track | 19 rows | 164 | 1 → 1 (one shared poster) | 🟢 fine |
| Companion browse grid (`companion-browse.js`) | text tiles, **one rail at a time** | 44 tiles | ~130, zero `<img>` | none — no `<img>` exists | 🟢 fine |
| d-pad step on a row list (`screen-detail.js` `verticalStops`) | a fresh `querySelectorAll` over every row, per keypress | 1,035 rows | — | — | 🟢 fine — 0.014 ms @60 rows → **0.214 ms @1,035**, linear but 75× under a frame |
| Catalog ingest (`loader.py`) | full wipe + reload of every manifest at boot | 1,878 videos, 48 collections | 744 KB SQLite | — | 🟢 fine — **110–250 ms**, measured not assumed |

## What caps each site

The table above ranks by cost *today*. This one asks the different question:
**what stops this site growing?** Every renderer here is linear — it draws one
row or tile per item it is handed — so the "at 5×" column is exact arithmetic,
not a model. It is the more useful table of the two: today's ranking tells you
what to fix this week, this one tells you what to guard.

| site | grows with | what caps it | today | at 5× |
|---|---|---|---|---|
| Series detail | one season | ✅ **season chips** — a season is ~50 episodes however large the library gets | 52 rows | **52 rows** |
| Album detail | one album | ✅ **album length** | 19 rows | **19 rows** |
| Profile picker | the family | ✅ **five people** | 5 tiles | **5 tiles** |
| Home Movies list · All | home movies | ❌ nothing | 1,035 rows | 5,175 rows |
| Home Movies list · per kid | one kid's clips | ❌ nothing | 819 rows | 4,095 rows |
| Queue View, Play All | a whole media type | ❌ nothing | 2,067 rows | 10,335 rows |
| Search overlay | the whole catalog | ❌ nothing | 1,047 rows | 5,235 rows |
| `GET /api/browse` | the whole catalog | ❌ nothing — no pagination, no compression | 391 KB | **1.9 MB** |
| TV browse tab | one section's rails | ❌ nothing | 77 tiles (77 eager images) | 385 tiles |
| Rail grid "See All" | one genre or artist | ❌ nothing | 28 tiles | 140 tiles |
| Artist page | one artist's tracks | ❌ nothing | 111 rows | 555 rows |
| Playlist detail | what you put in it | ❌ nothing | 29 rows | 145 rows |
| Companion browse grid | the largest single rail | ⚠️ one rail at a time — but a rail is uncapped | 44 tiles | 220 tiles |
| "Play All by month" rail | the calendar | ❌ nothing — **+12 tiles a year, forever**, whatever happens to clip counts | 44 tiles | 44 + 12/yr |
| d-pad step (`verticalStops`) | rows on the page | ❌ nothing — a fresh `querySelectorAll` per keypress | 0.214 ms | ~1 ms |
| `loader.py` ingest | the whole catalog | ❌ nothing — but a very small constant | 110–250 ms | ~1 s |
| Companion Home Movies list | home movies | ❌ nothing | 1,035 rows | 5,175 rows |

**Of seventeen: three capped, one partially, thirteen not at all.** The three
sites in the recommendation are not the
three that are structurally exposed — they are the three whose content type had
its bulk ingest first. Home movies simply got there before films did.

Two on that list deserve naming even though they read green today:

- **`/api/browse`** is the one every screen pays. It is fetched by browse, the
  clip list, the rail grid, companion browse and search, and it carries the whole
  catalog with no pagination and no compression. At 5× it is a ~2 MB fetch on
  every page load, and 85% of it is home-movie clips that most screens never
  render.
- **The month rail** is the only site here that grows on the calendar rather than
  on content. It gains twelve tiles a year even if not one more clip is ever
  added — which makes it the one thing on this list guaranteed to become a
  problem eventually.

## The flagship: Home Movies "All"

Opening it costs **1,033 HTTP image requests and 214 MB of JPEG**, over the LAN,
into a 2014 Mac Mini running Chrome in kiosk mode. Two independent causes, and
each has its own fix:

**1. The thumbnails are not lazy.** `screen-detail.js`'s `thumbMarkup` builds a
bare `<img>`, so every row's poster is fetched whether or not it is anywhere
near the viewport. Adding the two attributes takes it to **22** — the rows that
actually fit on screen. This is the case TASK-360 could not construct: at 19
tiles Chrome's lazy threshold pre-loads past the viewport anyway, and at 1,035
rows it plainly does not.

**2. Most of the posters escaped TASK-359's size cap.** Measured across every
poster on disk, not a sample — `ART_MAX_WIDTH` is 500, and every section
respects it except this one:

| section | posters | over 500px wide | dimensions seen | median | max | total |
|---|---|---|---|---|---|---|
| **home movies** | 1,033 | **813 (79%)** | 1080×1920 (673), 1920×1080 (140), **500×889 (180)** | **166 KB** | 865 KB | **214 MB** |
| films | 55 | 0 | 500×750 | 76 KB | 124 KB | 4.3 MB |
| music videos | 76 | 0 | 500×281 | 21 KB | 60 KB | 1.7 MB |
| albums | 23 | 0 | 500×500 | 71 KB | 133 KB | 1.6 MB |
| series | 4 | 0 | 500×750 | 79 KB | 80 KB | 0.2 MB |

**The 21% that are capped explain the mechanism.** A home-movie poster is a frame
grab, and `fetch-covers.py`'s `generate_frame` runs `ffmpeg -frames:v 1` with no
`-vf scale` of its own — so the poster inherits whatever resolution the *video*
ended up at. `home-movie-ingest.py` caps resolution only on its transcode path:
"a clip already at or under the cap passes through unscaled; the cap only
applies during a transcode pass". So a clip that needed transcoding got a capped
video and therefore a 500-wide poster; a clip that was already clean h264 took
the remux-only path, was never resized, and its poster came out at full source
resolution.

It is not that the cap was forgotten — it is that the poster path has no cap of
its own and borrows one by accident. Which half of the library you land in
depends on what your phone recorded in.

At 1080×1920 a poster is 8.3 MB of decoded bitmap against roughly 0.6 MB for a
capped one. This is exactly the lever TASK-359 measured on the Albums grid
(31 MB → 0.88 MB decoded); it simply never reached the section that is now 85%
of the catalog. Capping it is a backend/ingest change, it needs a re-run over
the 813 existing posters, and it shrinks the fetch even for the rows that *are*
on screen — which lazy loading alone does not.

The two fixes are independent and both worth having: lazy loading cuts the
*number* of fetches, the cap cuts the *size* of each.

## The materialized Play-All queue

`build_snapshot` (`media-manager/api/queue_playback.py`) resolves full metadata
for the entire remaining permutation — `next` is `cur[pos+1:]` and, with repeat
on, `coming_up` is a whole further permutation. Neither is capped. For Home
Movies "Play All (All)":

| | repeat off | repeat on |
|---|---|---|
| snapshot | 256 KB, 1,034 entries | **513 KB, 2,067 entries** |
| rendered Queue View | 860 KB markup, 11,402 nodes | **1.28 MB markup, 18,632 nodes, 5,177 buttons** |
| mount + layout | 33 ms | 44 ms |

That snapshot is not fetched once — it is **broadcast over the WebSocket on
every item change and every queue mutation**, to both surfaces. The images here
are already `loading="lazy"` (only 90 fetch at rest), so this is a DOM and
payload problem, not an artwork one, and the fix is a cap on the lookahead
rather than anything on the client. The client shows a lookahead list; it has
no use for 1,033 items of it.

Measurement note: the Queue page needs a paired TV session to populate, so these
numbers come from mounting the shared builder's own output — `queueShellHtml`
run on the live server snapshot — into a real Chrome page, rather than from
driving the page itself.

## The search overlay

`searchResultsHtml` renders every ranked match with no cap, and the candidate
pool is the whole catalog (1,501 video items — every browse card plus every
episode — and 392 music items). Because a home-movie clip's title is its capture
timestamp (`2023-01-08 20:02 (20s)`), a single digit matches almost all of them:

| query | rows | markup | elements |
|---|---|---|---|
| `2` | **1,047** | 316 KB | 6,282 |
| `20` | 1,038 | 313 KB | 6,228 |
| `2025` | 427 | 129 KB | 2,562 |
| `e` | 342 | 105 KB | 2,052 |
| `queen` | 5 | 1.6 KB | 30 |

Typing `2` as the first character of a search is ordinary use, not an edge case,
and the result list is rebuilt on every keystroke. The thumbs are already lazy,
so this too is a DOM cost.

## Where a cap would have to go

A page-size cap is not one change. The Queue View and the search overlay each
have exactly one renderer shared by both surfaces, but **every other list is
written twice** — the TV screen and its companion mirror each build their own
rows, sharing only the `core/` model beneath:

| list | TV | companion |
|---|---|---|
| Queue View | `core/queue-shell-view.js` — **one shared builder** | |
| Search results | `core/search-rank.js` `searchResultsHtml` — **one shared builder** | |
| Home Movies clips | `screen-detail.js` `renderList` | `companion-home-movies-list.js` `clipRow` |
| Series / album detail | `screen-detail.js` `renderList` | `companion-detail.js` `trackNode` |
| Artist tracks | `screen-detail.js` `renderList` | `companion-artist.js` `songTrackNode` |
| Playlist tracks | `screen-detail.js` `renderList` | `companion-playlist.js` `trackRow` |
| Browse tiles | `components/tile.js` `createTile` | `companion-browse.js` `nameTile` |

So the TV side collapses to two builders (`renderList`, `createTile`) and the
companion side to five. The mirror invariant means a cap has to land on both
halves of each row in the same task, and the companion halves are the ones with
no shared implementation to change once.

This is also why the companion is already fully lazy while the TV is not: each
of those five companion builders sets `img.loading` for itself, and the two TV
builders never did.

**The one measurement gap this audit leaves.** `companion-home-movies-list.js`
draws the same 1,035 clips as the flagship screen through its own `clipRow`, so
it pays the same order of per-row DOM cost — but that row is read from source,
not painted, because the page needs a paired TV session. Its thumbs *are* lazy
(`posterImg` sets `loading`), so the image half is settled; it is the DOM half
that is inferred. Worth painting properly before anyone sizes a fix for it.

## Sites the spec named that no longer exist

`core/video-queue-view.js`, `core/music-video-queue-view.js` and
`core/queue-view.js` were all replaced by the one `core/queue-shell-view.js`
(TASK-515/525), which is the row above. `screen-profile-page.js` /
`companion-profile.js` do not scale with the catalog at all — they render one
tile per family member (5), fixed.

## Two things noticed, neither a scale question

Recorded because they turned up while counting, not as findings of this audit:

- The Home Movies clip list renders **1,035 rows for 1,033 clips** —
  `homeMoviesListItems` filters on `section === 'home-movies'`, which also
  matches the two home-movies *collection* cards.
- The QOTSA playlist stores **90 `track_ids`** but `/api/playlist` resolves
  **29** items, which is what the detail screen renders.

## How to re-run this

Two servers, same catalog, one with the lazy attributes patched in:

```bash
python3.12 ~/dan-grew-repos/grew-tv/media-manager/core/media-manager.py \
  --port 8965 --ws-port 8966 --https-port 8967 \
  --app-dir        <this repo> \
  --manifest-dir   ~/dan-grew-repos/grew-tv-state/manifests \
  --content-root   ~/rips \
  --state-repo-dir /tmp/grew-state-baseline
```

Then drive headless Chrome over CDP (no test-runner install needed — Node's
built-in `WebSocket` speaks it), navigating each page, seeding
`grew-tv-person` / `grew-tv-profile` in `localStorage` before boot, letting it
settle 4 s, and counting `Network.requestWillBeSent` events of type `Image`
against `/media/`. DOM counts come from `Runtime.evaluate`. Payload sizes are
`curl -w '%{size_download}'` against `/api/browse` and `/api/queue/{type}`.

The other three measurements need no browser:

- **Poster sizes** — read the JPEG `SOFn` marker of every file under
  `--content-root` that a browse card names, grouped by section. Do it over all
  of them: sampling one file gives 1080×1920 and misses that a fifth of them are
  already capped, which is the part that explains why.
- **Growth** — `git log --diff-filter=A --name-only --date=short -- manifests` in
  `grew-tv-state`, bucketed by filename prefix. Add dates, not file mtimes.
- **Ingest** — call `loader.run_ingest` directly against the real manifest dir
  and time it, rather than timing a whole server boot around it.

Caveat worth carrying: every timing here is from the dev Mac. The TV kiosk is a
2014 Mac Mini — the counts and byte sizes transfer unchanged, the milliseconds
do not.

**Refs:** [`ARCHITECTURE.md`](ARCHITECTURE.md) · TASK-360 (grew-tv-app PR #257,
closed unmerged — the prior lazy-load attempt and this measurement's
methodology) · TASK-359 (grew-tv PR #425 — the decoded-artwork cap) · BUG-435
(grew-tv PR #466 — the same cap reaching music-video posters)
