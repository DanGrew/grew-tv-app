// External destinations (TASK-330 / FEAT-049) — a config-driven "door" from the
// grew-tv home screen to a SEPARATE app served elsewhere on the LAN. grew-tv learns
// NO destination specifics: each entry is generic data
// `{ id, name, icon, tvUrl, remoteUrl }`, and the home tile (TV) + companion mirror
// both render and cross from THIS list. The sole current entry is the curriculum
// Atlas (homeschooling TASK-ATLAS-TV-DEPLOY), but the mechanism could point anywhere
// — swap the URLs and the door re-points with zero code change.
//
// The config is STATIC (no runtime fetch to the destination), so a down / unreachable
// destination can never break grew-tv's render or selection: the tile still shows and
// stays selectable, the cross just doesn't land. grew-tv never depends on the
// destination being up.
//
//   tvUrl     — the destination's TV page   (the TV crosses here).
//   remoteUrl — the destination's phone page (the companion crosses here).
var DESTINATIONS = [
  {
    id: 'atlas',
    name: 'Atlas',
    icon: '🗺️',
    tvUrl: 'http://192.168.1.242:8090/app/tv.html',
    remoteUrl: 'http://192.168.1.242:8090/app/remote.html'
  }
];

// The configured external destinations. A fresh array each call so a caller can't
// mutate the module's config in place.
export function externalDestinations() {
  return DESTINATIONS.slice();
}

// The params carried in the `launchExternal` intent from the companion to the TV:
// only the TV destination (the companion walks ITSELF to remoteUrl). One tested
// place for the wire shape the TV's intent handler reads.
export function launchExternalParams(dest) {
  return { tvUrl: dest.tvUrl };
}

// Inner markup for a home-screen external tile: the door glyph as the poster
// placeholder + the destination name. A pure HTML-string builder (no DOM), so the
// screen just wraps it in a focusable element and wires the cross. Reuses the tile
// CSS classes the home rails already style.
export function externalTileHtml(dest) {
  return '<div class="film-poster-placeholder">' + dest.icon + '</div>'
    + '<div class="tile-title">' + dest.name + '</div>';
}
