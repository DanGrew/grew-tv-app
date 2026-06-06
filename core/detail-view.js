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
