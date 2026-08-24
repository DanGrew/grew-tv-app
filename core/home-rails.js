// Home rails (TASK-117). Pure grouping of v3 /api/browse cards into the titled
// rows the TV Home renders: Continue Watching, Series, Films. Reuses the
// progress model (core/progress.js) so "which videos are mid-watch and in what
// order" stays provable without a browser. DOM/render lives in the screen.
//
// cards:    v3 browse entries {kind:'video'|'series', id, title, poster, duration?, ...}
// progress: { id: { resumePositionSec, lastPlayed } } (from /api/continue-watching)

import { continueWatching } from './progress.js';

// Normalize a browse card's `duration` (seconds, the backend's name) to the
// `durationSec` the tile/progress model expects. Non-mutating shallow copy.
function withDurationSec(card) {
  var c = {};
  for (var k in card) { if (card.hasOwnProperty(k)) c[k] = card[k]; }
  c.durationSec = card.duration != null ? card.duration : card.durationSec;
  return c;
}

export function buildRails(cards, progress) {
  var all = (cards || []).map(withDurationSec);
  var videos = all.filter(function(c) { return (c.kind || 'video') === 'video'; });
  var series = all.filter(function(c) { return c.kind === 'series'; });
  var cw = continueWatching(videos, progress);

  var candidates = [
    { id: 'continue', title: 'Continue Watching', items: cw },
    { id: 'series', title: 'Series', items: series },
    { id: 'films', title: 'Films', items: videos }
  ];
  // Omit any empty rail — Continue Watching when nothing is mid-watch (the
  // spec's explicit rule), and empty Series/Films too so the grid never shows a
  // titled-but-bare row.
  return candidates.filter(function(r) { return r.items.length > 0; });
}

// ---------------------------------------------------------------------------
// FEAT-027 (TASK-163) — the app is TYPE-AGNOSTIC. content-types.json is the
// single source of truth; the backend stamps a derived `section` on every
// /api/browse card (TASK-162) and the app groups by it. No `format`/`mediaType`
// or type enum lives here anymore: adding a content type is one backend
// descriptor row, the app needs no change and cannot drift out of sync.
//
// The browse screen is a section sidebar (Series / Films / Home Movies /
// Albums); selecting a tab swaps the rail area to that section's rails.
// Series/Films group by genre (genres[], falling back to [type]); Home Movies
// splits into Collections + Videos by card kind (TASK-183); the Music section
// lists albums. Each section tab leads with a Continue Watching rail of that
// section's in-progress items.
//
// SECTION_TITLE/SECTION_ORDER are pure presentation — a section's tab label and
// fixed display order — NOT type routing. Sections (server-supplied):
// 'series' | 'films' | 'home-movies' | 'music' | 'music-videos'.

var SECTION_TITLE = {
  'series': 'TV Series',
  'films': 'Films',
  'home-movies': 'Home Movies',
  'music': 'Music',
  'music-videos': 'Music Videos'
};

// Fixed display order; which tabs actually appear is data-driven (below).
// Music Videos sits right after Music (TASK-376) — the owner's shape is a
// sibling of Music, not a shelf inside it.
var SECTION_ORDER = ['series', 'films', 'home-movies', 'music', 'music-videos'];

// A card's section. The backend stamps it on every browse card; fall back to
// Films so an unstamped (legacy/typo) card is shown rather than silently dropped.
// Exported (TASK-503) so a ＋Queue dispatch table can route by media type
// without re-deriving this fallback itself — cardRoute() collapses film and
// home-movie cards to the same 'video' route (both are the shared "standalone
// video" nav target), which isn't fine-grained enough to pick a queue engine.
export function sectionOf(card) { return card.section || 'films'; }

