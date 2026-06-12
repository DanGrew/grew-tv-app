// Pure markup/view helpers for the series-detail screens (TASK-118), shared by
// the TV detail rows and the companion episode list. Strings only — no DOM — so
// row labelling and the mid-watch bar are provable without a browser.

import { fmt } from './time.js';

// Resume seconds for a video from its progress entry (0 when absent).
export function resumeOf(entry) {
  return [entry].filter(Boolean).map(function(e) { return e.resumePositionSec; }).concat([0])[0];
}

// "{episode}. {title}", or just the title when the membership carries no number.
export function episodeLabel(item) {
  return [item.episode].filter(function(e) { return e != null; })
    .map(function(e) { return e + '. ' + item.video.title; })
    .concat([item.video.title])[0];
}

export function durationMarkup(d) {
  return [d].filter(Boolean).map(function(x) { return '<div class="detail-duration">' + fmt(x) + '</div>'; }).join('');
}

// Mini progress bar markup — empty unless mid-watch (a clean row otherwise).
// barClass names the outer element; its fill is "{barClass}-fill".
export function progressBarMarkup(mid, pct, barClass) {
  return [mid].filter(Boolean).map(function() {
    return '<div class="' + barClass + '"><div class="' + barClass + '-fill" style="width:' + pct + '%"></div></div>';
  }).join('');
}

// Friendly label for a collection's content type (FEAT-017 detail meta line).
// Unmapped/absent types fall back to the raw value ('' when missing) so the
// caller degrades quietly rather than printing "undefined".
var TYPE_LABELS = {
  'home': 'Home videos',
  'home-video': 'Home videos',
  'tv-series': 'Episodes',
  'animation': 'Cartoons',
  'film': 'Film',
  'action': 'Action'
};

export function typeLabel(type) {
  return TYPE_LABELS[type] || type || '';
}

// Series-detail meta line — "{typeLabel} · {n} clips" (singular "1 clip").
// Drops the type segment when the type is unknown/absent so the count still
// reads cleanly ("3 clips" rather than " · 3 clips").
export function collectionMetaLine(series) {
  var n = ((series && series.items) || []).length;
  var clips = n + (n === 1 ? ' clip' : ' clips');
  var label = typeLabel(series && series.type);
  if (!label) return clips;
  return label + ' · ' + clips;
}

// Episode-row status tag (FEAT-017): "RESUME · {time left}" when mid-watch,
// otherwise "NEXT" for the play-next row, otherwise nothing.
export function detailTagMarkup(mid, remainingSec, isNext) {
  if (mid) return '<div class="detail-tag">RESUME · ' + fmt(remainingSec) + ' left</div>';
  if (isNext) return '<div class="detail-tag">NEXT</div>';
  return '';
}
