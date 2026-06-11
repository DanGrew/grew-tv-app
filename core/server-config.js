// Single source for the media-manager's WebSocket URL (FEAT-019 TASK-134).
//
// The WS runs on its own port — the one host detail a page can't read off its
// own URL (location gives the HTTP port, not this one). The host, though, comes
// from wherever the app/companion was loaded: `localhost` on the Mac Mini's
// kiosk, the Mini's LAN IP (or `*.local`) on a secondary device. Deriving the
// host from `location.hostname` instead of hardcoding `localhost` is what lets
// the app reach the WS from a second device on the LAN.
//
// The port lives here, in one tested place, rather than pasted at ~12 call
// sites. TASK-133 serves it at /api/config so a future change can drive it from
// the server; until ports actually vary, the home setup's default is enough.
export var WS_PORT = 8766;

export function wsUrl(hostname) {
  return 'ws://' + hostname + ':' + WS_PORT;
}
