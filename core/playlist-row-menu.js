// TASK-328 — pure logic for the companion playlist row's per-track "⋮ more"
// popover. The row itself collapses to just the track tile + a single kebab
// button; tapping the kebab opens a small popover holding the four edit actions
// (＋ add · ↑ up · ↓ down · ✕ remove) as an icon-only vertical column. This
// module owns the two decisions that are pure — WHICH actions a row offers, and
// WHERE the popover sits — so the DOM layer (companion-playlist.js) stays
// cyclomatic-1 and both are unit- + mutation-tested.

// The ordered action keys for a row's popover. ＋ (add) and ✕ (remove) are always
// present; ↑ is dropped on the first row and ↓ on the last (an edge has nothing
// to swap with — matches the TV detail's edge gating, no greyed dead buttons).
export function rowActions(i, total) {
  var actions = ['add'];
  if (i > 0) actions.push('up');
  if (i < total - 1) actions.push('down');
  actions.push('x');
  return actions;
}

// The fixed `top` (px) for the popover given the trigger's viewport rect, the
// viewport height, and the measured popover height. Default: open just below the
// kebab (`bottom + GAP`). If that would overflow the viewport bottom, flip to open
// above (`top - GAP - popHeight`), clamped so it never runs off the top edge. Keeps
// the small popover fully on-screen on the last rows of a long, scrolled list.
export function popoverTop(triggerRect, viewportH, popHeight) {
  var GAP = 6;
  var below = triggerRect.bottom + GAP;
  if (below + popHeight <= viewportH) return below;
  return Math.max(GAP, triggerRect.top - GAP - popHeight);
}