// Where selecting a browse card navigates: an artist tile (FEAT-029, synthesised
// for the Music tab's Artists rail) opens the artist drill-down; a playlist card
// (FEAT-036), including a music-video playlist (TASK-376: it's a user playlist
// like any other, same state-DB route, just holding a different item type),
// opens the playlist detail; a lone music-video card (section 'music-videos',
// TASK-373) plays through the SAME player but MUST NOT route as a plain 'video'
// — that would fire the server-authoritative engine action the owner ruled out
// reusing for a music video (TASK-374); any other music card (album) opens
// album detail; otherwise the card's own kind ('video' plays, 'series' opens
// collection detail). Routes on `kind`/server `section`/`collectionType`, never
// a type enum. Pure so the browse screen stays DOM-only (no-pure-fn-outside-core).
//
// CARD_ROUTES is every value the function below can return — the single source
// of truth both a consumer table and arch-check's `no-missing-card-route` rule
// read (TASK-383). Add a new return branch below -> add its value here too, or
// the check can't see the new route to enforce it. TASK-486: 'play-all' needs
// no new branch below — a Play All tile's own `kind: 'play-all'` already falls
// through the final `card.kind || 'video'` line, same as 'series'/'artist'
// would if their own earlier checks were removed.
export var CARD_ROUTES = ['artist', 'playlist', 'music-video', 'album', 'video', 'series', 'track', 'play-all'];

export function cardRoute(card) {
  if (card.kind === 'artist') return 'artist';
  if (card.collectionType === 'playlist' || card.collectionType === 'music-video-playlist') return 'playlist';
  if (card.section === 'music-videos') return 'music-video';
  if (card.section === 'music') return 'album';
  return card.kind || 'video';
}

// Index browse cards by id -> card, so a continue-watching row (which carries no
// `section`) can borrow its section from the browse card it belongs to: a bound
// item (episode/track) from its owning collection, a standalone (film/home-movie)
// from its own card. Keeps the app from re-deriving a type from the row.
// Its sole caller (buildTabRails) always passes the already-normalized `all`
// array, so no `cards || []` guard is needed here (it was an unreachable
// branch — TASK-315).
function cardIndex(cards) {
  var byId = {};
  cards.forEach(function(c) { byId[c.id] = c; });
  return byId;
}

// The browse card a CW row maps to: its owning collection when set (episode ->
// series, track -> album), else the item's own standalone card (film/home-movie).
// null when neither is on the browse page (so the row belongs to no visible tab).
function rowCard(row, byId) {
  if (row.collection_id && byId[row.collection_id]) return byId[row.collection_id];
  return byId[row.item_id] || null;
}

// A CW row's section, via its browse card (above). Unknown -> null.
function rowSection(row, byId) {
  var card = rowCard(row, byId);
  return card ? sectionOf(card) : null;
}

// Clamp an index into [0, len-1] (empty -> 0). Shared with the UI focus model.
export function clampIndex(i, len) {
  return Math.max(0, Math.min(len - 1, i));
}

function titleCase(slug) {
  return String(slug).split('-')
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(' ');
}

// Display label for a genre slug: an explicit genreLabels override, else the
// title-cased slug ('rom-com' -> 'Rom-Com', 'other' -> 'Other').
function labelFor(slug, labels) {
  var map = labels || {};
  if (map[slug]) return map[slug];
  return titleCase(slug);
}

// Genres a card belongs to: explicit genres[], else [type], else ['other'].
function genresOf(card) {
  if (Array.isArray(card.genres) && card.genres.length) return card.genres;
  if (card.type) return [card.type];
  return ['other'];
}

// TASK-444 — the `people` tags a Home Movies card belongs to: explicit
// people[], else ['other'] so an untagged clip still lands in a rail rather
// than disappearing (mirrors genresOf's fallback shape, keyed differently).
function peopleOf(card) {
  if (Array.isArray(card.people) && card.people.length) return card.people;
  return ['other'];
}

// A box-set is a collection of films (collectionType 'boxset', section 'films').
// It gets its own Films rail rather than repeating inside the genre rows.
function isBoxset(card) { return card.collectionType === 'boxset'; }

function cmpStr(a, b) {
  // localeCompare is already case-insensitive at its primary (base-letter) level,
  // so it gives A-Z ordering without an explicit case fold — and dropping the fold
  // leaves nothing here for the gate to mark equivalent.
  return String(a).localeCompare(String(b));
}

