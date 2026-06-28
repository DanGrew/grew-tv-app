// FEAT-038 (TASK-230) — safe-by-default button gating for the desynced companion.
//
// A companion screen has three kinds of control:
//   - drives the TV (play, play_next, transport, navigate) — valid ONLY when
//     synced; greyed out when desynced (the WS layer already no-ops the intent,
//     this is the visible half so there are no dead clicks).
//   - per-person server actions (add to playlist / queue) — valid in BOTH modes;
//     they never move the TV.
//   - local-only (the Sync toggle, local navigation, season chips) — BOTH modes.
//
// Rule: a control must be EXPLICITLY declared valid-while-desynced, otherwise it
// is disabled when desynced. Safe by default — forget to classify a control and
// it greys out rather than silently poking the TV.
//
// The set is the whitelist of actions usable while desynced. Everything else is
// synced-only.
var DESYNC_OK = {
  'add-playlist': true,   // POST add-track / add-source (per-person, HTTP)
  'add-queue': true,      // POST queue action (per-person, HTTP) — TASK-231
  'local-nav': true,      // local page navigation (Back, open detail, drill)
  'season': true,         // local season-chip re-render
  'toggle-sync': true,    // the Sync/Desync switch itself
  'switch-profile': false // profile switch drives the TV -> synced only
};

// True when a control of `action` should be ENABLED in the current mode.
// Synced => everything enabled. Desynced => only whitelisted actions.
export function actionEnabled(action, desynced) {
  if (!desynced) return true;
  return DESYNC_OK[action] === true;
}

// Which browse-tile destinations a desynced companion can open on its own. Detail
// pages (series + album) self-load from a URL id (TASK-230); artist + playlist
// pages aren't desync-aware yet, and a bare video/film tile only "plays" (a TV
// action). cardRoute() (core/home-rails.js) is the input.
var DESYNC_OPENABLE = { series: true, album: true };
export function tileOpenableDesynced(route) { return DESYNC_OPENABLE[route] === true; }

// True when a browse tile should be greyed out: desynced AND not locally
// openable. Synced tiles are never off.
export function tileOffDesynced(route, desynced) {
  return desynced && !tileOpenableDesynced(route);
}
