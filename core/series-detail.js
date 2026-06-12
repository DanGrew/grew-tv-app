// Series-detail logic (TASK-118). Pure resolution of the single "Play next"
// action: the episode that follows the most-recently-played one, wrapping
// last->first. DOM/render lives in the screen; this stays provable without a
// browser.
//
// items:    ordered series refs [{ video: { id, durationSec? }, ... }]
// progress: { id: { resumePositionSec, lastPlayed } } (from /api/continue-watching)

import { isMidWatch } from './progress.js';

function lastPlayedTs(v) {
  if (typeof v === 'number') return v;
  return v ? Date.parse(v) || 0 : 0;
}

// Index of the most-recently-played episode (-1 if none has ever been played).
export function lastPlayedIndex(items, progress) {
  var p = progress || {};
  var best = -1;
  var bestTs = 0;
  (items || []).forEach(function(item, i) {
    var e = p[item.video.id];
    var t = e ? lastPlayedTs(e.lastPlayed) : 0;
    [t].filter(function() { return t > 0 && t >= bestTs; }).forEach(function() { bestTs = t; best = i; });
  });
  return best;
}

// Index the "Play next" header action plays: the episode after the last-played
// one, wrapping last->first. With no watch history, the first episode. -1 when
// there are no items.
export function playNextIndex(items, progress) {
  var its = items || [];
  if (its.length === 0) return -1;
  var last = lastPlayedIndex(its, progress);
  if (last < 0) return 0;
  return (last + 1) % its.length;
}

// The series' first item — where the player's Next / auto-advance wraps to after
// the last episode (BUG-005: loop last->first, no stop). null when the series has
// no items.
export function firstItem(items) {
  var its = items || [];
  if (its.length === 0) return null;
  return its[0];
}

// "(N)" episode-number suffix for the header label, blank when a membership
// carries no number (e.g. an unnumbered home-movies collection).
function episodeSuffix(item) {
  return [item.episode].filter(function(e) { return e != null; })
    .map(function(e) { return ' (' + e + ')'; }).concat([''])[0];
}

// The detail header's primary action (FEAT-017 / TASK-136), as { kind, index }:
//   continue — the most-recent episode is still mid-watch -> resume IT
//   next     — that episode is finished (or none watched) -> the following one
//   again    — the finished episode was the last -> wrap to the first
//   none     — empty collection
// 'continue' takes priority so a partly-watched episode is never skipped.
export function primaryAction(items, progress) {
  var its = items || [];
  var p = progress || {};
  if (its.length === 0) return { kind: 'none', index: -1 };
  var last = lastPlayedIndex(its, p);
  if (last < 0) return { kind: 'next', index: 0 };
  var lastItem = its[last];
  var entry = p[lastItem.video.id];
  var resume = entry ? entry.resumePositionSec : 0;
  if (isMidWatch(resume, lastItem.video.duration)) return { kind: 'continue', index: last };
  if (last === its.length - 1) return { kind: 'again', index: 0 };
  return { kind: 'next', index: (last + 1) % its.length };
}

var ACTION_LABEL = {
  none:     function() { return 'Play next'; },
  again:    function() { return 'Start again'; },
  continue: function(item) { return 'Continue — "' + item.video.title + '"' + episodeSuffix(item); },
  next:     function(item) { return 'Play next — "' + item.video.title + '"' + episodeSuffix(item); }
};

// Label for the detail header action — matches what primaryAction() will play:
// "Continue — …" for a mid-watch episode, "Play next — …" for a fresh one,
// "Start again" at the series end, bare "Play next" for an empty collection.
export function playNextLabel(items, progress) {
  var act = primaryAction(items, progress);
  return ACTION_LABEL[act.kind]((items || [])[act.index]);
}

// Inline player up-next line parts. A resolved next episode -> "Up next: " + its
// title; end of series (next absent, the series wraps) -> "Start again".
export function upNextParts(next) {
  if (next) return { prefix: 'Up next: ', label: next.video.title };
  return { prefix: '', label: 'Start again' };
}
