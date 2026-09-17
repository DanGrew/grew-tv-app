// TASK-633 (FEAT-526) — what every couch-remote button does on each TV surface,
// held as DATA, for the Info help card. One row per surface, one entry per
// button that does something there; a button a row leaves out does nothing on
// that surface, and the card says so rather than dropping the line (story 3).
//
// ⛔ THIS TABLE IS THE SOURCE OF THE WORDS. A task that changes what a button
// does edits its row here in the same PR, or the card starts telling lies — the
// standing maintenance cost the owner accepted (one row per behaviour change).
// `KEYMAP.md` points here rather than keeping a second copy.
//
// Written against the blessed specs of TASK-594 and TASK-599–602, which were
// building alongside this one (owner, 2026-09-17): Home on Browse, Stop, ☰ and
// the − + rocker say what those rows ship, not what main did before them.
//
// Back is left off on purpose: it sends nothing, and is dead by ruling.

export var HELP_NOTHING = 'Does nothing here';

// Card order, top to bottom. `info` is the one button whose job is the same on
// every surface, so its words live here rather than in sixteen rows.
export var HELP_BUTTONS = [
  { id: 'updown',    glyph: '▲▼', name: 'Up / Down' },
  { id: 'leftright', glyph: '◀▶', name: 'Left / Right' },
  { id: 'ok',        glyph: '●',  name: 'OK' },
  { id: 'home',      glyph: '⌂',  name: 'Home' },
  { id: 'playpause', glyph: '⏯',  name: 'Play / Pause' },
  { id: 'stop',      glyph: '⏹',  name: 'Stop' },
  { id: 'context',   glyph: '☰',  name: 'Context' },
  { id: 'minus',     glyph: '−',  name: 'Volume down' },
  { id: 'plus',      glyph: '+',  name: 'Volume up' },
  { id: 'info',      glyph: 'i',  name: 'Info', words: 'Show or close this card' }
];

var PLAYER_MOVE = {
  updown: 'Move between the player controls',
  leftright: 'Skip back / forward 10 seconds',
  ok: 'Press the focused control',
  playpause: 'Play or pause',
  stop: 'Stop, and go back to where it started'
};

function withMove(jobs) {
  return Object.assign({}, PLAYER_MOVE, jobs);
}

export var HELP_TABLE = {
  browse: { title: 'Browse', jobs: {
    updown: 'Move between rails',
    leftright: 'Move along a rail',
    ok: 'Open or play what is focused',
    home: 'Back to the section list',
    context: 'Add the focused film or music video to its Queue'
  } },
  search: { title: 'Search', jobs: {
    updown: 'Move between the keys and the results',
    leftright: 'Move along a row of keys',
    ok: 'Type the letter, or open the result',
    home: 'Close Search'
  } },
  detail: { title: 'Series', jobs: {
    updown: 'Move between episodes',
    leftright: 'Move along a row — Restart, ＋ Queue',
    ok: 'Play the episode, or press what is focused',
    home: 'Back one step',
    context: 'Add the focused episode to the Queue'
  } },
  album: { title: 'Album', jobs: {
    updown: 'Move between tracks',
    leftright: 'Move along a row',
    ok: 'Play the track, or press what is focused',
    home: 'Back one step',
    context: 'Add the focused track to a playlist'
  } },
  artist: { title: 'Artist', jobs: {
    updown: 'Move between tracks',
    leftright: 'Move along a row',
    ok: 'Play the track, or press what is focused',
    home: 'Back one step',
    context: 'Add the focused track to a playlist'
  } },
  'home-movies': { title: 'Home movies', jobs: {
    updown: 'Move between clips',
    leftright: 'Move along a row',
    ok: 'Play the clip',
    home: 'Back one step'
  } },
  'rail-grid': { title: 'Rail', jobs: {
    updown: 'Move between rows of the grid',
    leftright: 'Move along a row',
    ok: 'Open or play what is focused',
    home: 'Back one step',
    context: 'Add the focused film or music video to its Queue'
  } },
  playlist: { title: 'Playlist', jobs: {
    updown: 'Move between tracks',
    leftright: 'Move along a row',
    ok: 'Play the track, or press what is focused',
    home: 'Back one step',
    context: "Press the focused track's ＋, where it has one"
  } },
  'playlist-create': { title: 'New playlist', jobs: {
    updown: 'Move between rows of keys',
    leftright: 'Move along a row of keys',
    ok: 'Type the letter, or press what is focused',
    home: 'Cancel the new playlist'
  } },
  profile: { title: 'Who is watching', jobs: {
    updown: 'Move between rows',
    leftright: 'Move between people',
    ok: 'Choose the person, or press the PIN key',
    home: 'Close the PIN pad or the take-over prompt'
  } },
  guide: { title: 'Guide', jobs: {
    updown: 'Scroll the listings, up to the day tabs',
    leftright: 'Move between channels',
    ok: 'Watch the focused channel',
    home: 'Back one step'
  } },
  video: { title: 'Watching', jobs: withMove({
    home: 'Stop, and go back to where it started',
    context: 'Night Mode — Off, Soft, Strong',
    minus: 'Previous',
    plus: 'Next'
  }) },
  audio: { title: 'Listening', jobs: withMove({
    home: 'Stop, and go back to where it started',
    minus: 'Previous track',
    plus: 'Next track'
  }) },
  channel: { title: 'Channel', jobs: withMove({
    home: 'Stop, and go back to where you tuned in',
    stop: 'Stop, and go back to where you tuned in',
    context: 'Night Mode — Off, Soft, Strong',
    minus: 'Channel down',
    plus: 'Channel up'
  }) },
  queue: { title: 'Queue', jobs: {
    updown: 'Move between rows',
    leftright: 'Move along a row',
    ok: 'Press what is focused',
    home: 'Close the Queue',
    playpause: 'Play or pause',
    stop: 'Stop, and go back to where it started',
    minus: 'Previous',
    plus: 'Next'
  } },
  error: { title: 'Something went wrong', jobs: {
    ok: 'Try again'
  } }
};

