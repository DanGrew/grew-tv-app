// FEAT-038 (TASK-229/230) — companion desync mode.
//
// The companion is normally SYNCED: it mirrors the TV's app_state for navigation
// and drives the TV via nav/transport intents (the FEAT-017/026 "companion
// drives, TV mirrors" invariant). DESYNCED flips BOTH seams off — the companion
// navigates its own local pages and stops emitting nav/transport intents — while
// leaving the WS connection, person registration, and per-person queue/playlist
// POSTs (HTTP, not WS) untouched. A desynced companion is still the same person,
// so its queue/playlist adds keep landing.
//
// This module is the gate. It owns the mode flag plus the two pure predicates the
// gated seams consult:
//   - inbound  (app_state -> navigation): appStateDrivesNav(mode), wired per
//     companion screen (the screen still reads app_state for its display-only TV
//     status strip; only the navigate-on-it step is gated).
//   - outbound (nav/transport intent emit): navIntentsAllowed(mode), wired
//     centrally in core/companion-ws.js (see connect(opts.mode)).
//
// PERSISTENCE (TASK-230): the companion is multi-page — every screen is its own
// HTML page and navigation is a full page load, so an in-memory flag would reset
// to synced the instant you open a detail page. The flag therefore lives in
// sessionStorage (same mechanism as core/nav-trail.js): it survives intra-app
// navigation, and clears on tab close. A manual reload keeps the flag (the Sync
// button is always present to snap back); a remembered-across-tab-close mode is
// deferred (FEAT-038).

export var SYNCED = 'synced';
export var DESYNCED = 'desynced';

var MODE_KEY = 'grew-tv:companion-mode';

// The two gated seams as pure predicates. Standalone so companion-ws.js (outbound)
// and the screens (inbound) check the same flag, and so both are trivially
// unit-testable. Anything not literally DESYNCED reads as synced (fail-open): a
// missing/unknown value never silently suppresses the TV.
export function appStateDrivesNav(mode) { return mode !== DESYNCED; }
export function navIntentsAllowed(mode) { return mode !== DESYNCED; }

// Tolerate a missing/throwing sessionStorage (degrades to synced, never throws).
function readMode() {
  try {
    var v = sessionStorage.getItem(MODE_KEY);
    if (v === DESYNCED) return DESYNCED;
    return SYNCED;
  } catch (e) {
    return SYNCED;
  }
}
function writeMode(m) {
  try { sessionStorage.setItem(MODE_KEY, m); } catch (e) { /* no-op */ }
}

export function createCompanionMode() {
  var stack = []; // in-memory local nav stack; cross-page Back uses nav-trail

  function mode() { return readMode(); }
  function isDesynced() { return mode() === DESYNCED; }

  // Going SYNCED clears the local stack: re-sync re-applies the latest app_state
  // from a clean slate (FEAT-038 re-sync contract).
  function setSynced() { writeMode(SYNCED); stack = []; }
  function setDesynced() { writeMode(DESYNCED); }

  // Flip and return the new mode (for the toggle button).
  function toggle() {
    if (isDesynced()) setSynced();
    else setDesynced();
    return mode();
  }

  // Local nav stack. Entries are opaque { page, params, ... } location objects.
  function push(entry) { stack.push(entry); }
  function current() {
    if (stack.length === 0) return null;
    return stack[stack.length - 1];
  }
  function back() {
    // A pop on an empty stack is a harmless no-op and current() already returns
    // null for an empty stack, so no length guard is needed here.
    stack.pop();
    return current();
  }
  function depth() { return stack.length; }
  function reset() { stack = []; }

  return {
    mode: mode,
    isDesynced: isDesynced,
    setSynced: setSynced,
    setDesynced: setDesynced,
    toggle: toggle,
    drivesNav: function() { return appStateDrivesNav(mode()); },
    intentsAllowed: function() { return navIntentsAllowed(mode()); },
    push: push,
    current: current,
    back: back,
    depth: depth,
    reset: reset
  };
}
