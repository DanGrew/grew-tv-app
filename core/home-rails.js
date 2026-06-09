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
  'home-movies': 'Home Movies'
};

// Fixed display order; which tabs actually appear is data-driven (below).
var TAB_ORDER = ['series', 'films', 'home-movies'];

function isVideo(card) { return (card.kind || 'video') === 'video'; }

function tabOf(card) {
  if (!isVideo(card)) return 'series';
  return FORMAT_TAB[card.format] || 'films';
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

// The Continue Watching rail for one tab: the CW rows whose content-type maps to
// this tab, kept in the backend's newest-first order (not re-sorted). Omitted
// when this tab has nothing in progress.
function continueRail(tabId, cwRows) {
  var items = (cwRows || [])
    .filter(function(r) { return cwTabOf(r) === tabId; })
    .map(cwCard);
  return [{ id: 'continue', title: 'Continue Watching', items: items }]
    .filter(function(rail) { return rail.items.length > 0; });
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
  var inTab = all.filter(function(c) { return tabOf(c) === tabId; });
  var typeRails = (tabId === 'home-movies')
    ? groupRails(inTab, peopleOf, titleCase, 'person:')
    : groupRails(inTab, genresOf, function(slug) { return labelFor(slug, genreLabels); }, 'genre:');
  return continueRail(tabId, cwRows).concat(typeRails);
}