export function hasHelp(surface) {
  return Object.prototype.hasOwnProperty.call(HELP_TABLE, surface);
}

// Every button, in card order, with this surface's words — HELP_NOTHING where
// the row is silent. An unknown surface throws: a TV screen naming a row that
// does not exist is a build mistake, never an empty card.
export function helpRows(surface) {
  if (!hasHelp(surface)) throw new Error('button-help: no row for ' + surface);
  var jobs = HELP_TABLE[surface].jobs;
  return HELP_BUTTONS.map(function(b) {
    var words = b.words || jobs[b.id] || HELP_NOTHING;
    return { id: b.id, glyph: b.glyph, name: b.name, words: words, none: words === HELP_NOTHING };
  });
}

// Styled inline, as the TV pages are: the card is dropped into whichever page is
// up, so it carries its own look rather than depending on that page's sheet.
// Nothing smaller than 20px — TV viewing distance.
var ROW_STYLE = 'display:grid;grid-template-columns:72px 190px 1fr;gap:16px;align-items:center;padding:8px 0;font-size:24px;';
var NONE_STYLE = 'color:rgba(255,255,255,0.45);';

function rowHtml(r) {
  var cls = r.none ? 'help-row help-none' : 'help-row';
  var style = r.none ? ROW_STYLE + NONE_STYLE : ROW_STYLE;
  return '<div class="' + cls + '" data-button="' + r.id + '" style="' + style + '">' +
    '<span class="help-glyph" style="font-size:30px;text-align:center;">' + r.glyph + '</span>' +
    '<span class="help-name" style="font-weight:600;">' + r.name + '</span>' +
    '<span class="help-words">' + r.words + '</span></div>';
}

// Reference only (owner, 2026-09-16): nothing in the markup is a control.
export function helpCardHtml(surface) {
  var rows = helpRows(surface);
  return '<div class="help-panel" data-surface="' + surface + '" style="min-width:760px;max-width:1000px;padding:32px 40px;border-radius:16px;border:2.5px solid rgba(255,255,255,0.13);background:rgba(16,22,46,0.96);color:rgba(255,255,255,0.95);font-family:-apple-system,\'Segoe UI\',system-ui,sans-serif;">' +
    '<div class="help-title" style="font-size:36px;font-weight:700;margin-bottom:16px;">Buttons · ' + HELP_TABLE[surface].title + '</div>' +
    rows.map(rowHtml).join('') +
    '<div class="help-foot" style="font-size:22px;margin-top:16px;color:rgba(255,255,255,0.6);">Press i or Home to close</div></div>';
}

// What a key does to the card. Closed, only Info acts — everything else passes
// through to the screen as normal. Open, Info and Home close it and every other
// key is swallowed, so nothing acts on the screen underneath (story 5).
export function helpKeyAction(open, key) {
  if (!open) return key === 'i' ? 'open' : 'pass';
  return key === 'i' || key === 'Escape' ? 'close' : 'swallow';
}
