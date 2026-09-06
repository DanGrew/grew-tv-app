// The card in the gap (FEAT-560/TASK-565) — what the screen says between one
// item and the next, and what it says when the channel is off air. One model,
// because decision 8 makes them ONE component with two callers: the between-
// items card names what is coming, the holding card names when the channel is
// back, and they are the same shape with the same furniture.
//
// Built entirely from the schedule the player already holds. Nothing here is
// authored, so nothing can go stale — decision 12's whole point, and the reason
// hand-made idents were dropped rather than parked.
//
// Fed by the answer core/channel-player.js documents: the on-now line plus
// `next`, each entry { item, tag, starts_at, ends_at }.

import { itemTitle, clockLabel, returnTimeLabel, tickedOffset } from './channels.js';

// The FLOOR under the hold, never the whole of it (TASK-574 — see holdSeconds
// below). Decision 12 says five to ten seconds; eight sits in the middle, long
// enough to read three lines at TV distance and short enough that the next
// programme has barely started behind it.
export var CARD_SECONDS = 8;

// How long the card holds the screen: until the next programme actually starts,
// and never less than CARD_SECONDS.
//
// ⚠️ THE FLOOR AND THE SCHEDULE ARE ONE RULE, not two competing timers — they
// answer two different situations and each is the whole of its own:
//
//   the item ends ON SCHEDULE — the channel has already rolled on, the next
//     programme is airing behind the card, and there is nothing to wait for.
//     `left` is zero and the floor is the entire hold. The player rejoins eight
//     seconds into a programme already running, which is what a continuity
//     announcement is; a card that held the schedule here would make the channel
//     a queue that waits.
//   the item ends EARLY — the viewer skipped, or the file is shorter than the
//     slot it was given, so the CHANNEL IS STILL AIRING IT. `left` is the real
//     seconds of that slot remaining, and the card sits there for them. Without
//     this the card cleared after eight seconds and the rejoin asked what was on
//     now — which was still the item that just ended, so the viewer was dropped
//     back into the middle of it (TASK-574 story 1).
//
// Read off the channel's OWN clock — the entry's airtime against `tickedOffset`,
// the same reading the live marker is placed by — rather than by parsing
// `next[0].starts_at`. The backend stamps no zone on purpose (channels.js
// RETURN_AT), so a `new Date` here is how the promise of 17:08 quietly becomes an
// hour's drift; and the clock needs no field the player is not already holding.
//
// One guard, not three, the way channelPercent has one. `tickedOffset` clamps at
// the runtime, so `left` can never come back negative, and every answer that is
// not a slot still running lands on the floor without a guard of its own:
//
//   off air        — runtime and offset are BOTH null (they only ever arrive
//                    together), so the subtraction is `0 - null`, which is 0
//   no answer yet  — an empty detail subtracts to NaN, which `|| 0` reads as
//                    nothing to wait for
//
// There is deliberately no guard for an offset missing while a runtime is
// present: the endpoint never sends one without the other — an on-air answer
// carries both and an off-air answer nulls both — so it would be a branch
// nothing could reach and nothing could test.
export function holdSeconds(detail, elapsedSeconds) {
  var line = detail || {};
  var left = Number(line.runtime_seconds) - tickedOffset(line, elapsedSeconds);
  return Math.max(CARD_SECONDS, left || 0);
}

// Three lines with clock times, then an untimed list (decision 12).
//
// ⚠️ THE ASYMMETRY IS THE DESIGN, not a formatting detail. A time invites you to
// wait for something; an untimed list only says come back later. Giving the
// later list times, or taking the times off the three, are both the same mistake
// in opposite directions.
//
// Three rather than four: four lines was a desktop assumption and is too many at
// TV viewing distance.
export var TIMED_LINES = 3;
// The untimed list is shorter than the timed one on purpose — it is a glance,
// not a listing, and a card that grows down the screen stops being readable in
// eight seconds.
export var LATER_LINES = 4;

// How many entries the player asks the endpoint for. Both lists come out of one
// answer, so this is the only number the request has to know — and it stays
// under api/channels.py's MAX_LOOKAHEAD of 10, which is what stops a "lookahead"
// becoming a way to ask for the pool.
export var CARD_LOOKAHEAD = TIMED_LINES + LATER_LINES;

// The lookahead the answer actually carries. Everything below reads the
// schedule through here, so an absent list and a list with a hole in it are
// dealt with ONCE rather than guarded at every use.
//
// No answer at all is dropped rather than defaulted to an empty one: the
// absence leaves at the first filter, so nothing downstream needs a stand-in
// list to ask questions of. A default the code can never be caught using is a
// branch no test can reach.
function entries(detail) {
  return [detail]
    .filter(Boolean)
    .flatMap(function(line) { return line.next; })
    .filter(Boolean);
}

