// The Guide (FEAT-560/TASK-590) — the page that reads the rest of the
// programme. grew-tv writes six months of schedule down; the Channels strip
// shows one line of it per channel, and this is where the other two days live:
// every channel the profile can see on one page, what each is playing right now
// on a single line across the top, and the rest of today and tomorrow listed
// underneath.
//
// Fed by TWO reads, and deliberately so:
//   * GET /api/channels?profile=       — the on-now line per channel, which is
//     already the card the strip draws. The now band is `channelCardView`
//     itself, ticking bar and all, so the Guide and the strip cannot disagree
//     about what is on.
//   * GET /api/channels/{id}/schedule?profile=  — the clock-bounded listing
//     (TASK-589): every programme STARTING in the span, plus the off-air
//     stretches it crosses, in one ordered listing of
//     `{kind:'programme', item, tag, starts_at, ends_at}` and
//     `{kind:'off_air', starts_at, next_on_air}` rows.
//
// ⛔ NOT PAGED. PAGINATION.md's `offset`/`limit` envelope is for catalog lists,
// where the unit is a row and the count is unbounded. The Guide's unit is a DAY
// and its read is bounded by the clock — the backend caps the span at two days
// (`MAX_WINDOW_DAYS`) and shortens the SPAN, never the list, if it runs long. So
// there is no envelope to read here and no page to ask for; asking for a wider
// stretch of clock is the only thing a caller can do, and it is refused by
// clamping rather than by a 400.
//
// ⛔ THE READ ONLY EVER LOOKS FORWARD. `from` is clamped to now on the way in
// and the programme is popped as it airs, so what has already aired is not there
// to ask for — which is also what the page is for (owner, 2026-09-06: "what has
// already aired is not what the page is for"). Today's column therefore starts
// at now, and today's opening hour is not a fact this app can know.

import { clockLabel, leadTitle, episodeSlot } from './channels.js';
import { pad } from './time.js';

// The two row kinds `db/channel_schedule.py` writes, spelt the way it spells
// them. A row is one or the other, so the listing is walked on the off-air one
// and everything else is a programme.
var PROGRAMME = 'programme';
var OFF_AIR = 'off_air';

// One separator, the same one the channel card composes its facts with.
var DOT = ' · ';

// ---------------------------------------------------------------------------
// THE ENTRY POINT IS NOT A TILE (owner, 2026-09-08). It was one — an action tile
// on the end of the Channels strip, the playAllTile precedent — and that was
// wrong twice over. A strip of channels is a strip of THINGS THAT ARE ON, and a
// tile among them that is not a channel reads as one until you press it. It also
// put the Guide behind a tab: you had to be on Channels to reach the page that
// tells you what is on every channel.
//
// So the Guide is a CONTROL on each surface's own furniture, not an item in a
// list: a floating button in the TV's bottom-right cluster (browse.html, beside
// Search and the play menu), and a row in the phone's ☰ menu. Nothing here
// synthesises a card, so there is no `kind` in CARD_ROUTES and nothing for
// no-missing-card-route to enforce — the two callers name `guide.html`
// themselves, the same way Search names its own panel.
//
// ---------------------------------------------------------------------------
// Days.
//
// A day key is 'YYYY-MM-DD', read off a stamp by MATCHING it — never by
// `new Date(stamp)`. The backend stamps no zone on purpose (grammar call 3): a
// published programme promises 15:30 means 15:30, and parsing one to a Date and
// formatting it back is the one way to turn that promise into an hour's drift.
// core/channels.js `clockLabel` is that same rule for the time half, and this is
// its date half — the two are the only readers of a wall-clock stamp in the app.
var DATE = /^(\d\d\d\d)-(\d\d)-(\d\d)/;

export function dayKey(stamp) {
  var at = DATE.exec(String(stamp));
  return at ? at[0] : null;
}

// Calendar arithmetic — the one place a Date is constructed at all, and it is
// built from THREE NUMBERS rather than from the stamp. `new Date('2026-09-06')`
// reads as UTC midnight while `new Date('2026-09-06T00:00')` reads as local, and
// the gap between those two is an off-by-one day at either end of a timezone.
// Date.UTC with explicit parts has no zone in it to get wrong: the wall-clock
// date goes in, the same wall-clock date comes out, and only the day-of-week and
// the +1 day are ever asked of it.
var DAY_MS = 24 * 60 * 60 * 1000;

