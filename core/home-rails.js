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
// group by person (people[]); the Music section lists albums. Each section tab
// leads with a Continue Watching rail of that section's in-progress items.
//
// SECTION_TITLE/SECTION_ORDER are pure presentation — a section's tab label and
// fixed display order — NOT type routing. Sections (server-supplied):
// 'series' | 'films' | 'home-movies' | 'music'.

var SECTION_TITLE = {
  'series': 'Series',
  'films': 'Films',
  'home-movies': 'Home Movies',
  'music': 'Albums'
};

// Fixed display order; which tabs actually appear is data-driven (below).
var SECTION_ORDER = ['series', 'films', 'home-movies', 'music'];

// A card's section. The backend stamps it on every browse card; fall back to
// Films so an unstamped (legacy/typo) card is shown rather than silently dropped.
function sectionOf(card) { return card.section || 'films'; }

// Where selecting a browse card navigates: a music card (album/playlist) opens
// album detail; otherwise the card's own kind ('video' plays, 'series' opens
// collection detail). Routes on the server `section`, never a type enum. Pure so
// the browse screen stays DOM-only (no-pure-fn-outside-core).
export function cardRoute(card) {
  if (card.section === 'music') return 'album';
  return card.kind || 'video';
}

// Index browse cards by id -> card, so a continue-watching row (which carries no
// `section`) can borrow its section from the browse card it belongs to: a bound
// item (episode/track) from its owning collection, a standalone (film/home-movie)
// from its own card. Keeps the app from re-deriving a type from the row.
function cardIndex(cards) {
  var byId = {};
  (cards || []).forEach(function(c) { byId[c.id] = c; });
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
  if (len <= 0) return 0;
  if (i < 0) return 0;
  if (i > len - 1) return len - 1;
  return i;
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

// People a card belongs to: explicit people[], else ['other'] (the catch-all
// rail for home movies with nobody tagged).
function peopleOf(card) {
  if (Array.isArray(card.people) && card.people.length) return card.people;
  return ['other'];
}

function cmpStr(a, b) {
  return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}

function sortItems(items) {
  return items.slice().sort(function(a, b) { return cmpStr(a.title || '', b.title || ''); });
}

// Group cards into rails keyed by a slug list, A-Z by rail label then tile
// title. keyer(card) -> [slug]; labeler(slug) -> display title.
function groupRails(cards, keyer, labeler, prefix) {
  var groups = {};
  cards.forEach(function(card) {
    keyer(card).forEach(function(slug) {
      groups[slug] = groups[slug] || [];
      groups[slug].push(card);
    });
  });
  return Object.keys(groups)
    .map(function(slug) {
      return { id: prefix + slug, slug: slug, title: labeler(slug), items: sortItems(groups[slug]) };
    })
    .sort(function(a, b) { return cmpStr(a.title, b.title); });
}

// A CW row -> a video tile card. The label prefixes the owning collection when
// present ("Bluey · Daddy Putdown" for an episode; bare title for a standalone
// film / home movie). Generic by design: a future audio track reads
// "Album · Track" with no rail change. kind:'video' so selecting plays the
// item_id (the episode itself, not its series).
function cwCard(row) {
  var label = row.collection_title
    ? row.collection_title + ' · ' + (row.title || '')
    : (row.title || '');
  return {
    kind: 'video',
    id: row.item_id,
    title: label,
    poster: row.poster,
    durationSec: row.duration_secs
  };
}

// The Continue Watching rail for one (video) section: the CW rows whose section
// is this tab's, kept in the backend's newest-first order (not re-sorted). The
// section is borrowed from each row's browse card (rowSection), so a music row
// never matches a video section — an in-progress track can't leak into Films.
// Omitted when this tab has nothing in progress.
function continueRail(sectionId, cwRows, byId) {
  var items = (cwRows || [])
    .filter(function(r) { return rowSection(r, byId) === sectionId; })
    .map(cwCard);
  return [{ id: 'continue', title: 'Continue Watching', items: items }]
    .filter(function(rail) { return rail.items.length > 0; });
}

// The Music section's lead rail: "Continue Listening", collection-level. An
// in-progress track rolls up to its album tile (the album browse card), one per
// album, in the backend's newest-first order — because a future cross-album
// playlist puts a track in many collections, so resume is anchored at the album,
// not the track. Omitted when nothing music is in progress.
function continueListeningRail(cwRows, byId) {
  var seen = {};
  var items = [];
  (cwRows || []).forEach(function(row) {
    var card = rowCard(row, byId);
    if (card && sectionOf(card) === 'music' && !seen[card.id]) {
      seen[card.id] = true;
      items.push(card);
    }
  });
  return [{ id: 'continue', title: 'Continue Listening', items: items }]
    .filter(function(rail) { return rail.items.length > 0; });
}

// A simple titled rail of the given cards (A-Z by title), or [] when empty.
function simpleRail(id, title, cards) {
  return cards.length ? [{ id: id, title: title, items: sortItems(cards) }] : [];
}

// The Music section's rails: Continue Listening (lead), then an Albums rail of
// the album/playlist cards. (No Singles rail — a standalone song is a 1-track
// album; FEAT-027.) Square-art tiles are CSS; the rail shape is identical to the
// video tabs so the browse screen renders it as-is.
function musicRails(cards, cwRows, byId) {
  var albums = cards.filter(function(c) { return sectionOf(c) === 'music'; });
  return continueListeningRail(cwRows, byId)
    .concat(simpleRail('albums', 'Albums', albums));
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
// Series/Films, person rails for Home Movies, the Albums rail for Music.
// genreLabels maps genre slugs to display names.
export function buildTabRails(sectionId, cards, cwRows, genreLabels) {
  var all = (cards || []).map(withDurationSec);
  var byId = cardIndex(all);
  if (sectionId === 'music') return musicRails(all, cwRows, byId);
  var inTab = all.filter(function(c) { return sectionOf(c) === sectionId; });
  var typeRails = (sectionId === 'home-movies')
    ? groupRails(inTab, peopleOf, titleCase, 'person:')
    : groupRails(inTab, genresOf, function(slug) { return labelFor(slug, genreLabels); }, 'genre:');
  return continueRail(sectionId, cwRows, byId).concat(typeRails);
}