// A sortable title: the item's own, or '' when absent (an untitled item sorts
// first). Shared by the rail sort and the album tie-break so the fallback is
// exercised on whichever operand is untitled, not only the first.
function titleOf(x) { return x.title || ''; }

function sortItems(items) {
  // Callers always build a fresh array (filter/map/concat) for us, so sorting in
  // place is safe and no defensive copy is needed.
  return items.sort(function(a, b) { return cmpStr(titleOf(a), titleOf(b)); });
}

// A home-movie clip's own capture date (tags.date, 'YYYY-MM-DD' — see
// home-movie-ingest.py), or '' when absent. Mirrors albumYear's tags read.
function captureDateOf(card) {
  var tags = card.tags || {};
  return tags.date || '';
}

// TASK-491 — a home-movie clip's capture year-month ('YYYY-MM'), or '' when
// its capture date is absent. captureDateOf's own 'YYYY-MM-DD' is always
// month-prefixed, so slicing is enough — no separate parse.
function monthOf(card) {
  return captureDateOf(card).slice(0, 7);
}

var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// TASK-491 — a year-month's display label ('2026-08' -> 'Aug 2026'), the
// month tile rail's own title. Every value reaching this is one monthOf
// itself derived from a real capture date (every clip gets one at ingest),
// so no fallback for an unparseable value is needed.
function monthLabel(yearMonth) {
  var parts = String(yearMonth).split('-');
  return MONTH_NAMES[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
}

// TASK-444 — Home Movies rail item order: newest capture date first. Ties
// (including two clips with no readable date) fall back to title, same
// tie-break shape as albumsByArtist's year comparator.
function cmpDateDesc(a, b) {
  var da = captureDateOf(a), db = captureDateOf(b);
  if (da === db) return cmpStr(titleOf(a), titleOf(b));
  return cmpStr(db, da);
}

// Group cards by a slug list, A-Z by group label then item title.
// keyer(card) -> [slug]; labeler(slug) -> display title.
//
// TASK-502 dropped the itemCmp override this took: its one caller was the
// Home Movies person rails, and with those rails gone their items are never
// rendered, so a second item order had no consumer left.
function groupBySlug(cards, keyer, labeler) {
  var groups = {};
  cards.forEach(function(card) {
    keyer(card).forEach(function(slug) {
      groups[slug] = groups[slug] || [];
      groups[slug].push(card);
    });
  });
  var cmp = function(a, b) { return cmpStr(titleOf(a), titleOf(b)); };
  return Object.keys(groups)
    .map(function(slug) {
      return { slug: slug, title: labeler(slug), items: groups[slug].sort(cmp) };
    })
    .sort(function(a, b) { return cmpStr(a.title, b.title); });
}

// The same grouping turned into RAILS — each group given the prefixed rail id
// the browse grid renders and the See All drilldown routes on. TASK-502: Home
// Movies groups its clips by kid WITHOUT those groups becoming rails, so the
// id is minted here rather than in groupBySlug, and no caller is left
// fabricating an id nothing reads.
function groupRails(cards, keyer, labeler, prefix) {
  return groupBySlug(cards, keyer, labeler).map(function(g) {
    return { id: prefix + g.slug, slug: g.slug, title: g.title, items: g.items };
  });
}

// A CW row -> a video tile card. The label prefixes the owning collection when
// present ("Bluey · Daddy Putdown" for an episode; bare title for a standalone
// film / home movie). Generic by design: a future audio track reads
// "Album · Track" with no rail change. kind:'video' so selecting plays the
// item_id (the episode itself, not its series).
//
// `series` carries the owning collection id (BUG-005): an episode opened from
// this tile must launch the player WITH its series context, or Next/Prev are
// dead (the player reads series only from the URL). null for a standalone
// film/home-movie, which navTo then drops so it stays seriesless.
function cwCard(row) {
  var label = row.collection_title
    ? row.collection_title + ' · ' + (row.title || '')
    : (row.title || '');
  return {
    kind: 'video',
    id: row.item_id,
    title: label,
    poster: row.poster,
    durationSec: row.duration_secs,
    series: row.collection_id
  };
}

// The Continue Watching rail for one (video) section: the CW rows whose section
// is this tab's, kept in the backend's newest-first order (not re-sorted). The
// section is borrowed from each row's browse card (rowSection), so a music row
// never matches a video section — an in-progress track can't leak into Films.
// Omitted when this tab has nothing in progress.
function continueRail(sectionId, cwRows, byId) {
  if (!cwRows) return [];
  var items = cwRows
    .filter(function(r) { return rowSection(r, byId) === sectionId; })
    .map(cwCard);
  return [{ id: 'continue', title: 'Continue Watching', items: items }]
    .filter(function(rail) { return rail.items.length > 0; });
}

// FEAT-045 (TASK-318) — the Music section's lead rail: "Recently Played". The
// backend (TASK-317) records the last 5 SOURCES a person opened (album /
// playlist / artist — not shuffle-all), deduped by source, newest-first, and
// serves them as `recents` [{source_type, source_id, last_played}]. This maps
// each entry's source_id to its existing browse tile (recentsIndex), preserving
// the backend order — so a tap is the same navigation as any album/playlist/
// artist tile (fast access, not a resume button). An id missing from the cards
// (unavailable / profile-filtered) is skipped safely. Omitted when recents is
// empty — the tab then leads with Playlists (Stories 1-9). Replaces the old
// inferred Continue Listening (album roll-up + TASK-285 playlist tiles), which
// read watch_progress; the rail no longer reads progress at all.
function recentlyPlayedRail(recents, byId) {
  if (!recents) return [];
  var items = recents
    .map(function(r) { return byId[r.source_id]; })
    .filter(Boolean);
  return [{ id: 'recent', title: 'Recently Played', items: items }]
    .filter(function(rail) { return rail.items.length > 0; });
}

// Index a music source_id -> its browse tile for the Recently Played rail.
// Albums & playlists are keyed by their card id (recents source_id === card id).
// A synthesised artist tile is keyed by its ARTIST NAME, because the backend
// records an artist source by name (source_id = the ?artist= param, e.g. 'ELO')
// while the tile's own id is prefixed ('artist:ELO'). One index resolves all
// three source types.
function recentsIndex(cards) {
  var byId = {};
  cards.filter(function(c) { return sectionOf(c) === 'music'; })
    .forEach(function(c) { byId[c.id] = c; });
  artistTiles(cards).forEach(function(t) { byId[t.artist] = t; });
  return byId;
}

// A simple titled rail of the given cards (A-Z by title), or [] when empty.
function simpleRail(id, title, cards) {
  return cards.length ? [{ id: id, title: title, items: sortItems(cards) }] : [];
}

// FEAT-029 — the Music section's Artists rail. One tile per distinct album
// artist, square art borrowed from that artist's first album (A-Z by title),
// labelled "N album(s)". kind:'artist' routes the tile to the artist drill-down
// (cardRoute); section:'music' gives it the same square art as an album tile.
// Albums with no `artist` are omitted here (they still appear in the Albums
// rail). Sorted A-Z by artist name.
export function artistTiles(cards) {
  var albums = cards.filter(function(c) { return sectionOf(c) === 'music' && c.artist; });
  var byArtist = {};
  albums.forEach(function(c) { byArtist[c.artist] = (byArtist[c.artist] || []).concat([c]); });
  // No .sort() here: the sole rail caller (simpleRail) sorts its items, and
  // recentsIndex only indexes these by name — so an internal sort would be
  // redundant (and invisible to the mutation gate behind simpleRail's sort).
  return Object.keys(byArtist).map(function(name) {
    var list = sortItems(byArtist[name]);
    var n = list.length;
    return {
      kind: 'artist', id: 'artist:' + name, artist: name, title: name,
      poster: list[0].poster || null, section: 'music',
      subLabel: n === 1 ? '1 album' : n + ' albums'
    };
  });
}

// An album's release year as a number, from the browse card's tags.year
// (backend exposes it on the album card). null when absent/unparseable — the
// live app sees no year until the backend is redeployed, so those fall back to
// title order below rather than throwing.
function albumYear(card) {
  var tags = card.tags || {};
  var y = parseInt(tags.year, 10);
  return isNaN(y) ? null : y;
}

// The artist name from a routing id. Artist rail tiles carry a prefixed id
// (`artist:NF`, see artistTiles) but a clean `artist` field; companion browse
// opens the artist page with the prefixed id (`?id=artist:NF`) while the TV/WS
// path passes the clean name. Strip a leading `artist:` so the artist page
// resolves both to the clean key (BUG-029). Pure → unit-tested.
export function artistFromId(id) {
  var s = id || '';
  return s.indexOf('artist:') === 0 ? s.slice('artist:'.length) : s;
}

// The albums of one artist for the artist drill-down page (FEAT-029), newest
// first by release year, then A-Z by title (yearless albums sort last). Pure so
// the page stays DOM-only (no-pure-fn-outside-core).
export function albumsByArtist(cards, artist) {
  if (!cards) return [];
  var all = cards.map(withDurationSec);
  var mine = all.filter(function(c) { return sectionOf(c) === 'music' && c.artist === artist; });
  return mine.sort(function(a, b) {
    // Yearless -> 0 so it sorts oldest (last) under newest-first `yb - ya`, which
    // makes the explicit null branches redundant (null coerces to 0 anyway).
    var ya = albumYear(a) || 0;
    var yb = albumYear(b) || 0;
    if (ya === yb) return cmpStr(titleOf(a), titleOf(b));
    return yb - ya;
  });
}

// The Music section's rails: Recently Played (lead, FEAT-045 TASK-318), then the
// Playlists rail (FEAT-039 TASK-234 — owner wants it directly under the lead
// rail), then an Artists rail (FEAT-029) of one tile per artist, then an Albums
// rail. Albums and Playlists both sit in the music section but split on
// `collectionType` — a playlist routes to its own detail (cardRoute), so it must
// not leak into the Albums rail. (No Singles rail — a standalone song is a
// 1-track album; FEAT-027.) Square-art tiles are CSS; the rail shape is identical
// to the video tabs so the browse screen renders it as-is.
function musicRails(cards, recents) {
  var music = cards.filter(function(c) { return sectionOf(c) === 'music'; });
  var albums = music.filter(function(c) { return c.collectionType !== 'playlist'; });
  var playlists = music.filter(function(c) { return c.collectionType === 'playlist'; });
  return recentlyPlayedRail(recents, recentsIndex(cards))
    .concat(simpleRail('playlists', 'Playlists', playlists))
    .concat(simpleRail('artists', 'Artists', artistTiles(cards)))
    .concat(simpleRail('albums', 'Albums', albums));
}

// TASK-376 — the Music Videos section's rails: a Playlists rail (mirrors Music's,
// own id `mv-playlists` — the Playlists-heading ＋ create affordance (TASK-378) is
// keyed off rail.id and matches this id too, creating a `music-video-playlist`
// here rather than a plain one), then a rail PER ARTIST holding that artist's
// music videos directly — the owner's shape names a rail per artist, not a single
// Artists-tile rail leading to a drill-down (that's Music's own shape; this is its
// own contents). No Albums rail — music-video albums are out of scope (owner,
// 2026-08-06).
function musicVideoRails(cards) {
  var mv = cards.filter(function(c) { return sectionOf(c) === 'music-videos'; });
  var playlists = mv.filter(function(c) { return c.collectionType === 'music-video-playlist'; });
  var videos = mv.filter(function(c) { return c.collectionType !== 'music-video-playlist' && c.artist; });
  var artistRails = groupRails(videos, function(c) { return [c.artist]; }, function(slug) { return slug; }, 'mv-artist:');
  return simpleRail('mv-playlists', 'Playlists', playlists).concat(artistRails);
}

// Guarantee a Playlists rail on the Music tab even when there are no playlists,
// so the browse screen always renders the "Playlists ＋" heading (the create
// affordance lives on the heading now — TASK-235 — not as a rail tile). When
// musicRails (simpleRail) omitted the empty rail, synthesise an empty one and place
// it directly AFTER Recently Played (TASK-234/318 order; leading when nothing has
// been played). Pure (no DOM) so it lives in core; both the TV browse screen and
// the companion (TASK-424 — ＋ is now gated on landing on this rail) call it for
// the music tab after buildTabRails.
export function withPlaylistsRail(rails) {
  var hasRail = rails.some(function(r) { return r.id === 'playlists'; });
  if (hasRail) return rails;
  var newRail = { id: 'playlists', title: 'Playlists', items: [] };
  var at = rails.findIndex(function(r) { return r.id === 'recent'; }) + 1;
  return rails.slice(0, at).concat([newRail]).concat(rails.slice(at));
}

// TASK-378 — the Music Videos twin of withPlaylistsRail: guarantee an
// always-present (possibly empty) `mv-playlists` rail so the Music Videos tab's
// "Playlists ＋" heading always renders, even with zero music-video playlists yet
// (musicVideoRails' simpleRail omits an empty rail outright). Music Videos has no
// Recently Played rail to sit after (unlike Music), so the guaranteed rail simply
// leads — matching where musicVideoRails already puts a real one.
export function withMvPlaylistsRail(rails) {
  var hasRail = rails.some(function(r) { return r.id === 'mv-playlists'; });
  if (hasRail) return rails;
  var newRail = { id: 'mv-playlists', title: 'Playlists', items: [] };
  return [newRail].concat(rails);
}

// The sidebar tabs to show: a tab per section that has browse content, in fixed
// display order. (Continue Watching is no longer a tab — it is a rail inside each
// tab.)
export function buildTabs(cards) {
  var present = {};
  (cards || []).forEach(function(c) { present[sectionOf(c)] = true; });
  return SECTION_ORDER
    .filter(function(id) { return present[id]; })
    .map(function(id) { return { id: id, title: SECTION_TITLE[id] }; });
}

// The rails for one section tab: a leading Continue Watching rail (this section's
// in-progress items, from cwRows) then the content rails — genre rails for
// Series/Films, the Albums rail for Music. Box-sets (Films) are split into their
// own leading "Box Sets" rail and kept out of the genre rows. genreLabels maps
// genre slugs to display names.
//
// TASK-486 — one ACTION tile (kind:'play-all', never a browse card) for the
// Home Movies "Play All" rail: All (TASK-446's whole-catalog source) first,
// then one per kid, in the SAME tag set + order as the personRails grouping
// buildTabRails just built — no separate tagging concept. Since TASK-502 that
// grouping is data only (no browse rail renders it), and these tiles are the
// one way into a kid's clips. `navParams` carries the
// exact home-movies-list.html query params the tile's own onSelect handler
// needs (the `homeMoviesAll` param for All, the `homeMoviesPerson` param
// keyed by tag value for a kid) — kept data-only so the ui/** consumer stays
// a plain lookup (cyclomatic-1), no branch there. Revised (owner, 2026-08-21):
// a tap opens the scoped clip LIST first (like a boxset/series), not playback
// directly — the SAME params now also drive screen-home-movies-list-page.js
// (which owns the actual Play All start) and its companion mirror.
function playAllTile(title, navParams) {
  return { kind: 'play-all', id: 'play-all:' + title, title: title, navParams: navParams };
}

// The 'other' group (peopleOf's untagged fallback, TASK-444) gets no tile here
// — "All" already covers untagged clips, so there is no separate tile for
// them (owner, 2026-08-20). Omitted entirely (mirrors simpleRail's own
// omit-if-empty) when personGroups is empty — Home Movies has no clips at
// all, so there is nothing for even the All tile to play.
export function homeMoviesPlayAllRail(personGroups) {
  var groups = personGroups || [];
  var kidTiles = groups
    .filter(function(g) { return g.slug !== 'other'; })
    .map(function(g) { return playAllTile(g.title, { homeMoviesPerson: g.slug }); });
  var allTile = playAllTile('All', { homeMoviesAll: 1 });
  var rail = { id: 'home-movies-play-all', title: 'Play All', items: [allTile].concat(kidTiles) };
  return groups.length ? [rail] : [];
}

// TASK-491 — "Play All by month" rail: one tile per populated Year-Month,
// newest first (a plain string sort works — 'YYYY-MM' sorts lexicographically
// in calendar order), mirroring homeMoviesPlayAllRail's own tile shape (a tap
// opens the SAME scoped clip-list screen, via playAllTile's navParams — here
// `homeMoviesMonth`). `homeMovieCards` is already scoped to the Home Movies
// tab (buildTabRails' own `inTab`) — no month tile for an unpopulated month
// (months is built only from months that actually appear on a clip); omitted
// entirely when there are no home-movie clips at all, same as
// homeMoviesPlayAllRail.
export function homeMoviesMonthRail(homeMovieCards) {
  if (!homeMovieCards) return [];
  var months = new Set();
  homeMovieCards.forEach(function(c) {
    var ym = monthOf(c);
    if (ym) months.add(ym);
  });
  var yms = Array.from(months).sort().reverse();
  var tiles = yms.map(function(ym) { return playAllTile(monthLabel(ym), { homeMoviesMonth: ym }); });
  var rail = { id: 'home-movies-play-all-month', title: 'Play All by month', items: tiles };
  return tiles.length ? [rail] : [];
}

// TASK-486 (revision) — the Play All list screen's title: 'All' for the
// whole-catalog scope (person/month null/undefined), else the tapped kid's
// display name, title-cased the SAME way the person rail itself is
// (titleCase above) so the two screens never name one kid two different
// ways. TASK-491 — a month scope (mutually exclusive with person, exactly
// one Play All tile sets exactly one param) names the tile's own
// monthLabel instead.
export function homeMoviesListTitle(person, month) {
  if (month) return monthLabel(month);
  return person ? titleCase(person) : 'All';
}

// TASK-499 — the Queue UX shell hero's "person-or-month" subtitle: the same
// label homeMoviesListTitle already gives the scoped list screen, derived
// instead from the TASK-498 unified queue engine's own source_type/source_id
// (the two mutually-exclusive scope shapes it registers for home movies).
// Reuses homeMoviesListTitle rather than re-deriving person/month labelling a
// second time, so the Play All list screen and the Queue hero can never name
// the same source two different ways.
export function homeMoviesSourceLabel(sourceType, sourceId) {
  if (sourceType === 'home-movie-month') return homeMoviesListTitle(null, sourceId);
  if (sourceType === 'home-movies-by-person') return homeMoviesListTitle(sourceId, null);
  return homeMoviesListTitle(null, null);
}

// TASK-486 (revision) — the Play All list screen's own clip list: every
// available Home Movies card when person is null/undefined ('All'), else only
// the clips tagged with that person (peopleOf — the SAME tag test the browse
// rails use), newest capture date first (cmpDateDesc). Since TASK-502 removed
// the person browse rails this order once mirrored, this function is the sole
// definition of a kid's clip order. Wrapped as `{video: card}` — buildDetailList's own row shape
// (core/detail-view.js episodeLabel &c. all read item.video).
// TASK-486 (revision) — the exact video.html query params a hand-off from the
// list screen carries: the source scope (homeMoviesAll/homeMoviesPerson,
// unchanged from the tile's own navParams) plus `video` (the tapped row's id,
// undefined for the header Play All button — navTo drops an undefined value,
// so the entry starts at its own fresh index 0, exactly as it did before this
// revision). Kept in core (no DOM) so the ui/** screen stays a plain call.
// TASK-491 — a month scope carries `homeMoviesMonth` instead, same shape.
export function homeMoviesListPlayParams(person, id, month) {
  var sourceParam = month ? { homeMoviesMonth: month }
    : { 'true': { homeMoviesPerson: person }, 'false': { homeMoviesAll: 1 } }[!!person + ''];
  return Object.assign({ from: 'home-movies-list' }, sourceParam, { video: id });
}

// TASK-491 — `month` scopes the list to one Year-Month (monthOf, mutually
// exclusive with `person` — exactly one Play All tile sets exactly one
// scope param) on the SAME terms as the person scope below.
export function homeMoviesListItems(cards, person, month) {
  if (!cards) return [];
  var inTab = cards.filter(function(c) { return sectionOf(c) === 'home-movies'; });
  var scoped = inTab;
  if (person) scoped = scoped.filter(function(c) { return peopleOf(c).indexOf(person) > -1; });
  if (month) scoped = scoped.filter(function(c) { return monthOf(c) === month; });
  // scoped is always a FRESH array (every branch above comes from .filter(),
  // and the no-scope fallthrough is inTab itself, also a .filter() result) —
  // sorting it in place is safe, same reasoning sortItems (above) relies on.
  return scoped.sort(cmpDateDesc).map(function(c) { return { video: c }; });
}

// Home Movies is Continue Watching -> Play All (TASK-486) -> Play All by
// month: three rails, and no rail per kid. TASK-502 dropped the per-person
// browse rails TASK-444 added, because the Play All rail's per-kid tiles
// already open the same clip list (as a list screen rather than inline), so
// the rails were a second route to the one place.
//
// The per-kid grouping survives as internal data only — never returned, never
// rendered as rails. It is the tag set homeMoviesPlayAllRail builds its
// per-kid tiles and their homeMoviesPerson nav params from: one entry per
// `people` tag value via the SAME grouping Series/Films reach through
// groupRails for their genre rails, keyed on peopleOf instead of genresOf,
// with no genreLabels-style override (title-cased slug only) since people have
// no display-name map. It calls groupBySlug rather than groupRails precisely
// because these groups are not rails: with nothing rendering them, a rail id
// would be minted for nobody. A clip tagged with more than one kid appears
// under each of those kids (the keyer already fans a card out to every slug it
// returns, same as genres); an untagged clip lands under "Other" (peopleOf's
// fallback) rather than disappearing, and the Play All rail drops that one
// itself. Only each group's slug and title are read — the clips a kid's tile
// opens are re-derived by homeMoviesListItems, which owns their newest-first
// order.
export function buildTabRails(sectionId, cards, cwRows, genreLabels, recents) {
  var all = (cards || []).map(withDurationSec);
  var byId = cardIndex(all);
  if (sectionId === 'music') return musicRails(all, recents);
  if (sectionId === 'music-videos') return musicVideoRails(all);
  var inTab = all.filter(function(c) { return sectionOf(c) === sectionId; });
  if (sectionId === 'home-movies') {
    var personGroups = groupBySlug(inTab, peopleOf, titleCase);
    return continueRail(sectionId, cwRows, byId)
      .concat(homeMoviesPlayAllRail(personGroups))
      .concat(homeMoviesMonthRail(inTab));
  }
  var boxsets = inTab.filter(isBoxset);
  var rest = inTab.filter(function(c) { return !isBoxset(c); });
  var genreRails = groupRails(rest, genresOf, function(slug) { return labelFor(slug, genreLabels); }, 'genre:');
  return continueRail(sectionId, cwRows, byId)
    .concat(simpleRail('boxsets', 'Box Sets', boxsets))
    .concat(genreRails);
}

// buildTabRails, with the Music/Music Videos Playlists rail guaranteed present
// (withPlaylistsRail/withMvPlaylistsRail) — shared by the TV browse screen and
// the companion (TASK-424, whose ＋ create affordance is gated on landing on
// that rail, so it can't be left to `simpleRail`'s omit-if-empty).
var RAIL_GUARANTEE = { music: withPlaylistsRail, 'music-videos': withMvPlaylistsRail };
export function railsForSection(sectionId, cards, cwRows, genreLabels, recents) {
  var rails = buildTabRails(sectionId, cards, cwRows, genreLabels, recents);
  var guarantee = [RAIL_GUARANTEE[sectionId]].filter(Boolean).concat([function(r) { return r; }])[0];
  return guarantee(rails);
}
