// Persons + PIN gate config (FEAT-026 TASK-156, generalizing TASK-120). The
// media-manager serves a config.json from the content root (fetched via
// /media/config.json) holding the family's persons and the gate PIN. A person
// carries identity (a stable `id` — the watch-progress key, TASK-154/155 — never
// the display name, so renames don't orphan progress) and a fixed content class
// (`profile`: kids|adults). Adult persons are gated behind a PIN; kids select
// freely. The gate is a deliberate SOFT block for young children — deterrence,
// not security — so the PIN is plaintext and trivially swappable; it lives on
// the device, never in this public repo. When the file is absent or malformed
// the app falls back to the generic placeholders below so the screen always
// works (real names/PINs are authored on-Mini at deploy).
//
// config shape: { defaultPin: "0000", persons: [ { id, name, profile, photo, emoji?, pin? } ] }
// A person's effective PIN = its own `pin` or the top-level `defaultPin`.

export var PIN_LEN = 4;
export var DEFAULT_PIN = '0000';

// Per-class fallback face when a person has no photo and no own emoji.
var PH_EMOJI = { kids: '🧒', adults: '🧑' };

// Per-class fallback name when no person resolves (config/id missing).
var PROFILE_LABEL = { kids: 'Kids', adults: 'Adults' };

// Generic placeholders only — one adult + one kid. NO real names or PINs here.
function defaultPersons() {
  return [
    { id: 'child',   name: 'Child',   profile: 'kids',   photo: null, emoji: null, pin: null },
    { id: 'grownup', name: 'Grown-up', profile: 'adults', photo: null, emoji: null, pin: null }
  ];
}

export function defaultConfig() {
  return { defaultPin: DEFAULT_PIN, persons: defaultPersons() };
}

function normalizePerson(raw) {
  return {
    id: raw.id,
    name: raw.name != null ? raw.name : raw.id,
    profile: raw.profile === 'adults' ? 'adults' : 'kids',
    photo: raw.photo != null ? raw.photo : null,
    emoji: typeof raw.emoji === 'string' && raw.emoji.length ? raw.emoji : null,
    pin: typeof raw.pin === 'string' && raw.pin.length ? raw.pin : null
  };
}

// Placeholder glyph for a person with no photo: the person's own emoji
// (FEAT-033, authored in config.json) wins, else the class default, else a
// generic face. The photo, when present, still wins upstream in the card
// builder — this only resolves the no-photo fallback.
export function personGlyph(person) {
  return [person.emoji, PH_EMOJI[person.profile]].filter(Boolean).concat(['👤'])[0];
}

// Tolerant parse — any missing/invalid piece falls back to a default so a typo in
// the family's config can never blank the picker. Persons must be a non-empty
// array of objects with an id; otherwise the placeholder pair is used.
export function parseConfig(raw) {
  var cfg = raw && typeof raw === 'object' ? raw : {};
  var dpin = typeof cfg.defaultPin === 'string' && cfg.defaultPin.length ? cfg.defaultPin : DEFAULT_PIN;
  var list = Array.isArray(cfg.persons)
    ? cfg.persons.filter(function(p) { return p && typeof p === 'object' && p.id; })
    : [];
  var persons = list.length ? list.map(normalizePerson) : defaultPersons();
  return { defaultPin: dpin, persons: persons };
}

// An adult person is gated; a kid person selects freely.
export function isLocked(person) {
  return !!person && person.profile === 'adults';
}

// A person's effective PIN = its own pin or the config default.
export function effectivePin(config, person) {
  return person.pin != null ? person.pin : config.defaultPin;
}

export function pinMatches(config, person, entered) {
  return !!config && !!person && entered === effectivePin(config, person);
}

export function personById(config, id) {
  return config.persons.filter(function(p) { return p.id === id; })[0] || null;
}

// The person to badge on the browse bar (FEAT-033): the active person resolved
// from config so the bar shows their authored name + glyph (e.g. "🦖 Daddy").
// When config or the person id is missing, fall back to a stand-in carrying the
// profile class, so the label still renders a class name + class glyph and never
// blanks.
export function badgePerson(config, personId, profile) {
  var found = personById(config, personId);
  if (found) return found;
  var prof = profile === 'adults' ? 'adults' : 'kids';
  return { id: null, name: PROFILE_LABEL[prof], profile: prof, emoji: null, photo: null, pin: null };
}

// Resolve a content class (kids|adults) to a person of that class — the bridge
// for the companion's class-level picks until it is person-aware (TASK-158).
// Falls back to the first person so a pick always lands somewhere.
export function personByProfile(config, cls) {
  return config.persons.filter(function(p) { return p.profile === cls; }).concat(config.persons)[0] || null;
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