function utcOf(key) {
  var at = DATE.exec(String(key));
  if (!at) return null;
  return Date.UTC(Number(at[1]), Number(at[2]) - 1, Number(at[3]));
}

function keyOf(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

// The day after this one. Month ends, year ends and leap days come out of the
// millisecond arithmetic rather than a table of month lengths.
export function nextDay(key) {
  var at = utcOf(key);
  if (at === null) return null;
  return keyOf(at + DAY_MS);
}

var WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'Monday' — the word a tail line uses to say a channel is back on a later day.
export function weekday(key) {
  var at = utcOf(key);
  if (at === null) return '';
  return WEEKDAY[new Date(at).getUTCDay()];
}

// 'Sun 6 Sep'. The day of the month is un-padded, because it is prose rather
// than a column of figures.
export function dayLabel(key) {
  var at = DATE.exec(String(key));
  if (!at) return '';
  return WEEKDAY_SHORT[new Date(utcOf(key)).getUTCDay()] + ' ' +
    Number(at[3]) + ' ' + MONTH_SHORT[Number(at[2]) - 1];
}

// The two day tabs, and nothing beyond them. The programme runs six months and
// the Guide shows two days of it (owner, 2026-09-06) — a fortnight of home telly
// is not something anyone plans.
export function dayTabs(todayKey) {
  var tomorrowKey = nextDay(todayKey);
  return [
    { key: todayKey, label: 'Today' + DOT + dayLabel(todayKey), today: true },
    { key: tomorrowKey, label: 'Tomorrow' + DOT + dayLabel(tomorrowKey), today: false }
  ];
}

// The line across the top of the page. TODAY it is the clock, and it is what
// makes the band underneath answerable at a glance — three things are on, which
// do I sit down for.
//
// The moment comes from the SERVER's own `from` (the span it settled on),
// never from this device's clock: the schedule is written in the Mini's wall
// clock and the browser drawing it may be a minute off, which would put the now
// line and the programme it points at out of step.
export function nowLabel(fromStamp) {
  var at = clockLabel(fromStamp);
  return at ? 'NOW' + DOT + at : 'NOW';
}

// TOMORROW the same line goes QUIET and names the day instead — the page keeps
// its four bands rather than becoming a second layout, and nothing on a future
// day is happening "now".
export function quietLabel(key) {
  return (weekday(key) + ' ' + dayLabel(key).slice(4)).trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// What a programme row says.

// An item's runtime, in the words a listing uses: '22m' under the hour, '1h 47m'
// over it. Minutes are padded past the hour ('2h 07m') because that half is then
// a figure being read against the one above it, and floored for the same reason
// core/channels.js floors a position — an item is over when its stated minutes
// are up, not a rounding later.
export function runtimeLabel(seconds) {
  var total = Math.floor(Number(seconds) / 60);
  if (!(total > 0)) return '';
  var hours = Math.floor(total / 60);
  if (hours === 0) return total + 'm';
  return hours + 'h ' + pad(total % 60) + 'm';
}

// What KIND of thing a row is, when it has no show to name instead. Singular
// here (the row is one programme) and plural in the column head (the channel is
// a run of them), which is why the two tables are separate rather than one with
// an 's' stuck on: "Music videos" is not "Music video" + s and neither is
// "Music".
var TYPE_LABEL = {
  film: 'Film', episode: 'Episode', track: 'Track',
  'music-video': 'Music video', 'home-movie': 'Home movie'
};
var TYPE_LABEL_PLURAL = {
  film: 'Films', episode: 'Episodes', track: 'Music',
  'music-video': 'Music videos', 'home-movie': 'Home movies'
};

// An unknown type draws its own raw word rather than a guess or a blank: the
// backend owns the vocabulary, and a type this table has not been taught about
// is still a fact worth putting on screen.
function labelled(table, type) {
  return table[type] || String(type || '');
}

// A row's second line. An EPISODE leads with its show on the line above
// (leadTitle) and puts the episode here beside the runtime — "Blood · S2 E4 ·
// 22m", exactly the shape the channel card's own sub-line takes. Everything with
// no show says what it is instead — "Film · 1h 47m" — because a film's title has
// already said everything its own name can.
//
// Both halves are optional and independently so: an item the catalog no longer
// knows has neither, and draws a bare title rather than a line of separators.
function rowSub(item) {
  var lead = episodeSlot(item) || labelled(TYPE_LABEL, (item || {}).itemType);
  return [lead, runtimeLabel((item || {}).duration)].filter(Boolean).join(DOT);
}

// One programme, as the Guide draws it: the clock time it starts, the
// recognisable half of what it is, and the detail under that.
export function guideRow(entry) {
  return {
    kind: PROGRAMME,
    time: clockLabel(entry.starts_at),
    title: leadTitle(entry.item),
    sub: rowSub(entry.item)
  };
}

// ---------------------------------------------------------------------------
// Runs — the shape a day is actually made of.
//
// A channel's listing is a sequence of programmes broken by off-air stretches,
// and a RUN is one unbroken stretch of programmes. It matters because a run does
// not respect midnight: a 20:00-02:00 slot belongs to the date it STARTS on
// (TASK-581), so Monday's column has to carry the film that started at 00:24 and
// finishes at 02:51 rather than filing it under Tuesday, where nobody would look
// for it.
//
// So a run is filed under the day its FIRST programme starts, and a day column
// is the runs filed under it. Midnight is not a boundary the Guide draws.
export function guideRuns(entries) {
  var runs = [];
  var open = null;
  (entries || []).forEach(function(row) {
    if (row.kind === OFF_AIR) {
      // The stretch AFTER a run says when the channel is back, which is the one
      // fact the run itself cannot carry — its own last programme only knows
      // when it stops. A leading off-air row closes nothing: the run in front of
      // it belongs to a stretch of clock nobody asked for.
      if (open) open.backAt = row.next_on_air;
      open = null;
      return;
    }
    if (!open) {
      open = { entries: [], startsAt: row.starts_at, endsAt: null, backAt: null };
      runs.push(open);
    }
    open.entries.push(row);
    open.endsAt = row.ends_at;
  });
  return runs;
}

// The gap BETWEEN two runs of the same day — a channel off air over lunch and
// back for the afternoon. Drawn as a row, like every other off-air fact on this
// page: a gap a parent points at earns a line rather than an empty space.
function gapRow(before, after) {
  return {
    kind: OFF_AIR,
    time: clockLabel(before.endsAt),
    title: 'Off air until ' + clockLabel(after.startsAt),
    sub: ''
  };
}

// ---------------------------------------------------------------------------
// A column.

// The channel's hours for this day, as the listing can actually know them.
//
// ⚠️ These are the hours it is PROGRAMMED, not the hours it declares. The
// declared slot times are not on the wire, and today's opening hour is not
// merely absent but unknowable: the programme is popped as it airs, so a channel
// that came on at 09:00 has no 09:00 left to report by 21:07. What the page can
// say honestly is where the run it is showing ends — "on air until 00:14" for a
// channel already running, and both ends of it for a day that has not started.
function hoursLabel(runs, alreadyOn) {
  if (runs.length === 0) return 'Off air';
  var last = runs[runs.length - 1];
  if (alreadyOn) return 'On air until ' + clockLabel(last.endsAt);
  return 'On air ' + clockLabel(runs[0].startsAt) + '–' + clockLabel(last.endsAt);
}

// The column head: the channel's name, and what it is showing today.
export function guideHead(schedule, column) {
  return {
    name: (schedule || {}).name || '',
    meta: [labelled(TYPE_LABEL_PLURAL, (schedule || {}).item_type), column.hours]
      .filter(Boolean).join(DOT)
  };
}

// How many programmes a column lists before it says "and N more". A sitcom
// channel airing 22-minute episodes writes eleven of them into an evening a
// films channel spends on two, so a column that listed everything would run off
// the bottom of a 1080p screen while the one beside it sat half empty — and a
// Guide that has to be scrolled to answer "what's on tonight" is not answering
// it. Six is what fits under the now band at TV type sizes; the rest is a
// counted line, and the tail still names when the channel stops.
//
// The same six on the phone, deliberately: the phone scrolls and could show
// them all, but story 8 is that the phone shows WHAT THE TV SHOWS, and a parent
// comparing the two should not find a programme on one and not the other.
export var GUIDE_MAX_ROWS = 6;

// "+ 3 more to 00:14" — the count, and the hour the channel runs to, so the line
// says what is behind it rather than just that something is. Empty when nothing
// was cut, so the column loses the line rather than drawing "+ 0 more".
//
// A column with rows to hide always has a tail (both come from the same runs),
// so the stop time is read straight off it rather than guarded for a case this
// module cannot produce.
export function guideMoreLine(column) {
  if (!column.hidden) return '';
  return '+ ' + column.hidden + ' more to ' + clockLabel(column.tail.stopAt);
}

// One channel's day: the head's hours, the lead, the rows under it and the tail.
//
// `lead` and `rows` split the same way the page's third and fourth bands do.
// TODAY the lead is null, because the ON NOW card IS the lead and it comes from
// the strip — the listing deliberately does not carry the programme already
// playing (it is walked over as belonging to the read before this one), so
// there is nothing here to draw it with and nothing that could contradict the
// card. TOMORROW nothing is playing, so the first programme of the day stands
// where the card would be (story 6) and the rest of the day lists under it. Same
// four bands either way; only what fills the third one changes.
export function guideColumn(schedule, key, isToday) {
  var entries = (schedule || {}).entries || [];
  // The channel was ALREADY ON when the listing opened. `_walk` (backend) omits
  // the leading off-air stretch only when there is no gap to report, so a
  // listing that opens on a programme is a listing whose channel was mid-run —
  // which is exactly when its opening hour is unknowable.
  var alreadyOn = isToday && entries.length > 0 && entries[0].kind === PROGRAMME;
  var runs = guideRuns(entries).filter(function(run) { return dayKey(run.startsAt) === key; });
  var rows = [];
  runs.forEach(function(run, i) {
    if (i > 0) rows.push(gapRow(runs[i - 1], run));
    run.entries.forEach(function(entry) { rows.push(guideRow(entry)); });
  });
  var last = runs[runs.length - 1];
  var listed = isToday ? rows : rows.slice(1);
  return {
    hours: hoursLabel(runs, alreadyOn),
    lead: isToday ? null : (rows[0] || null),
    rows: listed.slice(0, GUIDE_MAX_ROWS),
    hidden: Math.max(0, listed.length - GUIDE_MAX_ROWS),
    // The tail is the day's real STOP, which is the last run's own end — never
    // the slot's declared end. An item pulled inside a slot runs past it
    // (decision 7), so a channel whose last film starts at 23:42 is on until
    // 02:07 and saying otherwise would put a viewer in front of a channel the
    // page had already written off.
    //
    // It carries the COLUMN's day, because that is what the return time has to
    // be read against: a Sunday run stopping at 02:07 stops on Monday, so
    // comparing the return with the STOP's day would call a Monday evening "the
    // same day" and drop the word the line exists for.
    tail: last ? { stopAt: last.endsAt, backAt: last.backAt, day: key } : null
  };
}

// The tail line: when the channel stops, and when it is next on.
//
// The return names its DAY whenever it falls outside the column's own — "back
// Monday 20:00" — because by the time a channel has stopped for the night, the
// hour alone answers the wrong question. It is measured against the COLUMN's
// day rather than the stop's: a Sunday evening that runs to 02:07 stops on
// Monday, and comparing the two stamps would quietly turn "back Monday" into
// "back at".
//
// "at" is the rarer half, and it is the edge of the read rather than a mid-day
// gap — a gap that closes inside the day is a row, because the run after it
// belongs to the same column.
//
// A channel with nothing written after it says only when it stops: the programme
// runs out six months ahead, and inventing a return for it would be the one
// thing on this page that is not read off the schedule.
export function guideTailLine(tail) {
  if (!tail) return '';
  var stop = 'Off air from ' + clockLabel(tail.stopAt);
  var back = clockLabel(tail.backAt);
  if (!back) return stop;
  var sameDay = dayKey(tail.backAt) === tail.day;
  return stop + DOT + 'back ' + (sameDay ? 'at ' : weekday(dayKey(tail.backAt)) + ' ') + back;
}

// ---------------------------------------------------------------------------
// The page.

// Which channels the Guide draws, and in which order, is the STRIP's own answer
// and is deliberately not re-derived here: a channel the profile may not see
// never reaches the strip in the first place (TASK-569/571), and the backend
// owns channel order. So "every channel the profile can see" needs no filter in
// this module at all.
//
// Today, according to the SERVER. Every schedule answer carries the `from` it
// settled on, so the page's idea of what day it is comes back with the data
// rather than off the browser's own clock — a TV whose clock has drifted still
// draws the day the programme was read for.
export function todayKey(schedules) {
  return (schedules || []).map(function(s) { return dayKey((s || {}).from); })
    .filter(Boolean)[0] || null;
}
