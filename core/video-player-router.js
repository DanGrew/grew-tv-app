// FEAT-037 / TASK-222 — pure "view-router" for the persistent video player.
//
// The video player is SERVER-AUTHORITATIVE for a series/boxset (mirrors the music
// page, FEAT-031): the page renders the video `playback` snapshot the backend
// pushes (TASK-221) — source items + current index + repeat flag — and never
// computes the order itself. This module turns that snapshot into the small
// view-model the thin DOM mount (ui/screens/screen-video-page.js) applies: which
// item to show, whether showing it is a swap, the inline up-next line, the
// auto-advance target, and whether the ⏮/⏭ series transport is live.
//
// Pure + DOM-free + no fetch (the no-pure-fn-outside-core gate): the page owns all
// DOM and network. The snapshot shape (TASK-221 build_snapshot):
//   { now_playing, current_item_index, items[], source_type, source_id,
//     repeat, shuffle }
// where now_playing / each item is { item_id, title, poster, duration,
// subtitles, type, ext }.

function snap(snapshot) { return snapshot || {}; }
function itemsOf(snapshot) { return snap(snapshot).items || []; }
function indexOf(snapshot) { return snap(snapshot).current_item_index || 0; }
// FEAT-040/TASK-249: the durable override ("Play Next") queue rides the snapshot
// (TASK-247) as resolved entries that play AHEAD of the source.
function queueOf(snapshot) { return snap(snapshot).override_queue || []; }

// The now-playing item the view should show (or null for an empty / absent
// source — e.g. a standalone film never has a snapshot).
export function nowPlaying(snapshot) {
  return snap(snapshot).now_playing || null;
}

// True when the snapshot's now-playing differs from what the <video> element
// currently holds — the thin mount swaps media in place ONLY then, so the same
// item re-arriving (a position-only or flag-only snapshot) never reloads.
export function isSwap(loadedId, snapshot) {
  var np = nowPlaying(snapshot);
  if (!np) return false;
  return np.item_id !== loadedId;
}

// The item that plays AFTER the current one. The override ("Play Next") queue
// takes precedence: a non-empty queue means its FRONT plays next (FEAT-040 — the
// queue plays ahead of the source, matching the engine's next_item). Otherwise the
// next in source order, wrapping last -> first when repeat is on (the 'start again'
// loop, BUG-005). null when there is no next — no source, a single-item source
// with an empty queue, or a no-repeat series sitting on its last item. Drives both
// the inline up-next line and the auto-advance countdown target.
export function upNextItem(snapshot) {
  var queue = queueOf(snapshot);
  if (queue.length > 0) return queue[0];
  var items = itemsOf(snapshot);
  if (items.length <= 1) return null;
  var idx = indexOf(snapshot);
  var atEnd = idx >= items.length - 1;
  if (atEnd && !snap(snapshot).repeat) return null;
  return items[(idx + 1) % items.length] || null;
}

// Inline up-next line parts (mirrors series-detail.upNextParts): a real next
// episode -> "Up next: " + its title; the wrapping end of a repeating series ->
// "Start again". A queued item up next is always "Up next: <title>" (it is an
// explicit pick, never the repeat-wrap). null when there is no up-next (the page
// leaves the line blank).
export function upNextLine(snapshot) {
  var next = upNextItem(snapshot);
  if (!next) return null;
  var queue = queueOf(snapshot);
  if (queue.length > 0) return { prefix: 'Up next: ', label: next.title };
  var items = itemsOf(snapshot);
  var wrapping = indexOf(snapshot) >= items.length - 1;
  if (wrapping) return { prefix: '', label: 'Start again' };
  return { prefix: 'Up next: ', label: next.title };
}

// The ⏮/⏭ series transport is live only when the source has more than one item
// (a lone item / standalone film hides them — they stay out of the d-pad cycle).
export function seriesMode(snapshot) {
  return itemsOf(snapshot).length > 1;
}
