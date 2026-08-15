// TASK-411 — pure swipe/pager math for the companion Rails pager. Drag
// activation (horizontal vs the page's own vertical scroll), end resistance,
// and the swipe-threshold decision all live here so
// ui/screens/companion-browse.js stays complexity-1 glue.

var SWIPE_THRESHOLD = 40; // px — a shorter drag snaps back, doesn't page
var ACTIVATE_THRESHOLD = 8; // px — noise floor before committing to a direction
var RESISTANCE = 0.3; // damping factor once dragging past either end

// The id of a rail list's first entry, or undefined for an empty list.
export function firstRailId(rails) {
  return [rails[0]].filter(Boolean).map(function(r) { return r.id; })[0];
}

export function isHorizontalDrag(dx, dy) {
  return Math.abs(dx) > Math.abs(dy);
}

// Once a drag has committed to paging (active), it stays active for the rest
// of the gesture even if the finger drifts more vertical — only the earliest,
// still-ambiguous movement decides direction, past a small noise floor. A
// horizontal delta under the floor can never win isHorizontalDrag against a
// dy at or past it, so gating on dx alone (not also dy) already covers both.
export function shouldActivateDrag(active, dx, dy) {
  if (active) return true;
  if (Math.abs(dx) < ACTIVATE_THRESHOLD) return false;
  return isHorizontalDrag(dx, dy);
}

// The live offset to paint during a drag — damped once index is at either
// end of the rail list and still being dragged further past it. Gated on
// Math.sign rather than dx >/< 0 — a dx of exactly 0 is never resisted
// either way (0 * anything is 0), so the boundary is otherwise unobservable.
export function pageOffset(dx, index, count) {
  var dir = Math.sign(dx);
  var pastStart = index <= 0 && dir === 1;
  var pastEnd = index >= count - 1 && dir === -1;
  if (pastStart || pastEnd) return dx * RESISTANCE;
  return dx;
}

// Which rail index a released drag lands on — one rail at a time, clamped to
// the list, never past either end.
export function swipeTarget(dx, index, count) {
  if (Math.abs(dx) < SWIPE_THRESHOLD) return index;
  if (Math.sign(dx) === -1) return Math.min(index + 1, Math.max(count - 1, 0));
  return Math.max(index - 1, 0);
}

// One arrow-step (‹ ›), clamped the same way a completed swipe is.
export function stepIndex(index, count, dir) {
  if (dir === 'prev') return Math.max(index - 1, 0);
  return Math.min(index + 1, Math.max(count - 1, 0));
}

// An arrow is disabled once stepping it further wouldn't move — matching
// swipeTarget/stepIndex's own clamp rather than a separately-stated rule.
export function arrowDisabled(index, count, dir) {
  return stepIndex(index, count, dir) === index;
}
