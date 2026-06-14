// Season-selector logic (TASK-123). Pure helpers behind the detail screen's
// season chip row + per-season poster art (Design A). The chips/filter/poster
// swap render in ui/screens/screen-detail.js; the decisions live here so they
// stay provable without a browser.
//
// series.seasons (TASK-122): [{ season, poster }] from the manifest, or absent
// when the cover pipeline declared no season art. Absent/[] -> the screen falls
// back to the legacy single list with inline "Season N" dividers.

import { mediaUrl } from './app-api.js';
import { primaryAction } from './series-detail.js';

// The declared season list, always an array ([] when none).
export function seasonsOf(series) {
  return (series && series.seasons) || [];
}

// Show the chip selector only when the manifest declares season art. With none,
// the screen keeps today's behaviour (one list, inline dividers).
export function hasSeasonChips(series) {
  return seasonsOf(series).length > 0;
}

export function seasonLabel(season) {
  return 'Season ' + season;
}

// Chip className — the active season gets the 'active' modifier.
export function chipClass(season, active) {
  if (season === active) return 'season-chip active';
  return 'season-chip';
}

// Items of one season, each tagged with its ORIGINAL index in series.items so
// playback + next logic (which key on that index) survive the filter. season ===
// null (no chips) -> every item in order.
export function visibleItems(items, season) {
  var withIdx = (items || []).map(function(item, idx) { return { item: item, idx: idx }; });
  if (season === null) return withIdx;
  return withIdx.filter(function(e) { return e.item.season === season; });
}

export function episodeCount(items, season) {
  return visibleItems(items, season).length;
}

// Default chip: the season of the Play-next item, so re-entry lands on the season
// you'll resume (matches the header action). Falls back to the first declared
// season. null when there are no seasons.
export function defaultSeason(items, progress, seasons) {
  if (!seasons || seasons.length === 0) return null;
  var item = (items || [])[primaryAction(items, progress).index];
  if (item && item.season != null) return item.season;
  return seasons[0].season;
}

// The poster filename for one season, or null.
export function seasonPosterOf(seasons, season) {
  return (seasons || [])
    .filter(function(s) { return s.season === season; })
    .map(function(s) { return s.poster; })
    .concat([null])[0];
}

// Ordered header-poster URL candidates: the active season's art first, then the
// series art (each only when present). The screen sets the first and advances on
// a 404; an empty list -> the placeholder up front. Reused for the no-season case
// (seasonPoster null -> just the series poster).
export function posterCandidates(server, seasonPoster, seriesPoster) {
  return [seasonPoster, seriesPoster]
    .filter(Boolean)
    .map(function(p) { return mediaUrl(server, p); });
}
