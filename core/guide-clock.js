import { clockLabel } from './channels.js';
import { pad } from './time.js';

// TASK-604 (FEAT-560) — the Guide's moved clock: the ±1hr pair, what the page
// then asks the server for, and how the page says it is not looking at now.
//
// THE POINT: a line-up can be looked at at 20:00 without waiting until 20:00 to
// find out what it does. The clock moves; nothing else about the Guide changes.
//
// ⛔ DEV ONLY, and the server decides. The control is drawn only when
// /api/config says `devClock` — off on the Mini, where a moved clock would be a
// way to make the strip say something is on when it is not. This module never
// asks; it is handed the answer.
//
// ⛔ A MOMENT IS A WALL-CLOCK STRING, never a Date. Same rule as
// core/guide.js's day keys and core/channels.js's clockLabel: the backend stamps
// no zone on purpose (grammar call 3), so a stamp is read by MATCHING it and the
// arithmetic is done on explicit parts. Parsing '2026-09-12T20:00:00' into a
// Date and formatting it back is the one way to turn "20:00 means 20:00" into an
// hour's drift — and this module's whole job is hour arithmetic.
var STAMP = /^(\d\d\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?/;
var HOUR_MS = 60 * 60 * 1000;
var DOT = ' · ';

// One press, one hour. Discrete steps rather than a drag (owner, 2026-09-12): a
// drag fires a read per pixel across three endpoints, and it cannot be aimed at
// a TV size. Relative, not snapped — 15:23 gives 16:23, because "first press
// rounds, later presses don't" is a branch and the screens that would carry it
// are capped at cyclomatic 1.
export var STEP_HOURS = 1;

function utcOf(stamp) {
  var at = STAMP.exec(String(stamp));
  if (!at) return null;
  // Date.UTC with explicit parts has no zone in it to get wrong: the wall clock
  // goes in, the same wall clock comes out. Seconds are optional in a stamp and
  // absent reads as :00, which is what the backend's own `_at` writes.
  return Date.UTC(Number(at[1]), Number(at[2]) - 1, Number(at[3]),
                  Number(at[4]), Number(at[5]), Number(at[6] || 0));
}

function stampOf(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' +
    pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' +
    pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
}

// The moment a step lands on, as `at=` carries it. `from` is where the page is
// reading now — the moved moment if it has one, else the server's own `from`,
// which is the only clock this app trusts (the browser's may be a minute off).
//
// Uncapped in both directions (owner, 2026-09-12). The bounds are already in
// the data: a programme has a start and an `until`, months apart, and stepping
// outside that reads as off air, which is how leaving what was generated
// announces itself. Nothing here has to know when that is.
//
// Month ends, year ends and leap days come out of the millisecond arithmetic.
// DST does not, deliberately: a channel programme is not DST-modelled either
// (grammar call 3), so an hour step is always 3600 wall-clock seconds.
export function stepped(from, hours) {
  var at = utcOf(from);
  if (at === null) return null;
  return stampOf(at + hours * HOUR_MS);
}

// What the band across the top says. Three states, because a moved clock must
// not be able to claim it is now: 'live' is the clock, 'moved' names the moment
// being inspected instead, and 'quiet' is a future day, where nothing is on.
export function bandState(isToday, movedAt) {
  if (movedAt) return 'moved';
  return isToday ? 'live' : 'quiet';
}

// 'AT · 20:00' — deliberately not the word NOW. The server answers a moved
// question as though the moment were the present, so the page is the only place
// left that can tell the truth about which moment it is showing.
export function movedLabel(movedAt) {
  var at = clockLabel(movedAt);
  return at ? 'AT' + DOT + at : 'AT';
}

// Whether the cards tick. They do not while the clock is moved: the bar
// advances on real seconds elapsed since the fetch, so a moment parked at 20:00
// would creep away from 20:00 on its own — a moving answer to a question about
// a fixed moment, which reads as a bug. A press sets a moment and it stays.
export function ticking(isToday, movedAt) {
  return isToday && !movedAt;
}

// How far into the item on air to draw the bar. Zero while the clock is moved,
// for the same reason: the server already answered for the moment asked about,
// so the position it gave IS the position, with no elapsing to add to it.
export function elapsedSeconds(stripAt, nowMs, movedAt) {
  if (movedAt) return 0;
  return (nowMs - stripAt) / 1000;
}
