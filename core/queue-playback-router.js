// TASK-499 (FEAT-497) — the pure view-router for the TASK-498 UNIFIED queue
// engine, the same role core/video-player-router.js plays for the video
// engine and core/music-video-playback-router.js plays for the music-video
// engine: turns the server `queue_playback` snapshot (api/queue_playback.py
// build_snapshot) into the small view-model the thin DOM mount
// (ui/screens/screen-video-page.js) applies to actually drive the <video>
// element for a cut-over media type (home movies first, TASK-499).
//
// The snapshot shape differs from both older routers': now_playing keys off
// `item_id` (like video's, not music-video's `video_id`), and there is no
// flat `items[]` + `current_item_index`/`override_queue` triple — `queue` /
// `next` / `coming_up` are the three lookahead lists the API already
// resolves (the override queue, the rest of the current permutation, and the
// read-only next-cycle preview).

function snap(snapshot) { return snapshot || {}; }

// The current item's resolved metadata (or null for an empty/absent snapshot).
export function nowPlaying(snapshot) {
  return snap(snapshot).now_playing || null;
}

// True when the snapshot's now-playing differs from what the <video> element
// currently holds — the thin mount swaps media in place ONLY then, mirroring
// video-player-router.isSwap / music-video-playback-router.isSwap.
export function isSwap(loadedId, snapshot) {
  var np = nowPlaying(snapshot);
  if (!np) return false;
  return np.item_id !== loadedId;
}

// The item that plays after the current one: the Queue's front wins (an
// explicit pick plays ahead of the source), else the next item still ahead
// in the current cycle (`next`), else the repeat-wrap preview (`coming_up`,
// already gated empty-when-repeat-off by the engine's own coming_up()). null
// when none of the three holds anything.
export function upNextItem(snapshot) {
  var queue = snap(snapshot).queue || [];
  if (queue.length > 0) return queue[0];
  var next = snap(snapshot).next || [];
  if (next.length > 0) return next[0];
  return (snap(snapshot).coming_up || [])[0] || null;
}

// Inline "Up next: <title>" line, or null when there is nothing up next.
export function upNextLine(snapshot) {
  var next = upNextItem(snapshot);
  if (!next) return null;
  return { prefix: 'Up next: ', label: next.title };
}
