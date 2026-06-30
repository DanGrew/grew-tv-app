// FEAT-031 (TASK-188) Queue View model + markup. PURE: turns the server
// `playback` snapshot (TASK-186) into the four-section view-model and the HTML
// string the overlay mounts — the client does NO queue math (the server already
// resolved every permutation). One unified sequence, in order:
//   NOW PLAYING  — the current track (no entry_id; not an editable row).
//   PLAY NEXT    — override-queue items (origin = user-queued); hidden when empty.
//   FROM SOURCE  — remaining tracks in the current permutation.
//   THEN         — the next permutation (repeat-wrap); EMPTY `then` => "Source ends"
//                  (ordered + repeat off — nothing plays after the last track).
// Every PLAY NEXT / FROM SOURCE / THEN row carries its `entry_id`, so the overlay
// maps delete -> remove-queue-entry and shift up/down -> move-queue-entry (by
// entry_id + a within-section `to_index`). The left accent marks ORIGIN (queued
// vs source-generated), not editability — every row is editable.

import { fmt } from './time.js';
import { percent } from './progress.js';
import { tabShellHtml, phTabShellHtml } from './queue-tabs.js';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function durationText(secs) {
  if (secs == null || isNaN(secs)) return '';
  return fmt(secs);
}

// One materialized queue entry -> a view-model row. Shift up/down are single
// neighbour swaps within the entry's own list (the engine's `direction` move),
// NOT an absolute index — the client can't compute one (from_source is a slice
// of current_permutation and the snapshot omits source_position). canUp/canDown
// gate the edges: the first row can't shift up (would swap with the now-playing
// track / the prior section) and the last can't shift down.
function modelRow(entry, queued, canUp, canDown) {
  return {
    entryId: entry.entry_id,
    trackId: entry.track_id,
    title: entry.title,
    artist: entry.artist,
    durationText: durationText(entry.duration),
    queued: queued,
    canUp: canUp,
    canDown: canDown
  };
}

function modelRows(arr, queued) {
  var rows = arr || [];
  return rows.map(function (e, i) { return modelRow(e, queued, i > 0, i < rows.length - 1); });
}

function sourceHint(snap) {
  return snap.shuffle ? 'shuffled · reorder / remove individual tracks' : 'in order · reorder / remove individual tracks';
}

function thenHint(snap) {
  return snap.shuffle ? 'next shuffle · also editable' : 'repeat from the top · also editable';
}

// THEN: rows when the source continues, else the explicit end-of-source marker
// (ordered + repeat off => server sends an empty `then`).
function thenSection(snap) {
  var rows = modelRows(snap.then, false);
  if (rows.length > 0) return { key: 'then', label: 'Then', hint: thenHint(snap), rows: rows };
  return {
    key: 'then', label: 'Then', hint: '', rows: [],
    endsText: 'Source ends — nothing plays after the last track (repeat is off)'
  };
}

function nowPlayingModel(snap) {
  var np = snap.now_playing;
  if (!np) return null;
  return {
    trackId: np.track_id,
    title: np.title,
    artist: np.artist,
    timeText: durationText(np.position) + ' / ' + durationText(np.duration)
  };
}

// The bucketed view-model. PLAY NEXT is omitted entirely when the override queue
// is empty (so the section never renders an empty header); FROM SOURCE + THEN are
// always present. PLAY NEXT always precedes FROM SOURCE — the "why is this next"
// invariant (a row is next because you queued it OR the source generated it).
export function queueModel(snap) {
  var s = snap || {};
  var sections = [];
  var playNext = modelRows(s.play_next, true);
  if (playNext.length > 0) {
    sections.push({ key: 'play-next', label: 'Play Next', hint: 'you queued these · editable', rows: playNext });
  }
  sections.push({ key: 'from-source', label: 'From Source', hint: sourceHint(s), rows: modelRows(s.from_source, false) });
  sections.push(thenSection(s));
  return { nowPlaying: nowPlayingModel(s), shuffle: !!s.shuffle, repeat: !!s.repeat, sections: sections };
}

// Shuffle / Repeat are live toggles inside the Queue View (data-act=transport ->
// the overlay fires the toggle-shuffle / toggle-repeat action; the snapshot flips
// the `on` state). The player owns prev/play/next.
function pill(label, on, action, name) {
  return '<button type="button" class="np-pill' + (on ? ' on' : '') + '" data-act="transport" data-action="' + action + '" aria-label="' + name + '">' + label + '</button>';
}

