// FEAT-526/TASK-601 — ☰ Context (`c`) on a browsing screen presses the ＋ that
// belongs to whatever is focused: a tile's ＋ badge, or a row's ＋ / ＋ Queue.
// It is a press on the control already drawn, never a second path to its
// action — so which Queue it fills (BUG-531, `itemMediaType()` inside each
// onQueue) and where focus goes when a sheet closes stay the control's own.
//
// Every tile or row carries at most one ＋, so the lookup is the same on every
// screen: the closest tile or row to the focus, then its ＋. A focused Restart
// or ↑/↓/✕ still resolves to its row. A ＋ that is not drawn or is disabled is
// not pressed, and a focus outside any tile or row (a tab, a crumb, a chip, an
// open sheet) presses nothing.
var ITEM = '.film-tile, .detail-row';
var PLUS = '.tile-queue:not([disabled]), .detail-add:not([disabled]), .detail-queue:not([disabled])';

export function pressFocusedPlus(e) {
  [document.activeElement.closest(ITEM)].filter(Boolean)
    .map(function(item) { return item.querySelector(PLUS); })
    .filter(Boolean)
    .filter(function(plus) { return plus.getClientRects().length > 0; })
    .forEach(function(plus) { e.preventDefault(); plus.click(); });
}
