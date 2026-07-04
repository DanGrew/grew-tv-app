// Single source for the media-manager's WebSocket URL (FEAT-019 TASK-134).
//
// The WS runs on its own port — the one host detail a page can't read off its
// own URL (location gives the HTTP port, not this one). The host, though, comes
// from wherever the app/companion was loaded: `localhost` on the Mac Mini's
// kiosk, the Mini's LAN IP (or `*.local`) on a secondary device. Deriving the
// host from `location.hostname` instead of hardcoding `localhost` is what lets
// the app reach the WS from a second device on the LAN.
//
// The port lives here as the fallback default. TASK-133 serves the live port at
// /api/config; TASK-297 reads it (fetchWsUrl) so a companion served off a
// non-default port reaches THAT server's WS, not a hardcoded 8766.
export var WS_PORT = 8766;

export function wsUrl(hostname, port) {
  return 'ws://' + hostname + ':' + (port != null ? port : WS_PORT);
}

// TASK-297: resolve the WS URL from the server the page was loaded from. The WS
// runs on its own port — the one host detail a page can't read off its own URL —
// so ask the server for it via /api/config.wsPort (authoritative) instead of
// hardcoding 8766. The host still comes from location.hostname (what lets a LAN
// device reach the WS, TASK-134). Falls back to WS_PORT if the endpoint or the
// field is absent, so an older server or a fetch failure still connects.
export function fetchWsUrl(serverOrigin) {
  return fetch(serverOrigin + '/api/config')
    .then(function(r) { return r.json(); })
    .then(function(c) { return wsUrl(location.hostname, c.wsPort); })
    .catch(function() { return wsUrl(location.hostname); });
}
