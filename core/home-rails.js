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
