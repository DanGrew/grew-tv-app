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

// BUG-521 — true when the entry-time RESYNC answer must be discarded.
//
// video.html runs two independent async chains on entry: the play POST for the
// item in ?video=, and the BUG-439 recovery GET fired once activate_person
// confirms. That GET exists for ONE job — recover a push the server dropped
// while this person was still unbound — so it is a fallback, never an override.
// Its answer is untrustworthy in a way a WS push never is: issued before the
// server applied our POST, it describes the PREVIOUS item, and applied on top
// of the correct one it swaps the player back to whatever was selected last
// time. Both orderings of that race are covered here:
//
//   * something is already loaded -> a push DID land, so the recovery has
//     nothing to recover; a disagreeing answer is simply the older one.
//   * nothing loaded yet, but the answer names an item other than the one this
//     page was opened for -> it predates our POST.
//
// `pendingId` null (Play All, ?playQueue — the engine picks the item, we did
// not) means only the first rule applies. A snapshot with no now_playing is
// never stale: it carries queue and transport state the page still wants.
export function isStaleResync(pendingId, loadedId, snapshot) {
  var np = nowPlaying(snapshot);
  if (loadedId) return true;
  if (!pendingId) return false;
  if (!np) return false;
  return np.item_id !== pendingId;
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

// Inline up-next line parts (mirrors video-player-router.upNextLine): a real
// next item -> "Up next: " + its title; the wrapping end of a repeating
// source -> "Start again" (TASK-503 — films keep this wording moving onto
// this engine; queue and next both empty means the only candidate left is
// the repeat-wrap preview, coming_up). null when there is no up-next.
export function upNextLine(snapshot) {
  var next = upNextItem(snapshot);
  if (!next) return null;
  var wrapping = (snap(snapshot).queue || []).length === 0 && (snap(snapshot).next || []).length === 0;
  if (wrapping) return { prefix: '', label: 'Start again' };
  return { prefix: 'Up next: ', label: next.title };
}

// TASK-501 removed `queueCount` — its one consumer was browse's 🎬/🎵 pills,
// and the Continue buttons that replace them show no count (owner's call): what
// they read is queue-shell-view.js's own transportState, the same rule ⏭ uses.

// The active source's id, or null when there is no source at all
// (source_type unset — a standalone film/single item). TASK-503 — a
// companion Queue View page (the shell's hero) uses this to
// know WHICH source id its own title lookup needs, without duplicating the
// "no source_type -> no source_id" rule inline (a pure fn, so it belongs
// here, not in the ui/** consumer).
export function sourceId(snapshot) {
  return snap(snapshot).source_type ? snap(snapshot).source_id : null;
}

// TASK-505 — the active source's IDENTITY, for a caller that fetches the
// source's display name once and must know when that name is stale. `sourceId`
// alone cannot serve: the whole-catalog Play All sources ('mv-all',
// 'home-movies-all') are real sources carrying no id, which an id-only key
// cannot tell apart from having no source at all. null when there is no
// source, so a caller clears its cached title rather than fetching.
export function sourceKey(snapshot) {
  var s = snap(snapshot);
  if (!s.source_type) return null;
  return s.source_type + '/' + s.source_id;
}