// One entry as a timed line. Null when it carries no clock — an entry that
// cannot say WHEN has no business in the timed half, and falls through to the
// untimed list below instead of drawing a line with a blank time column.
//
// Only ever called on an `entries()` result, so the entry itself is real.
function timedLine(entry) {
  var at = clockLabel(entry.starts_at);
  if (!at) return null;
  return { time: at, title: itemTitle(entry.item) };
}

// The entries the timed half takes — the first three that can say WHEN.
function timedEntries(detail) {
  return entries(detail).filter(function(entry) { return timedLine(entry); }).slice(0, TIMED_LINES);
}

// The three timed lines. Only entries that carry a clock are eligible, so a
// malformed stamp shortens the card rather than blanking a row in it.
export function timedLines(detail) {
  return timedEntries(detail).map(timedLine);
}

// The untimed "later" list — names only, no clock, capped.
//
// It is everything the timed half did NOT take, in order: an entry skipped for
// want of a clock is still something that is on later, and an entry already
// drawn with a time must not appear again underneath itself. Partitioning is
// what gets both right — counting off the front of the list gets both wrong the
// moment one entry is skipped.
export function laterTitles(detail) {
  var shown = timedEntries(detail);
  return entries(detail)
    .filter(function(entry) { return shown.indexOf(entry) < 0; })
    .map(function(entry) { return itemTitle(entry.item); })
    .filter(Boolean)
    .slice(0, LATER_LINES);
}

// The untimed list as one line. A middot rather than a comma or a line each: at
// TV distance a run of names reads as one glance, which is what an untimed list
// is for, and stacking them would make the later half as tall as the timed half
// it is deliberately quieter than.
export var LATER_SEPARATOR = ' · ';

export function laterText(titles) {
  return (titles || []).join(LATER_SEPARATOR);
}

// What the card is FOR, in the caller's words rather than the wire's: the gap
// between two items, or a channel with nothing on. `next` and `offAir` are the
// only two — there is deliberately no third for a programme that has run out,
// because the backend answers that identically to every other off-air state.
export var NEXT_CARD = 'next';
export var OFF_AIR_CARD = 'off-air';

export function cardKind(detail) {
  return (detail || {}).on_air ? NEXT_CARD : OFF_AIR_CARD;
}

// The eyebrow above the lines. Names the channel in both states, because the
// corner ident is small and a card that fills the screen should say what channel
// you are looking at without making you find the pill.
function cardLabel(detail) {
  var line = detail || {};
  // One filter, after both candidates are on the list — filtering the name on
  // its own first as well changes nothing, because whichever of the two is the
  // first truthy value is the same either way.
  return [line.name].concat([line.channel_id]).filter(Boolean).concat([''])[0];
}

var OFF_AIR = 'Off air';

// The whole card, resolved for render. One object covering both states — the
// screen draws what is present and hides what is not, so neither caller needs a
// branch of its own.
//
//   between items — label, three timed lines, an untimed later list
//   off air       — label, the words Off air, and a return time WHEN THERE IS ONE
//
// The return time comes from the answer, never from the slot config (owner,
// 2026-09-03): a slot whose tag pool was empty at generation airs nothing, so
// the config would promise a return the channel never makes. No time to name is
// a card that names none — the same card, one line shorter.
export function cardView(detail) {
  var kind = cardKind(detail);
  return {
    kind: kind,
    label: cardLabel(detail),
    headline: kind === OFF_AIR_CARD ? OFF_AIR : null,
    returnAt: kind === OFF_AIR_CARD ? returnTimeLabel((detail || {}).next_on_air) : null,
    timed: kind === NEXT_CARD ? timedLines(detail) : [],
    later: kind === NEXT_CARD ? laterTitles(detail) : []
  };
}

// What the PHONE is told while the card is up (the FEAT-017/028 mirror). The TV
// is showing a card rather than a programme, so the phone's now-playing line
// would otherwise sit on the title of the item that just finished — the one
// thing on screen that has stopped being true.
//
// Two fields rather than the whole card, because the phone's header already has
// two: a label saying what is going on and a line saying what it is. The phone
// is a remote, not a second screen for the listing, and its own crumb already
// names the channel — so the timed list, the later list and the credit stay on
// the television.
export var BETWEEN = 'Between programmes';

export function cardStatus(detail) {
  var view = cardView(detail);
  var next = view.timed[0];
  return {
    label: [view.headline].filter(Boolean).concat([BETWEEN])[0],
    line: [view.returnAt].filter(Boolean)
      .concat([next].filter(Boolean)
        .map(function(line) { return 'Next: ' + line.title + ' at ' + line.time; }))
      .concat([''])[0]
  };
}
