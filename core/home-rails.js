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
// FEAT-020 — content-type tabs + per-type rails (TASK-138/139). The browse
// screen is a content-type sidebar (Series / Films / Home Movies); selecting a
// tab swaps the rail area to that type's rails. Series/Films group by genre
// (genres[], falling back to [type]); Home Movies group by person (people[]).
//
// TASK-150: Continue Watching is no longer its own tab. Instead each content-type
// tab leads with a Continue Watching rail of *that type's* in-progress items,
// built straight from the /api/continue-watching rows (which carry title, poster,
// duration, `format` and the owning `collection_*`) — no browse-card join, so an
// in-progress series **episode** surfaces (it is never a browse card). All
// grouping/ordering is pure and unit-tested here so app + companion render
// identically. (TASK-137 supplies genres[]/people[]/genreLabels via /api/browse;
// TASK-149 supplies format + collection on the CW rows.)

// A card's content-type tab. Series cards are always the Series tab; a video's
// tab comes from its `format`. An unknown/absent video format falls back to
// Films so no card is ever dropped from the browse.
var FORMAT_TAB = {
  'film': 'films',
  'tv-series': 'series',
  'home-movie': 'home-movies',
  'home-video': 'home-movies'
};

var TAB_TITLE = {
  'series': 'Series',
  'films': 'Films',
  'home-movies': 'Home Movies',
  'albums': 'Albums'
};

// Fixed display order; which tabs actually appear is data-driven (below).
// Albums (FEAT-018 music) is the 5th content-type tab, after the video tabs.
var TAB_ORDER = ['series', 'films', 'home-movies', 'albums'];

function isVideo(card) { return (card.kind || 'video') === 'video'; }

// Music cards (FEAT-018): an album is a series card flagged format:"album"; a
// standalone single is a video card flagged mediaType:"audio". `format` is NULL
// on audio rows (TASK-129), so we route on these two flags, never on format.
export function isAlbumCard(card) { return card.kind === 'series' && card.format === 'album'; }
export function isAudioSingleCard(card) { return isVideo(card) && card.mediaType === 'audio'; }
function isMusicCard(card) { return isAlbumCard(card) || isAudioSingleCard(card); }

// Where selecting a browse card navigates: an album opens album detail, an audio
// single plays straight in the audio player, otherwise the card's own kind
// ('video' plays, 'series' opens series detail). Pure so the browse screen stays
// DOM-only (no-pure-fn-outside-core).
export function cardRoute(card) {
  if (isAlbumCard(card)) return 'album';
  if (isAudioSingleCard(card)) return 'single';
  return card.kind || 'video';
}

// A card's content-type tab. Music cards (albums + audio singles) go to the
// Albums tab; otherwise a series is the Series tab and a video's tab comes from
// its format (unknown -> Films, so no card is ever dropped).
function tabOf(card) {
  if (isMusicCard(card)) return 'albums';
  if (!isVideo(card)) return 'series';
  return FORMAT_TAB[card.format] || 'films';
}

// id-set + lookup of the music in this browse payload, so a Continue-Watching
// row can be classed as music app-side (the CW endpoint carries no mediaType):
// a row is music when its owning collection is a known album, or the row itself
// is a known audio single.
function musicSets(cards) {
  var albumById = {};
  var audioById = {};
  (cards || []).forEach(function(c) {
    if (isAlbumCard(c)) albumById[c.id] = c;
    if (isAudioSingleCard(c)) audioById[c.id] = c;
  });
  return { albumById: albumById, audioById: audioById };
}

function isMusicRow(row, sets) {
  if (row.collection_id && sets.albumById[row.collection_id]) return true;
  return !!sets.audioById[row.item_id];
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

// A continue-watching row's tab — the same format map as browse cards. CW rows
// (from /api/continue-watching, TASK-149) already carry `format` + collection.
function cwTabOf(row) { return FORMAT_TAB[row.format] || 'films'; }

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
    durationSec: row.duration_secs,
    format: row.format
  };
}

