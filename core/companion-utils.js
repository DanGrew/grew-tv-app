import { isMidWatch, percent } from './progress.js';

export function screenPage(contextId) {
  return contextId;
}

// FEAT-028 (TASK-168): the L3 text tile's optional resume hint. A mid-watch item
// shows its rounded percent (e.g. "40%"); a fresh or finished item shows nothing.
// Pure so the companion grid stays DOM-only (no-pure-fn-outside-core) and "which
// tiles flag progress" is provable without a browser. progressMap is keyed by
// item id -> { resumePositionSec } (core/progress.js progressMapFromCW).
export function tileHint(progressMap, card) {
  var entry = (progressMap || {})[card.id];
  var resume = entry ? (entry.resumePositionSec || 0) : 0;
  if (!isMidWatch(resume, card.durationSec)) return '';
  return Math.round(percent(resume, card.durationSec)) + '%';
}

export function titleCase(str) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

var SKIP_LABEL_MAP = { '10': '10s', '30': '30s', '120': '2 min', '300': '5 min', '900': '15 min', '1800': '30 min' };

export function skipLabel(actionId) {
  var secs = actionId.split('_').pop();
  return SKIP_LABEL_MAP[secs] || secs + 's';
}

// The player app_state itemId is the series id for an episode and the video id
// for a film (itemId === episodeId). Returns the series id, or undefined for a
// film, so the companion breadcrumb (FEAT-021) tells an episode from a film.
export function seriesIdFromSnap(snap) {
  return [snap.itemId].filter(function() { return snap.itemId !== snap.episodeId; })[0];
}

export function displayTitle(payload) {
  return [payload.display].filter(Boolean)
    .map(function(d) { return d.title; })
    .filter(Boolean)
    .concat([''])[0];
}

export function displayLabel(payload) {
  return [payload.context_id].filter(Boolean).map(titleCase).concat([''])[0];
}

// FEAT-038 (TASK-230): the display-only "what's the TV doing" strip a desynced
// companion shows so you never lose track of the telly. The TITLE rides the WS
// `context` message (display.title) — NOT app_state, which only carries
// {screen,itemId,profile}; the PLAYING flag rides app_state. So the strip is fed
// from both: title from onContext, playing from onAppState. No title (idle / on a
// menu) reads as a dash. Pure — provable without a browser.
export function tvStatusText(title, playing) {
  if (!title) return 'TV: —';
  var icon = playing ? '▶' : '❚❚';
  return 'TV: ' + icon + ' ' + title;
}

// Companion Home search (TASK-117): case-insensitive title substring match.
// v1 is title-only by design (small library); tag/format search is parked.
export function filterByTitle(cards, query) {
  var q = (query || '').trim().toLowerCase();
  return [q].filter(Boolean).map(function() {
    return (cards || []).filter(function(c) {
      return (c.title || '').toLowerCase().indexOf(q) > -1;
    });
  }).concat([cards || []])[0];
}

// FEAT-038 (TASK-230): build a '?k=v&…' query for a local companion hop (empty
// params -> ''). Pure — keeps the screen DOM-only.
export function queryString(params) {
  var keys = Object.keys(params || {});
  if (keys.length === 0) return '';
  return '?' + keys.map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
}

export function getContentBasePath(manifestCache) {
  return [manifestCache].filter(Boolean)
    .map(function(m) { return m.contentBase; })
    .filter(Boolean)
    .concat([''])[0]
    .replace(/^https?:\/\/[^/]+/, '');
}
