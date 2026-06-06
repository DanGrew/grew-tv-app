// Profiles + PIN gate config (TASK-120, FEAT-017). The media-manager serves a
// config.json from the content root (fetched via /media/config.json) holding the
// family's profiles and the Adults gate PIN. The gate is a deliberate SOFT block
// for young children — deterrence, not security — so the PIN is plaintext and
// trivially swappable; it lives on the device, never in this public repo. When
// the file is absent or malformed the app falls back to the built-in defaults
// below so the screen always works.
//
// config shape: { pin: "1234", profiles: [ { id, label, locked, photo } ] }

export var PIN_LEN = 4;
export var DEFAULT_PIN = '1234';

function defaultProfiles() {
  return [
    { id: 'kids',   label: 'Kids',   locked: false, photo: null },
    { id: 'adults', label: 'Adults', locked: true,  photo: null }
  ];
}

export function defaultConfig() {
  return { pin: DEFAULT_PIN, profiles: defaultProfiles() };
}

function normalizeProfile(raw) {
  return {
    id: raw.id,
    label: raw.label != null ? raw.label : raw.id,
    locked: !!raw.locked,
    photo: raw.photo != null ? raw.photo : null
  };
}

// Tolerant parse — any missing/invalid piece falls back to a default so a typo in
// the family's config can never blank the profile screen. Profiles must be a
// non-empty array of objects with an id; otherwise the default pair is used.
export function parseConfig(raw) {
  var cfg = raw && typeof raw === 'object' ? raw : {};
  var pin = typeof cfg.pin === 'string' && cfg.pin.length ? cfg.pin : DEFAULT_PIN;
  var list = Array.isArray(cfg.profiles)
    ? cfg.profiles.filter(function(p) { return p && typeof p === 'object' && p.id; })
    : [];
  var profiles = list.length ? list.map(normalizeProfile) : defaultProfiles();
  return { pin: pin, profiles: profiles };
}

export function pinMatches(config, entered) {
  return !!config && entered === config.pin;
}

// ── PIN entry (pure state on a digit string) ───────────────────────────────
export function pushDigit(current, digit) {
  return current.length >= PIN_LEN ? current : current + digit;
}

export function popDigit(current) {
  return current.slice(0, -1);
}

export function isPinComplete(current) {
  return current.length >= PIN_LEN;
}

// One boolean per dot — filled up to the entered length.
export function dotFill(current) {
  var dots = [];
  for (var i = 0; i < PIN_LEN; i++) dots.push(i < current.length);
  return dots;
}

// ── Keypad d-pad navigation (clamped grid, no wrap) ────────────────────────
// index -> new index after an arrow key on a `cols`-wide grid of `count` cells.
// Mirrors the player's Jump grid: clamp at the edges rather than wrap.
export function keypadNav(index, key, cols, count) {
  var deltas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
  var d = deltas[key] != null ? deltas[key] : 0;
  return Math.max(0, Math.min(count - 1, index + d));
}
