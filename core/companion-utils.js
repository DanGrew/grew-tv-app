import { isMidWatch, percent } from './progress.js';

// The companion has NO rail-grid.html — the rail-grid drill level lives inside
// browse.html (companion-browse.js, sections→rails→grid on one page). So map the
// drill context 'rail-grid' to the page that actually hosts it: a companion item
// page (audio/video/detail/artist/playlist) receiving a drill context — e.g. the
// TV returning to a Playlists rail-grid — then resolves to browse.html (exists;
// restores the grid from the nav-trail) instead of navigating to a non-existent
// rail-grid.html, which media-manager serves as 404 {"error":"not found"} (BUG-052).
// 'browse' already resolves to browse.html via the identity fallback, so only the
// rail-grid drill level needs an explicit entry; every real leaf context
// (detail/audio/video/artist/playlist/profile/error) maps to itself.
var DRILL_PAGE = { 'rail-grid': 'browse' };

export function screenPage(contextId) {
  return DRILL_PAGE[contextId] || contextId;
}

// FEAT-028 (TASK-168): the L3 text tile's optional resume hint. A mid-watch item
// shows its rounded percent (e.g. "40%"); a fresh or finished item shows nothing.
// Pure so the companion grid stays DOM-only (no-pure-fn-outside-core) and "which
// tiles flag progress" is provable without a browser. progressMap is keyed by
// item id -> { resumePositionSec } (core/progress.js progressMapFromCW).
// suppress=true drops the hint entirely — music surfaces (the companion playlist
// track list) have no mid-song resume (TASK-276), so a track never shows a
// resume-percent badge regardless of its saved position.
export function tileHint(progressMap, card, suppress) {
  if (suppress) return '';
  var entry = (progressMap || {})[card.id];
  var resume = entry ? (entry.resumePositionSec || 0) : 0;
  if (!isMidWatch(resume, card.durationSec)) return '';
  return Math.round(percent(resume, card.durationSec)) + '%';
}

export function titleCase(str) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

// Only seconds whose friendly label differs from the bare "<secs>s" fallback need
// an entry; 10 -> "10s" / 30 -> "30s" are exactly the fallback, so they are left
// to it rather than duplicated here.
var SKIP_LABEL_MAP = { '120': '2 min', '300': '5 min', '900': '15 min', '1800': '30 min' };

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