// The Continue Watching rail for one (video) tab: the CW rows whose content-type
// maps to this tab, kept in the backend's newest-first order (not re-sorted).
// Music rows are excluded here so an in-progress track never leaks into Films
// (its NULL format would otherwise fall through to the Films tab). Omitted when
// this tab has nothing in progress.
function continueRail(tabId, cwRows, sets) {
  var items = (cwRows || [])
    .filter(function(r) { return !isMusicRow(r, sets); })
    .filter(function(r) { return cwTabOf(r) === tabId; })
    .map(cwCard);
  return [{ id: 'continue', title: 'Continue Watching', items: items }]
    .filter(function(rail) { return rail.items.length > 0; });
}

// The Albums tab's lead rail: "Continue Listening", collection-level. An
// in-progress album track rolls up to a single album tile (the album browse
// card), one per album, in the backend's newest-first order — because a future
// cross-album playlist puts a track in many collections, so resume is anchored
// at the album, not the track. An in-progress standalone single (no collection)
// keeps its own track tile. Omitted when nothing music is in progress.
function continueListeningRail(cwRows, sets) {
  var seen = {};
  var items = [];
  (cwRows || []).forEach(function(row) {
    var album = row.collection_id ? sets.albumById[row.collection_id] : null;
    if (album) {
      if (!seen[album.id]) { seen[album.id] = true; items.push(album); }
    } else if (sets.audioById[row.item_id]) {
      // The single's own browse card -> carries mediaType (routes to the audio
      // player) + duration (mid-listen bar).
      items.push(sets.audioById[row.item_id]);
    }
  });
  return [{ id: 'continue', title: 'Continue Listening', items: items }]
    .filter(function(rail) { return rail.items.length > 0; });
}

// A simple titled rail of the given cards (A-Z by title), or [] when empty.
function simpleRail(id, title, cards) {
  return cards.length ? [{ id: id, title: title, items: sortItems(cards) }] : [];
}

// The Albums tab's rails: Continue Listening (lead), then Albums, then Singles
// (when any standalone audio singles exist). Square-art tiles are CSS; the rail
// shape is identical to the video tabs so the browse screen renders it as-is.
function albumTabRails(cards, cwRows, sets) {
  var albums = cards.filter(isAlbumCard);
  var singles = cards.filter(isAudioSingleCard);
  return continueListeningRail(cwRows, sets)
    .concat(simpleRail('albums', 'Albums', albums))
    .concat(simpleRail('singles', 'Singles', singles));
}

// The sidebar tabs to show: a tab per content-type that has browse content.
// (Continue Watching is no longer a tab — it is a rail inside each tab.)
export function buildTabs(cards) {
  var all = (cards || []).map(withDurationSec);
  var present = {};
  all.forEach(function(c) { present[tabOf(c)] = true; });
  return TAB_ORDER
    .filter(function(id) { return present[id]; })
    .map(function(id) { return { id: id, title: TAB_TITLE[id] }; });
}

// The rails for one tab: a leading Continue Watching rail (this tab's in-progress
// items, from cwRows) then the content rails — genre rails for Series/Films,
// person rails for Home Movies. genreLabels maps genre slugs to display names.
export function buildTabRails(tabId, cards, cwRows, genreLabels) {
  var all = (cards || []).map(withDurationSec);
  var sets = musicSets(all);
  if (tabId === 'albums') return albumTabRails(all, cwRows, sets);
  var inTab = all.filter(function(c) { return tabOf(c) === tabId; });
  var typeRails = (tabId === 'home-movies')
    ? groupRails(inTab, peopleOf, titleCase, 'person:')
    : groupRails(inTab, genresOf, function(slug) { return labelFor(slug, genreLabels); }, 'genre:');
  return continueRail(tabId, cwRows, sets).concat(typeRails);
}