function nowPlayingHtml(np, shuffle, repeat) {
  if (!np) return '';
  return '<div class="rail-label">Now Playing</div>' +
    '<div class="now-playing">' +
      '<div class="np-art">&#128191;</div>' +
      '<div class="np-body">' +
        '<div class="np-title">' + escapeHtml(np.title) + '</div>' +
        '<div class="np-artist">' + escapeHtml(np.artist) + '</div>' +
        '<div class="np-status">' +
          '<div class="np-transport">' +
            pill('&#128256; Shuffle', shuffle, 'toggle-shuffle', 'Shuffle') +
            pill('&#128257; Repeat', repeat, 'toggle-repeat', 'Repeat') +
          '</div>' +
          '<span class="np-time">' + escapeHtml(np.timeText) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

// A shift control. Disabled at the section edge: a disabled button can't fire and
// is dropped from the focus grid (buildGrid filters :not([disabled])), so the
// d-pad never lands on a dead cell.
function shiftBtn(entry, dir, enabled, glyph, label) {
  var extra = enabled ? '' : ' is-disabled';
  var dis = enabled ? '' : ' disabled';
  return '<button type="button" class="q-act' + extra + '"' + dis + ' data-act="move" data-entry="' + entry + '" data-dir="' + dir + '" title="' + label + '" aria-label="' + label + '">' + glyph + '</button>';
}

// Per-row edit controls. Shift up/down carry a `direction` (neighbour swap within
// the section); remove carries the entry_id. data-act drives a dispatch table in
// the overlay.
function actionsHtml(row) {
  var entry = escapeHtml(row.entryId);
  return '<div class="q-actions">' +
    shiftBtn(entry, 'up', row.canUp, '&#8593;', 'Shift up') +
    shiftBtn(entry, 'down', row.canDown, '&#8595;', 'Shift down') +
    '<button type="button" class="q-act danger" data-act="remove" data-entry="' + entry + '" title="Remove" aria-label="Remove">&#8862;</button>' +
  '</div>';
}

function rowHtml(row) {
  var grip = row.queued ? '&#10239;' : '&#9834;';
  return '<div class="q-row' + (row.queued ? ' queued' : '') + '">' +
    '<button type="button" class="q-select" data-act="select" data-track="' + escapeHtml(row.trackId) + '" data-entry="' + escapeHtml(row.entryId) + '">' +
      '<span class="q-grip">' + grip + '</span>' +
      '<span class="q-name">' + escapeHtml(row.title) + ' <span class="by">' + escapeHtml(row.artist) + '</span></span>' +
      '<span class="q-dur">' + escapeHtml(row.durationText) + '</span>' +
    '</button>' +
    actionsHtml(row) +
  '</div>';
}

// TASK-238: a section now drops its own rail-label — the TAB is the label. A panel
// body is the section's hint line + its rows; an empty section shows a placeholder.
function hintHtml(hint) {
  return hint ? '<div class="q-hint">' + escapeHtml(hint) + '</div>' : '';
}
function emptyHtml(text) {
  return '<div class="q-empty">' + escapeHtml(text) + '</div>';
}
function panelBody(sec, emptyText) {
  if (!sec || sec.rows.length === 0) return emptyHtml(emptyText);
  return hintHtml(sec.hint) + sec.rows.map(rowHtml).join('');
}
// Coming Up (Then): rows when the source continues, the "Source ends" marker when
// it doesn't (ordered + repeat off), else a plain note.
function comingUpBody(sec) {
  if (sec.rows.length > 0) return hintHtml(sec.hint) + sec.rows.map(rowHtml).join('');
  if (sec.endsText) return '<div class="q-ends">&#9209; ' + escapeHtml(sec.endsText) + '</div>';
  return emptyHtml('Nothing coming up');
}
function sectionByKey(model) {
  var byKey = {};
  model.sections.forEach(function (s) { byKey[s.key] = s; });
  return byKey;
}
// The three tab panels (in play order) from the bucketed model: Queue = Play Next
// (your queued picks), Next = From Source, Coming Up = Then. `empty` drives which
// tab opens first (see queue-tabs).
function tabPanels(m, body, comingUp) {
  var byKey = sectionByKey(m);
  var playNext = byKey['play-next'];
  var fromSource = byKey['from-source'];
  return [
    { tab: 'queue', label: 'Queue', html: body(playNext, 'Nothing queued — add tracks with ＋'), empty: !(playNext && playNext.rows.length) },
    { tab: 'next', label: 'Next', html: body(fromSource, 'Nothing up next'), empty: !(fromSource && fromSource.rows.length) },
    { tab: 'coming-up', label: 'Coming Up', html: comingUp(byKey['then']), empty: byKey['then'].rows.length === 0 }
  ];
}

// FEAT-039 (TASK-238): Now Playing header + Queue / Next / Coming Up tabs (shared
// shell). Empty/absent snapshot still renders a stable shell (no now-playing, empty
// tabs, "Source ends" under Coming Up).
export function queueViewHtml(snap) {
  var m = queueModel(snap);
  return tabShellHtml(nowPlayingHtml(m.nowPlaying, m.shuffle, m.repeat), tabPanels(m, panelBody, comingUpBody));
}

// ── companion (phone) Queue View ───────────────────────────────────────────
// FEAT-031 (TASK-189). The phone mirror of the TV Queue View: the SAME four
// sections off the SAME server snapshot (via queueModel — no re-derived queue
// math), in the mockup's `.ph-*` phone markup. The companion drives the TV
// (FEAT-017/028 mirror invariant): every control turns into the same TASK-186
// action the TV fires, POSTed straight to /api/playback by companion-queue.js.
// Transport play/pause is the lone exception — it toggles the TV's local
// <audio>, so it carries data-act="toggle" (a WS intent), not a server action.

// One phone transport control. prev/next/shuffle/repeat are server actions
// (data-act="transport" + the action name); play/pause is a device-local WS
// toggle (data-act="toggle"). `on` lights the shuffle/repeat pill state.
function phTransportBtn(act, action, glyph, on, label) {
  var cls = on ? ' on' : '';
  return '<button type="button" class="ph-tbtn' + cls + '" data-act="' + act + '" data-action="' + action + '" aria-label="' + label + '">' + glyph + '</button>';
}

function phTransport(snap) {
  return '<div class="ph-transport">' +
    phTransportBtn('transport', 'previous', '&#9198;', false, 'Previous') +
    phTransportBtn('toggle', '', '&#9199;', false, 'Play / pause') +
    phTransportBtn('transport', 'next', '&#9197;', false, 'Next') +
    phTransportBtn('transport', 'toggle-shuffle', '&#128256;', !!snap.shuffle, 'Shuffle') +
    phTransportBtn('transport', 'toggle-repeat', '&#128257;', !!snap.repeat, 'Repeat') +
  '</div>';
}

function phNowPlaying(snap) {
  var np = snap.now_playing;
  if (!np) return '';
  var time = durationText(np.position) + ' / ' + durationText(np.duration);
  return '<div class="ph-section">Now Playing</div>' +
    '<div class="ph-np">' +
      '<div class="art">&#127925;</div>' +
      '<div class="ph-np-body">' +
        '<div class="nm">' + escapeHtml(np.title) + '</div>' +
        '<div class="by">' + escapeHtml(np.artist) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="ph-bar"><i style="width:' + percent(np.position, np.duration) + '%"></i></div>' +
    '<div class="ph-sub ph-time">' + escapeHtml(time) + '</div>' +
    phTransport(snap);
}

// Per-row ✕/↑/↓. Disabled at the section edge (matches the TV overlay): a
// disabled control drops out of the tap targets and reads as a dead end.
function phAct(entry, act, dir, enabled, glyph, label) {
  var dis = enabled ? '' : ' disabled';
  var cls = enabled ? '' : ' is-disabled';
  return '<button type="button" class="ph-ract' + cls + '"' + dis + ' data-act="' + act + '" data-entry="' + entry + '" data-dir="' + dir + '" aria-label="' + label + '">' + glyph + '</button>';
}

function phRowActions(row) {
  var entry = escapeHtml(row.entryId);
  return '<span class="acts">' +
    phAct(entry, 'move', 'up', row.canUp, '&#8593;', 'Shift up') +
    phAct(entry, 'move', 'down', row.canDown, '&#8595;', 'Shift down') +
    '<button type="button" class="ph-ract x" data-act="remove" data-entry="' + entry + '" aria-label="Remove">&#10005;</button>' +
  '</span>';
}

// Tap the name to skip to (play) that track; the side controls edit the row.
function phRow(row) {
  var grip = row.queued ? '&#10239;' : '&#9834;';
  var by = escapeHtml(row.durationText);
  return '<div class="ph-qrow' + (row.queued ? ' queued' : '') + '">' +
    '<button type="button" class="ph-qname" data-act="select" data-track="' + escapeHtml(row.trackId) + '" data-entry="' + escapeHtml(row.entryId) + '">' +
      '<span class="grip">' + grip + '</span>' +
      '<span class="nm">' + escapeHtml(row.title) + ' <span class="by">&middot; ' + by + '</span></span>' +
    '</button>' +
    phRowActions(row) +
  '</div>';
}

// Phone tab-panel bodies (mirror the TV helpers, `.ph-*` markup).
function phHintHtml(hint) {
  return hint ? '<div class="ph-qhint">' + escapeHtml(hint) + '</div>' : '';
}
function phEmptyHtml(text) {
  return '<div class="ph-qempty">' + escapeHtml(text) + '</div>';
}
function phPanelBody(sec, emptyText) {
  if (!sec || sec.rows.length === 0) return phEmptyHtml(emptyText);
  return phHintHtml(sec.hint) + sec.rows.map(phRow).join('');
}
function phComingUpBody(sec) {
  if (sec.rows.length > 0) return phHintHtml(sec.hint) + sec.rows.map(phRow).join('');
  if (sec.endsText) return '<div class="ph-ends">&#9209; ' + escapeHtml(sec.endsText) + '</div>';
  return phEmptyHtml('Nothing coming up');
}

// Full phone Queue View — Now Playing header + Queue / Next / Coming Up tabs (same
// shell + tab mapping as the TV overlay). Empty/absent snapshot renders the stable
// shell (no now-playing, empty tabs, "Source ends" under Coming Up).
export function companionQueueHtml(snap) {
  var s = snap || {};
  var m = queueModel(s);
  return phTabShellHtml(phNowPlaying(s), tabPanels(m, phPanelBody, phComingUpBody));
}
