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

**Three sites need mitigation. Everything else is fine as is.**

| site | what to do |
|---|---|
| Home Movies clip list | **Both levers.** Revive TASK-360's `loading="lazy"` + `decoding="async"` — it is no longer inert here (1,033 image requests → 22), and cap the home-movie poster at `ART_MAX_WIDTH` at ingest, which is the one artwork path TASK-359's cap never reached. |
| Queue View, whole-catalog Play All | **Capped page size.** Its images are already lazy; the cost is 18,632 DOM nodes and a 513 KB snapshot per repaint. Cap `next`/`coming_up` in `build_snapshot` — the client only ever shows a lookahead. |
| Search overlay | **Capped page size.** A one-character query renders every match — 1,047 rows for `2`. Cap the rendered result list. |

TASK-360's blanket conclusion ("`loading="lazy"` is inert on this app") **no
longer holds**, and it was never wrong — it was measured at a max of ~19 tiles,
and the app now has a screen with 1,035 rows. Reviving those two attributes
helps at four sites and is inert at the rest, exactly as PR #257 predicted it
would become "the moment a rail grows past a screenful".

The app already ships the capped-page idiom twice — a series detail renders one
season at a time (Bluey: 52 of 154 rows), and Home Movies offers a "Play All by
month" route (60 rows at the biggest month). The gap is that **"All" and a
per-kid scope have no such key**, so they render the whole catalog.

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
**1,033** five days later — +39%, from a bulk ingest rather than a steady rate.
The per-kid tagging moved with it (spec: ollie 238, millie 197, untagged 350 —
today: ollie 819, millie 269, untagged 2).

## Every site

Sorted worst first. "imgs at rest" is TASK-360's own measurement — image
requests actually issued once the page settles — run on two servers from the
same catalog: **now** = the app as it stands, **lazy** = the same app with
`loading="lazy" decoding="async"` added at the three image sites
(`components/tile.js`, `core/cover-mosaic.js`, `screen-detail.js`'s
`thumbMarkup`).

| site | what scales | real max today | DOM nodes | imgs at rest: now → lazy | verdict |
|---|---|---|---|---|---|
| **Home Movies clip list · All** (`screen-home-movies-list-page.js`) | one row + thumb per clip | **1,035 rows** | 7,307 (1,047 buttons, 2,082 focus targets) | **1,033 → 22** · **214 MB** of poster JPEG | 🔴 **risk** |
| **Home Movies clip list · ollie** | as above, per-kid scope | **819 rows** | 5,785 | **819 → 22** | 🔴 **risk** |
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

**2. The posters escaped TASK-359's size cap.** A home-movie poster is a frame
grab, and `fetch-covers.py`'s `generate_frame` runs `ffmpeg -frames:v 1` with
**no `-vf scale` cap** — unlike `music-video-ingest.py`, which BUG-435 gave the
`min(ART_MAX_WIDTH, iw)` downscale. The result on disk:

| section | poster dimensions | median | max |
|---|---|---|---|
| **home movies** | **1080 × 1920** | **166 KB** | 865 KB |
| music videos | 500 × 281 | 21 KB | 60 KB |
| films | 500 × 750 | 76 KB | 124 KB |
| albums | 500 × 500 | 71 KB | 133 KB |

`ART_MAX_WIDTH` is 500. Home-movie art ships at full video resolution — 8.3 MB
of decoded bitmap per poster against roughly 0.6 MB for a capped one. This is
exactly the lever TASK-359 measured on the Albums grid (31 MB → 0.88 MB
decoded); it simply never reached the one section that is now 85% of the
catalog. Capping it is a backend/ingest change, and it shrinks the fetch even
for the rows that *are* on screen — which lazy loading alone does not.

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

Caveat worth carrying: every timing here is from the dev Mac. The TV kiosk is a
2014 Mac Mini — the counts and byte sizes transfer unchanged, the milliseconds
do not.

**Refs:** [`ARCHITECTURE.md`](ARCHITECTURE.md) · TASK-360 (grew-tv-app PR #257,
closed unmerged — the prior lazy-load attempt and this measurement's
methodology) · TASK-359 (grew-tv PR #425 — the decoded-artwork cap) · BUG-435
(grew-tv PR #466 — the same cap reaching music-video posters)
