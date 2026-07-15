// External destinations (TASK-330 / FEAT-049) — a config-driven "door" from the
// grew-tv home screen to a SEPARATE app served elsewhere on the LAN. grew-tv learns
// NO destination specifics: each entry is generic data `{ id, name, icon, port,
// tvPath, remotePath }`, and the home tile (TV) + companion mirror both render and
// cross from THIS list. The sole current entry is the curriculum Atlas (homeschooling
// TASK-ATLAS-TV-DEPLOY), but the mechanism could point anywhere — swap the entry and
// the door re-points with zero code change.
//
// The URLs are NOT baked to a fixed host (BUG-054). A destination is assumed to run on
// the SAME host grew-tv itself is served from (just a different port), so the actual
// URL is built at cross time from the caller's `location.hostname` via
// `destinationUrls`. That way the door resolves to the Mini on the LAN, to localhost in
// local dev, or to whatever LAN IP a phone loaded grew-tv from — never a hardcoded IP
// that only works from one machine.
//
// The config is STATIC (no runtime fetch to the destination), so a down / unreachable
// destination can never break grew-tv's render or selection: the tile still shows and
// stays selectable, the cross just doesn't land. grew-tv never depends on the
// destination being up.
//
//   port       — the destination's port on the shared host.
//   tvPath     — the destination's TV page   (the TV crosses here).
//   remotePath — the destination's phone page (the companion crosses here).
var DESTINATIONS = [
  {
    id: 'atlas',
    name: 'Atlas',
    icon: '🗺️',
    port: 8090,
    tvPath: '/app/tv.html',
    remotePath: '/app/remote.html'
  }
];

// The configured external destinations. A fresh array each call so a caller can't
// mutate the module's config in place.
export function externalDestinations() {
  return DESTINATIONS.slice();
}

// The destination's live URLs, built against `host` (the caller's `location.hostname`
// — the host grew-tv itself was served from). Same host, the destination's own port +
// paths — so the door follows grew-tv wherever it runs, instead of a hardcoded IP.
export function destinationUrls(dest, host) {
  var base = 'http://' + host + ':' + dest.port;
  return { tvUrl: base + dest.tvPath, remoteUrl: base + dest.remotePath };
}

// The params carried in the `launchExternal` intent from the companion to the TV:
// only the TV destination (the companion walks ITSELF to remoteUrl). One tested place
// for the wire shape the TV's intent handler reads. `host` threads through to
// destinationUrls so the TV crosses to the same host the companion resolved.
export function launchExternalParams(dest, host) {
  return { tvUrl: destinationUrls(dest, host).tvUrl };
}
