// FEAT-038 (TASK-229) — companion desync mode.
//
// The companion is normally SYNCED: it mirrors the TV's app_state for navigation
// and drives the TV via nav/transport intents (the FEAT-017/026 "companion
// drives, TV mirrors" invariant). DESYNCED flips BOTH seams off — the companion
// navigates its own local stack and stops emitting nav/transport intents — while
// leaving the WS connection, person registration, and per-person queue POSTs
// (HTTP, not WS) untouched. A desynced companion is still the same person, so its
// queue-adds keep landing on the right queue.
//
// This module is the gate. It owns two things:
//   1. a mode flag (SYNCED default), and
//   2. a local navigation stack — the desynced browse path.
// plus the two pure predicates the gated seams consult:
//   - inbound  (app_state -> navigation): appStateDrivesNav(mode), wired per
//     companion screen in TASK-230 (the screen still reads app_state for its
//     display-only TV status strip; only the navigate-on-it step is gated).
//   - outbound (nav/transport intent emit): navIntentsAllowed(mode), wired
//     centrally in core/companion-ws.js (see connect(opts.mode)).
//
// In-memory only by design: a companion reload re-syncs by default (FEAT-038
// deferred: a remembered-desynced mode). Nothing here persists.

export var SYNCED = 'synced';
export var DESYNCED = 'desynced';

// The two gated seams as pure predicates. Standalone so companion-ws.js (outbound)
// and the screens (inbound, TASK-230) check the same flag, and so both are
// trivially unit-testable.
export function appStateDrivesNav(mode) { return mode !== DESYNCED; }
export function navIntentsAllowed(mode) { return mode !== DESYNCED; }

export function createCompanionMode() {
  var mode = SYNCED;
  var stack = []; // local nav stack, innermost-last; only meaningful while desynced

  function isDesynced() { return mode === DESYNCED; }

  // Going SYNCED clears the local stack: re-sync re-applies the latest app_state
  // from a clean slate (FEAT-038 — "Sync clears the local stack and re-applies
  // the latest app_state"). Going DESYNCED leaves the stack to the caller to seed
  // from the current location (TASK-230).
  function setSynced() { mode = SYNCED; stack = []; }
  function setDesynced() { mode = DESYNCED; }

  // Flip and return the new mode (for the toggle button, TASK-230).
  function toggle() {
    if (isDesynced()) setSynced();
    else setDesynced();
    return mode;
  }

  // Local nav stack. Entries are opaque { page, params, ... } location objects
  // (the same shape as core/nav-trail.js); the screens decide what to store.
  function push(entry) { stack.push(entry); }
  function current() {
    if (stack.length === 0) return null;
    return stack[stack.length - 1];
  }
  // Back: drop the top entry and return the new current (or null when empty).
  function back() {
    if (stack.length === 0) return null;
    stack.pop();
    return current();
  }
  function depth() { return stack.length; }
  function reset() { stack = []; }

  return {
    mode: function() { return mode; },
    isDesynced: isDesynced,
    setSynced: setSynced,
    setDesynced: setDesynced,
    toggle: toggle,
    // Convenience seam checks bound to this instance's mode.
    drivesNav: function() { return appStateDrivesNav(mode); },
    intentsAllowed: function() { return navIntentsAllowed(mode); },
    push: push,
    current: current,
    back: back,
    depth: depth,
    reset: reset
  };
}
