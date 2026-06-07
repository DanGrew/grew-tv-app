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
// screen is a content-type sidebar (Continue / Series / Films / Home Movies);
// selecting a tab swaps the rail area to that type's rails. Series/Films group
// by genre (genres[], falling back to [type]); Home Movies groups by person
// (people[]); Continue is the resume feed. All grouping/ordering is pure and
// unit-tested here so app + companion render identically. (TASK-137 supplies
// genres[] / people[] / genreLabels through /api/browse.)

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
  'continue': 'Continue Watching',
  'series': 'Series',
  'films': 'Films',
  'home-movies': 'Home Movies'
};

// Fixed display order; which tabs actually appear is data-driven (below).
var TAB_ORDER = ['continue', 'series', 'films', 'home-movies'];

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

// The sidebar tabs to show: Continue only when something is mid-watch (it is
// the default landing when present), plus a tab per content-type with content.
export function buildTabs(cards, progress) {
  var all = (cards || []).map(withDurationSec);
  var cw = continueWatching(all.filter(isVideo), progress || {});
  var present = {};
  all.forEach(function(c) { present[tabOf(c)] = true; });
  present['continue'] = cw.length > 0;
  return TAB_ORDER
    .filter(function(id) { return present[id]; })
    .map(function(id) { return { id: id, title: TAB_TITLE[id] }; });
}

// The rails for one tab. Continue -> resume feed; Series/Films -> genre rails;
// Home Movies -> person rails. genreLabels maps genre slugs to display names.
export function buildTabRails(tabId, cards, progress, genreLabels) {
  var all = (cards || []).map(withDurationSec);
  if (tabId === 'continue') {
    var cw = continueWatching(all.filter(isVideo), progress || {});
    return [{ id: 'continue', title: 'Continue Watching', items: cw }]
      .filter(function(r) { return r.items.length > 0; });
  }
  var inTab = all.filter(function(c) { return tabOf(c) === tabId; });
  if (tabId === 'home-movies') {
    return groupRails(inTab, peopleOf, titleCase, 'person:');
  }
  return groupRails(inTab, genresOf, function(slug) { return labelFor(slug, genreLabels); }, 'genre:');
}
