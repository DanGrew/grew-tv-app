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

// One materialized queue entry -> a view-model row. i / count drive the shift
// targets: up clamps at the section head, down at its tail (a no-op move at the
// edge, so the focus grid stays uniform).
function modelRow(entry, i, count, queued) {
  return {
    entryId: entry.entry_id,
    trackId: entry.track_id,
    title: entry.title,
    artist: entry.artist,
    durationText: durationText(entry.duration),
    queued: queued,
    upIndex: Math.max(0, i - 1),
    downIndex: Math.min(count - 1, i + 1)
  };
}

function modelRows(arr, queued) {
  var rows = arr || [];
  return rows.map(function (e, i) { return modelRow(e, i, rows.length, queued); });
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

function pill(label, on) {
  return '<span class="np-pill' + (on ? ' on' : '') + '">' + label + '</span>';
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
          pill('&#128256; Shuffle', shuffle) +
          pill('&#128257; Repeat', repeat) +
          '<span class="np-time">' + escapeHtml(np.timeText) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

// Per-row edit controls. Shift up/down carry the within-section to_index; remove
// carries only the entry_id. data-act drives a dispatch table in the overlay.
function actionsHtml(row) {
  var entry = escapeHtml(row.entryId);
  return '<div class="q-actions">' +
    '<button type="button" class="q-act" data-act="move" data-entry="' + entry + '" data-to="' + row.upIndex + '" title="Shift up" aria-label="Shift up">&#8593;</button>' +
    '<button type="button" class="q-act" data-act="move" data-entry="' + entry + '" data-to="' + row.downIndex + '" title="Shift down" aria-label="Shift down">&#8595;</button>' +
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

function sectionHtml(sec) {
  var hint = sec.hint ? ' <span class="hint">&mdash; ' + escapeHtml(sec.hint) + '</span>' : '';
  var label = '<div class="rail-label">' + escapeHtml(sec.label) + hint + '</div>';
  var ends = sec.endsText ? '<div class="q-ends">&#9209; ' + escapeHtml(sec.endsText) + '</div>' : '';
  return label + sec.rows.map(rowHtml).join('') + ends;
}

// Full overlay body markup for a snapshot. Empty/absent snapshot still renders a
// stable shell (no now-playing, empty FROM SOURCE, THEN "Source ends").
export function queueViewHtml(snap) {
  var m = queueModel(snap);
  return nowPlayingHtml(m.nowPlaying, m.shuffle, m.repeat) +
    m.sections.map(sectionHtml).join('');
}
