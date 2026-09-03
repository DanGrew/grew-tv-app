// TASK-568 — Night Mode: the three levels a viewer cycles at playback, held
// here as DATA. Soft's numbers are the sample the owner heard (threshold -24 dB,
// ratio 3:1, attack 20 ms, release 400 ms, +6 dB makeup), which took Resident
// Evil's 22.6 LU loudness range down to 16.3 LU; Strong pushes harder, aiming at
// the 8-10 LU the spec names.
//
// ⛔ NEITHER IS TUNED. The trial tunes them, and a retune is an edit to this
// table — never a code change, never a re-encode. What pushing hard costs is
// written down in the spec (pumping on music-heavy titles, hiss lifted on older
// films, jump scares softened); Off exists so none of it is forced on anyone.
//
// Off carries no compressor settings at all, deliberately: it is a bypass the
// graph routes around, not a compressor configured to do nothing, so the viewer
// hears exactly the pre-TASK-568 signal with none of the ~6 ms lookahead.
export var NIGHT_OFF = 'off';

export var NIGHT_LEVELS = [
  { id: 'off', label: 'Off' },
  { id: 'soft', label: 'Soft', threshold: -24, knee: 6, ratio: 3, attack: 0.02, release: 0.4, makeupDb: 6 },
  { id: 'strong', label: 'Strong', threshold: -32, knee: 6, ratio: 8, attack: 0.01, release: 0.25, makeupDb: 10 }
];

function levelIds() {
  return NIGHT_LEVELS.map(function(l) { return l.id; });
}

// An id this module doesn't know resolves to Off — the level a fresh player page
// starts at, so a snapshot from a surface that has never heard of Night Mode
// (an older companion, a reconnect replay) reads as Off rather than blank.
export function nightPreset(id) {
  return NIGHT_LEVELS.filter(function(l) { return l.id === id; }).concat([NIGHT_LEVELS[0]])[0];
}

// One press advances Off -> Soft -> Strong -> Off. Normalised through
// nightPreset first, so an unknown id behaves as Off does: one press gives Soft.
export function nextLevel(id) {
  var ids = levelIds();
  return ids[(ids.indexOf(nightPreset(id).id) + 1) % ids.length];
}

// The ONE wording both surfaces render — the TV pill and the phone's own button
// read the same string, so the mirror cannot drift into two labels.
export function nightLabel(id) {
  return 'Night: ' + nightPreset(id).label;
}

export function isNightOn(id) {
  return nightPreset(id).id !== NIGHT_OFF;
}

// Makeup is specified in dB (how the owner heard it and how a retune will be
// described); a GainNode wants linear amplitude. Off has no makeup, so unity.
export function makeupGain(id) {
  var preset = nightPreset(id);
  if (preset.makeupDb === undefined) return 1;
  return Math.pow(10, preset.makeupDb / 20);
}
