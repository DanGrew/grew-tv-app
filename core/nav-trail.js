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

// Reset the trail — e.g. navigating Home, so the stack can't grow unbounded or
// loop back on itself.
export function clear() {
  sessionStorage.removeItem(KEY);
}
