// BUG-485 — the music-video counterpart of core/video-player-router.js: turns
// the server `music_video_playback` snapshot (api/music_video_playback.py
// build_snapshot) into the small view-model screen-video-page.js applies to
// actually drive the <video> element, instead of the retired client-owned
// `seq` (core/music-video-playthrough.js, TASK-374/407). The shape differs
// from the video engine's own: now_playing keys off `video_id` (not
// `item_id`), and there is no flat `items[]` + `current_item_index` pair —
// `play_next` / `from_source` / `then` are the three lookahead lists the API
// already resolves, and `item_count` (BUG-485) is the one field added to that
// snapshot to answer "is this a multi-item playthrough" without the client
// re-deriving it from a list it no longer holds.

function snap(snapshot) { return snapshot || {}; }

// The current item's resolved metadata (or null for an empty/absent snapshot).
export function nowPlaying(snapshot) {
  return snap(snapshot).now_playing || null;
}

// True when the snapshot's now-playing differs from what the <video> element
// currently holds — the thin mount swaps media in place ONLY then, mirroring
// video-player-router.isSwap (keyed off video_id here, not item_id).
export function isSwap(loadedId, snapshot) {
  var np = nowPlaying(snapshot);
  if (!np) return false;
  return np.video_id !== loadedId;
}

// The item that plays after the current one: the "Play Next" queue's front
// wins (an explicit pick plays ahead of the source, mirrors video-player-
// router's own queue-first priority), else the next item still ahead in the
// current pass (`from_source`), else the wrap preview (`then`, populated only
// when repeat is on — build_snapshot's own after_list_preview). null when
// none of the three holds anything.
export function upNextItem(snapshot) {
  var queue = snap(snapshot).play_next || [];
  if (queue.length > 0) return queue[0];
  var fromSource = snap(snapshot).from_source || [];
  if (fromSource.length > 0) return fromSource[0];
  return (snap(snapshot).then || [])[0] || null;
}

// Inline "Up next: <title>" line, or null when there is nothing up next — a
// music video never wraps to "Start again" text the way a film/series does
// (no countdown overlay either, screen-video-page.js's mvEnded advances
// directly), so every non-null case is the same "Up next: " prefix.
export function upNextLine(snapshot) {
  var next = upNextItem(snapshot);
  if (!next) return null;
  return { prefix: 'Up next: ', label: next.title };
}

// The ⏮/⏭ transport + Shuffle/Repeat pills are only live for a multi-item
// playthrough — a lone pick has nothing to advance through or shuffle
// (mirrors the retired seq-based isMulti's own gate).
export function isMulti(snapshot) {
  return (snap(snapshot).item_count || 0) > 1;
}
