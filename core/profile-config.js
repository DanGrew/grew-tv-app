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
// config shape: { defaultPin: "0000", persons: [ { id, name, profile, photo, pin? } ] }
// A person's effective PIN = its own `pin` or the top-level `defaultPin`.

export var PIN_LEN = 4;
export var DEFAULT_PIN = '0000';

// Built-in Guest person (FEAT-034). An always-present kids-class person for
// visitors: it sees kids content only (its `profile` drives the same browse
// filter as any kid) and is never locked, so it needs no PIN. Synthesised here
// so every install has a Guest card without editing config.json. A config.json
// person with id 'guest' overrides its name/photo/emoji (but never its class —
// Guest is always kids, always open). The emoji is the FEAT-033 card glyph;
// it's inert data until that lands, harmless before.
export var GUEST_ID = 'guest';
var GUEST_EMOJI = '👋';

function guestPerson() {
  return { id: GUEST_ID, name: 'Guest', profile: 'kids', photo: null, pin: null, emoji: GUEST_EMOJI };
}

// A Guest authored in config.json may override name/photo/emoji; its class is
// forced to kids and its pin to null so Guest can never become PIN-gated.
function mergeGuest(authored) {
  var base = guestPerson();
  return {
    id: GUEST_ID,
    name: authored && authored.name != null ? authored.name : base.name,
    profile: 'kids',
    photo: authored && authored.photo != null ? authored.photo : base.photo,
    pin: null,
    emoji: authored && authored.emoji != null ? authored.emoji : base.emoji
  };
}

// Guarantee exactly one Guest, always last so the family's own persons stay
// first (and keep initial picker focus). An authored guest is folded in via
// mergeGuest; otherwise the built-in is appended.
function withGuest(persons) {
  var authored = persons.filter(function(p) { return p.id === GUEST_ID; })[0] || null;
  var rest = persons.filter(function(p) { return p.id !== GUEST_ID; });
  return rest.concat([mergeGuest(authored)]);
}

// The built-in Guest, identified by its stable id (TASK-196 hangs the
// no-progress guard off this predicate).
export function isGuest(person) {
  return !!person && person.id === GUEST_ID;
}

// Generic placeholders only — one adult + one kid. NO real names or PINs here.
function defaultPersons() {
  return [
    { id: 'child',   name: 'Child',   profile: 'kids',   photo: null, pin: null },
    { id: 'grownup', name: 'Grown-up', profile: 'adults', photo: null, pin: null }
  ];
}

export function defaultConfig() {
  return { defaultPin: DEFAULT_PIN, persons: withGuest(defaultPersons()) };
}

function normalizePerson(raw) {
  return {
    id: raw.id,
    name: raw.name != null ? raw.name : raw.id,
    profile: raw.profile === 'adults' ? 'adults' : 'kids',
    photo: raw.photo != null ? raw.photo : null,
    pin: typeof raw.pin === 'string' && raw.pin.length ? raw.pin : null
  };
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
  return { defaultPin: dpin, persons: withGuest(persons) };
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
