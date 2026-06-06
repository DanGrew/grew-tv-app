// Watch-progress model (FEAT-017). Global — one resume point per video, not
// forked per profile. There is no persistent "watched" flag: finishing a video
// clears its resume so the tile reads clean and is ready to rewatch.
//
// A progress entry is { resumePositionSec, lastPlayed }; a progress map keys
// those by video id. lastPlayed may be an epoch ms number or an ISO string.

// Slop at the tail that still counts as finished — guards against an imprecise
// "ended" event leaving a sliver of resume behind. No early (~95%) cutoff:
// premature skip is an explicit anti-goal.
export var FINISHED_EPSILON_SEC = 3;

function ts(v) {
  if (typeof v === 'number') return v;
  return v ? Date.parse(v) || 0 : 0;
}

export function percent(resumePositionSec, durationSec) {
  if (!durationSec || durationSec <= 0) return 0;
  var p = (resumePositionSec || 0) / durationSec * 100;
  if (p < 0) return 0;
  if (p > 100) return 100;
  return p;
}

export function isFinished(resumePositionSec, durationSec) {
  if (!durationSec || durationSec <= 0) return false;
  return (resumePositionSec || 0) >= durationSec - FINISHED_EPSILON_SEC;
}

export function isMidWatch(resumePositionSec, durationSec) {
  if (!resumePositionSec || resumePositionSec <= 0) return false;
  return !isFinished(resumePositionSec, durationSec);
}

// Resume value to persist after a position update — clears to 0 once finished.
export function resumeAfter(resumePositionSec, durationSec) {
  if (isFinished(resumePositionSec, durationSec)) return 0;
  return Math.max(0, resumePositionSec || 0);
}

// videos: [{ id, durationSec, ... }]; progress: { id: { resumePositionSec, lastPlayed } }.
// Returns the mid-watch videos, most-recently-played first.
export function continueWatching(videos, progress) {
  var p = progress || {};
  return (videos || [])
    .map(function(v) { return { video: v, entry: p[v.id] }; })
    .filter(function(x) { return x.entry && isMidWatch(x.entry.resumePositionSec, x.video.durationSec); })
    .sort(function(a, b) { return ts(b.entry.lastPlayed) - ts(a.entry.lastPlayed); })
    .map(function(x) { return x.video; });
}

// Highest mid-watch percent across a series' episodes (0 if none mid-watch).
// Drives whether — and how full — a series tile's progress bar renders.
export function seriesProgressPercent(episodes, progress) {
  var p = progress || {};
  return (episodes || []).reduce(function(max, v) {
    var e = p[v.id];
    var pct = (e && isMidWatch(e.resumePositionSec, v.durationSec))
      ? percent(e.resumePositionSec, v.durationSec) : 0;
    return Math.max(max, pct);
  }, 0);
}

export function seriesIsMidWatch(episodes, progress) {
  return seriesProgressPercent(episodes, progress) > 0;
}
