// BUG-034 — one remembered session volume, shared by the video + audio players.
// Player gain lives on the media element's `.volume`; it survives an in-page src
// swap but NOT a full page nav (a fresh <video>/<audio> defaults to 1.0). This
// store persists the chosen level so each new player re-applies it on construction.
//
// Single key, one level for BOTH players (owner decision — "set it once"). If a
// per-media-type split is ever wanted, key by type here (follow-up, not built).
// `localStorage` is a browser global, not a DOM token, so it is allowed in core/.

var KEY = 'grew-tv.volume';

function clamp(v) { return Math.max(0, Math.min(1, v)); }

// Read the remembered level, clamped to 0..1. Absent / NaN / garbage → 1 (full).
export function readVolume() {
  var raw = localStorage.getItem(KEY);
  var v = parseFloat(raw);
  if (isNaN(v)) return 1;
  return clamp(v);
}

// Persist a level, clamped to 0..1 (stored as a string, like every localStorage value).
export function writeVolume(v) {
  localStorage.setItem(KEY, String(clamp(v)));
}
