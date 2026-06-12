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

// "(N)" episode-number suffix for the Play-next label, blank when a membership
// carries no number (e.g. an unnumbered home-movies collection).
function episodeSuffix(item) {
  return [item.episode].filter(function(e) { return e != null; })
    .map(function(e) { return ' (' + e + ')'; }).concat([''])[0];
}

// Label for the detail Play-next action (FEAT-017). "Start again" once the final
// episode is the most-recently-played (the series wraps last->first); otherwise
// the next episode's quoted title + number. Bare "Play next" for no items.
export function playNextLabel(items, progress) {
  var its = items || [];
  if (its.length === 0) return 'Play next';
  if (lastPlayedIndex(its, progress) === its.length - 1) return 'Start again';
  var item = its[playNextIndex(its, progress)];
  return 'Play next — "' + item.video.title + '"' + episodeSuffix(item);
}

// Inline player up-next line parts. A resolved next episode -> "Up next: " + its
// title; end of series (next absent, the series wraps) -> "Start again".
export function upNextParts(next) {
  if (next) return { prefix: 'Up next: ', label: next.video.title };
  return { prefix: '', label: 'Start again' };
}

// Episode number for a video within a resolved /api/series record (null when the
// video is not a member, or the membership carries no number).
export function episodeNumOf(series, videoId) {
  var its = (series && series.items) || [];
  var item = its.filter(function(it) { return it.video.id === videoId; })[0];
  return item ? item.episode : null;
}

// The player's episode label: the episode's own title, else "Episode {N}" (the
// data is mixed — some episodes are named, some only numbered).
export function episodeText(title, episodeNum) {
  return [title].filter(Boolean).concat(['Episode ' + episodeNum])[0];
}

// Player big title: "{series} · {episode}" within a series; the bare episode
// text (a standalone film's own title) when there is no series.
export function playerTitle(seriesTitle, episode) {
  return [seriesTitle].filter(Boolean)
    .map(function(s) { return s + ' · ' + episode; })
    .concat([episode])[0];
}
