// Pure view-model for the shared tile (TASK-116). Derives a card's display
// state — progress bar + CC badge — from a v3 API card plus optional progress
// context. The DOM renderer (components/tile.js) is a thin mapping of this, so
// "renders all states" is provable here without a browser.
//
// card: { kind:'video'|'series', id, title, poster, durationSec?, subtitles?, episodes? }
// ctx:  { progress, hasCC }  — hasCC overrides the card.subtitles inference.

import { percent, isMidWatch, seriesProgressPercent } from './progress.js';

function hasVtt(card) {
  var s = card.subtitles;
  if (!s) return false;
  if (typeof s === 'string') return /\.vtt$/i.test(s);
  if (Array.isArray(s)) return s.length > 0;
  return true;
}

export function tileModel(card, ctx) {
  var c = ctx || {};
  var prog = c.progress || {};
  var kind = card.kind || 'video';
  var pct, showBar;

  if (kind === 'series') {
    // Series bar shows only when an episode is mid-watch; fill = furthest one.
    pct = seriesProgressPercent(card.episodes, prog);
    showBar = pct > 0;
  } else {
    var e = prog[card.id];
    var mid = !!(e && isMidWatch(e.resumePositionSec, card.durationSec));
    pct = mid ? percent(e.resumePositionSec, card.durationSec) : 0;
    showBar = mid;
  }

  var cc = c.hasCC != null ? c.hasCC : hasVtt(card);

  // Series sub-label: clip count from the v3 browse card (backend `clipCount`).
  // Absent (video cards, or older backend without the field) -> no sub-label.
  var sub = null;
  if (kind === 'series' && card.clipCount != null) {
    sub = card.clipCount === 1 ? '1 clip' : card.clipCount + ' clips';
  }

  return {
    id: card.id,
    kind: kind,
    title: card.title || '',
    poster: card.poster || null,
    percent: pct,
    showBar: showBar,
    showCC: !!cc,
    sub: sub
  };
}
