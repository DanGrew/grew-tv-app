// TASK-643 (FEAT-526) — the remote's − (`-`) on Browse clears the focused tile's
// watch progress, two presses to do it: the first arms the tile ("Clear
// progress?"), the second clears. The same two-press shape as the player's own
// Clear progress (TASK-142), because − sits beside + and is easy to knock.
//
// Browse is the one surface where − is not "previous": nothing plays there, so
// the key was free, and it pairs with + — + adds, − clears (owner, 2026-09-23).
//
// A tile has progress when the active person's Continue Watching rows carry its
// id — the same rows that draw its bar and put it on the Continue Watching rail,
// so a tile that shows a bar is a tile − can clear. A series tile carries the
// series id, never an episode's, so its bar (the furthest episode) is not one
// press's to clear and − does nothing there.

export var CLEAR_PROMPT = 'Clear progress?';

export function hasProgress(cwRows, id) {
  return (cwRows || []).some(function(r) { return r.item_id === id; });
}

// What one − press does to the focused tile: 'none' with no progress to clear,
// 'arm' on the first press, 'clear' on the second.
export function minusAction(armed, progress) {
  if (!progress) return 'none';
  return armed ? 'clear' : 'arm';
}

// The Continue Watching rows once `id` is cleared — the rail and every bar on
// the page are drawn from these, so dropping the row is the whole of "gone".
export function withoutProgress(cwRows, id) {
  return (cwRows || []).filter(function(r) { return r.item_id !== id; });
}
