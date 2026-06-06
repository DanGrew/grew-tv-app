// Series-detail logic (TASK-118). Pure resolution of the single "Play next"
// action: the episode that follows the most-recently-played one, wrapping
// last->first. DOM/render lives in the screen; this stays provable without a
// browser.
//
// items:    ordered series refs [{ video: { id, durationSec? }, ... }]
// progress: { id: { resumePositionSec, lastPlayed } } (from /api/continue-watching)

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
