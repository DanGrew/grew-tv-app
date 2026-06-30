// Sticky navigation trail (FEAT-032 / TASK-190). grew-tv-app is multi-page —
// every screen is its own HTML page and navTo does a full page load, so
// nothing in memory survives a navigation. This module is the real recorded
// drill path, persisted in sessionStorage so Back (and the breadcrumb) can
// retrace it instead of jumping to a hardcoded default parent.
//
// Session-only by design: sessionStorage clears on tab close / kiosk relaunch,
// so a fresh start opens at Home (the correct default) for free (FEAT-032 scope
// decision, owner 2026-06-14). No localStorage / URL persistence.
//
// The stack is a plain JSON array under ONE key, innermost-last:
//   entry = { page, params, scrollY, focusedId }
//   top of stack (last element) = the immediate parent of the current screen.
//   page / params  — reload the ancestor with navTo(page, params) (same contract).
//   scrollY        — vertical scroll of that screen when it was left.
//   focusedId      — data-id of the focused tile/row (Back restores the cursor).
//
// DOM-free: callers read scrollY / focusedId off a popped entry and apply them.
// The { page, params } shape matches core/breadcrumb.js crumbs so truncateTo
// keys off the same identifiers the breadcrumb already renders.

var KEY = 'grew-tv:nav-trail';

// Read the stack, tolerating a missing key or malformed JSON (stale / corrupt
// session) — a bad value degrades to an empty trail, never throws.
function read() {
  try {
    var raw = sessionStorage.getItem(KEY);
    var arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr;
    return [];
  } catch (e) {
    return [];
  }
}

function write(stack) {
  sessionStorage.setItem(KEY, JSON.stringify(stack));
}

// Stable comparison of two nav targets ({ page, params }) independent of param
// key order — the trail entry and the breadcrumb crumb are built separately, so
// match on page + order-insensitive params rather than reference identity.
function stableParams(params) {
  var p = params || {};
  return Object.keys(p).sort().map(function(k) { return k + '=' + p[k]; }).join('&');
}

function sameTarget(entry, page, params) {
  return entry.page === page && stableParams(entry.params) === stableParams(params);
}

// Record the screen being left, then drill into a child. The entry should
// describe the CURRENT screen (its page/params/scrollY/focusedId); the caller
// navigates to the child immediately after.
export function push(entry) {
  var stack = read();
  stack.push(entry);
  write(stack);
}

// Push only if the entry isn't already the top (same page + params, order-
// insensitive) — for a screen that records itself on load and must not stack a
// duplicate when re-entered (e.g. the companion artist page reached again via a
// child's Back). A different page/params still pushes.
export function pushUnique(entry) {
  var top = peek();
  if (top && top.page === entry.page && stableParams(top.params) === stableParams(entry.params)) return;
  push(entry);
}

// Back: remove and return the top entry (immediate parent), or null if the
// trail is empty (deep-link / session's first nav — caller falls back to its
// hardcoded default). The caller navTos the entry and restores scrollY/focusedId.
export function pop() {
  var stack = read();
  if (stack.length === 0) return null;
  var top = stack.pop();
  write(stack);
  return top;
}

// The full stack, innermost-last (a copy is fine to read; callers don't mutate).
// Lets a caller pick a specific ancestor — e.g. the companion browse page
// restoring from ITS own browse.html entry even when a deeper artist entry sits
// on top.
export function entries() {
  return read();
}

// Inspect the immediate parent without leaving the current screen. Returns null
// when the trail is empty.
export function peek() {
  var stack = read();
  if (stack.length === 0) return null;
  return stack[stack.length - 1];
}

// Breadcrumb ancestor-click (a sideways/up jump, not a drill): keep only the
// clicked ancestor's own ancestors so the trail stays consistent with where you
// now are. The clicked screen becomes current, so it is dropped from the trail
// along with everything deeper. A click on a target NOT in the trail clears it
// (the caller then falls back to a default load).
export function truncateTo(page, params) {
  var stack = read();
  var idx = -1;
  var i;
  for (i = 0; i < stack.length; i++) {
    if (sameTarget(stack[i], page, params)) { idx = i; break; }
  }
  if (idx === -1) { write([]); return; }
  write(stack.slice(0, idx));
}

// Like truncateTo, but KEEPS the clicked entry as the new top (drops only what is
// deeper). A breadcrumb crumb is where you are GOING, and for a recorded browse
// rail entry that destination page (companion-browse) rebuilds its level by
// reading the trail top — so the entry must survive the click, or browse reloads
// at the sections root and the drill position is lost (BUG-021 "back; no nav
// trail"). truncateTo drops the entry on the assumption the landed screen
// re-records itself, but browse can only re-record AFTER it has restored from the
// trail, so the entry has to remain. Not-in-trail clears (default load).
export function truncateThrough(page, params) {
  var stack = read();
  var idx = -1;
  var i;
  for (i = 0; i < stack.length; i++) {
    if (sameTarget(stack[i], page, params)) { idx = i; break; }
  }
  if (idx === -1) { write([]); return; }
  write(stack.slice(0, idx + 1));
}

// Reset the trail — e.g. navigating Home, so the stack can't grow unbounded or
// loop back on itself.
export function clear() {
  sessionStorage.removeItem(KEY);
}

// A breadcrumb ancestor CLICK (a sideways/up jump): trim the trail so a later
// Back can't retrace PAST where you jumped, but KEEP the clicked entry as the new
// top so the landed page can restore from it. The Home crumb (empty params) clears
// the whole trail; any other ancestor truncates THROUGH itself (keeps it, drops
// everything deeper). This is the one call every companion crumb handler must
// make — without it the trail only ever grew or cleared wholesale, so a stale top
// entry (e.g. an old artist.html level) survived a sideways jump and drove the
// next screen's Back to the wrong place (FEAT-032 stale-Back bug). BUG-021: it
// used to drop the clicked entry too (truncateTo), which lost the browse rail
// position on a back-to-rail click — now it keeps it (truncateThrough) so
// companion-browse re-seeds the grid from the surviving entry.
export function trimOnCrumb(page, params) {
  if (Object.keys(params || {}).length === 0) {
    clear();
    return;
  }
  truncateThrough(page, params);
}
