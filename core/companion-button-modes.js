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

// Which browse-tile destinations a desynced companion can open on its own, and
// the COMPANION page that self-loads each from a URL id. series/album -> detail,
// playlist -> playlist, artist -> artist (DSYNC-2c). A bare video/film only
// "plays" (a TV action), so it has no desync page. cardRoute() (core/home-rails.js)
// is the input. NB a playlist MUST route to playlist.html (loadPlaylist /
// /api/playlist) — sending a playlist id to detail.html hits /api/series and 404s.
var DESYNC_PAGE = { series: 'detail.html', album: 'detail.html', playlist: 'playlist.html', artist: 'artist.html' };
export function desyncOpenPage(route) { return DESYNC_PAGE[route] || null; }
export function tileOpenableDesynced(route) { return desyncOpenPage(route) != null; }

// True when a browse tile should be greyed out: desynced AND not locally
// openable. Synced tiles are never off.
export function tileOffDesynced(route, desynced) {
  return desynced && !tileOpenableDesynced(route);
}
