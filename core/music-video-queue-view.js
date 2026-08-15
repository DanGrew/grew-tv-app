// FEAT-418 (TASK-420) Music-Video Queue View model + markup. PURE: turns the
// server `music_video_playback` snapshot (TASK-419) into the four-section
// view-model and the HTML string the overlay mounts — the client does NO
// queue math (the server already resolved every permutation). TASK-419's
// engine is a byte-for-byte mirror of music's own (play_next / from_source /
// then, entry_id on every row across all three lists, shuffle + repeat both
// live) — but this module does NOT reuse core/queue-view.js, because the row
// shape differs: video_id + poster art, and no now-playing position (a music
// video never resumes or reports a scrub position, TASK-373).
//   NOW PLAYING  — the current video (no entry_id; not an editable row).
//   PLAY NEXT    — override-queue items (origin = user-queued); hidden when empty.
//   FROM SOURCE  — remaining videos in the current permutation.
//   THEN         — the next permutation (repeat-wrap); EMPTY `then` => "Source
//                  ends" (ordered + repeat off — nothing plays after the last video).
// Every row carries its `entry_id` (delete -> remove-queue-entry, shift up/
// down -> move-queue-entry); a row's own name plays it immediately (play-video)
// — mirrors queue-view.js's every-row-editable model, not video-queue-view.js's
// queued-only one.

import { fmt } from './time.js';
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

// Poster artwork (mirrors core/video-queue-view.js's artHtml): a bare content
// name served same-origin by media-manager's /media/ route. A missing/abortive
// poster hides the <img> (onerror), so no broken-image icon — falls back to
// the glyph.
function artHtml(poster, cls, glyph) {
  return [poster].filter(Boolean)
    .map(function (p) { return '<img class="' + cls + '" alt="" loading="lazy" src="/media/' + escapeHtml(p) + '" onerror="this.style.display=\'none\'">'; })
    .concat([glyph])[0];
}

// One materialized queue entry -> a view-model row. Shift up/down are single
// neighbour swaps within the entry's own list (the engine's `direction` move);
// canUp/canDown gate the edges.
function modelRow(entry, queued, canUp, canDown) {
  return {
    entryId: entry.entry_id,
    videoId: entry.video_id,
    title: entry.title,
    artist: entry.artist,
    poster: entry.poster,
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
  return snap.shuffle ? 'shuffled · reorder / remove individual videos' : 'in order · reorder / remove individual videos';
}

function thenHint(snap) {
  return snap.shuffle ? 'next shuffle · also editable' : 'repeat from the top · also editable';
}

// THEN: rows when the source continues, else the explicit end-of-source marker.
function thenSection(snap) {
  var rows = modelRows(snap.then, false);
  if (rows.length > 0) return { key: 'then', label: 'Then', hint: thenHint(snap), rows: rows };
  return {
    key: 'then', label: 'Then', hint: '', rows: [],
    endsText: 'Source ends — nothing plays after the last video (repeat is off)'
  };
}

function nowPlayingModel(snap) {
  var np = snap.now_playing;
  if (!np) return null;
  return {
    videoId: np.video_id,
    title: np.title,
    artist: np.artist,
    poster: np.poster,
    durationText: durationText(np.duration)
  };
}

// The bucketed view-model. PLAY NEXT is omitted entirely when the override
// queue is empty; FROM SOURCE + THEN are always present.
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

// Shuffle / Repeat are live toggles inside the Queue View, same as music's own.
function pill(label, on, action, name) {
  return '<button type="button" class="np-pill' + (on ? ' on' : '') + '" data-act="transport" data-action="' + action + '" aria-label="' + name + '">' + label + '</button>';
}

function nowPlayingHtml(np, shuffle, repeat) {
  if (!np) return '';
  return '<div class="rail-label">Now Playing</div>' +
    '<div class="now-playing">' +
      '<div class="np-art">' + artHtml(np.poster, 'poster-thumb', '&#127916;') + '</div>' +
      '<div class="np-body">' +
        '<div class="np-title">' + escapeHtml(np.title) + '</div>' +
        '<div class="np-artist">' + escapeHtml(np.artist) + '</div>' +
        '<div class="np-status">' +
          '<div class="np-transport">' +
            pill('&#128256; Shuffle', shuffle, 'toggle-shuffle', 'Shuffle') +
            pill('&#128257; Repeat', repeat, 'toggle-repeat', 'Repeat') +
          '</div>' +
          '<span class="np-time">' + escapeHtml(np.durationText) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function shiftBtn(entry, dir, enabled, glyph, label) {
  var extra = enabled ? '' : ' is-disabled';
  var dis = enabled ? '' : ' disabled';
  return '<button type="button" class="q-act' + extra + '"' + dis + ' data-act="move" data-entry="' + entry + '" data-dir="' + dir + '" title="' + label + '" aria-label="' + label + '">' + glyph + '</button>';
}

function actionsHtml(row) {
  var entry = escapeHtml(row.entryId);
  return '<div class="q-actions">' +
    shiftBtn(entry, 'up', row.canUp, '&#8593;', 'Shift up') +
    shiftBtn(entry, 'down', row.canDown, '&#8595;', 'Shift down') +
    '<button type="button" class="q-act danger" data-act="remove" data-entry="' + entry + '" title="Remove" aria-label="Remove">&#10005;</button>' +
  '</div>';
}

function rowHtml(row) {
  var grip = row.queued ? '&#10239;' : '&#127916;';
  return '<div class="q-row' + (row.queued ? ' queued' : '') + '">' +
    '<button type="button" class="q-select" data-act="select" data-video="' + escapeHtml(row.videoId) + '" data-entry="' + escapeHtml(row.entryId) + '">' +
      '<span class="q-grip">' + artHtml(row.poster, 'poster-thumb', grip) + '</span>' +
      '<span class="q-name">' + escapeHtml(row.title) + ' <span class="by">' + escapeHtml(row.artist) + '</span></span>' +
      '<span class="q-dur">' + escapeHtml(row.durationText) + '</span>' +
    '</button>' +
    actionsHtml(row) +
  '</div>';
}

function hintHtml(hint) {
  return '<div class="q-hint">' + escapeHtml(hint) + '</div>';
}
function emptyHtml(text) {
  return '<div class="q-empty">' + escapeHtml(text) + '</div>';
}
function panelBody(sec, emptyText) {
  if (!sec || sec.rows.length === 0) return emptyHtml(emptyText);
  return hintHtml(sec.hint) + sec.rows.map(rowHtml).join('');
}
function comingUpBody(sec) {
  if (sec.rows.length > 0) return hintHtml(sec.hint) + sec.rows.map(rowHtml).join('');
  return '<div class="q-ends">&#9209; ' + escapeHtml(sec.endsText) + '</div>';
}
function sectionByKey(model) {
  var byKey = {};
  model.sections.forEach(function (s) { byKey[s.key] = s; });
  return byKey;
}
// The three tab panels (in play order): Queue = Play Next, Next = From Source,
// Coming Up = Then.
function tabPanels(m, body, comingUp) {
  var byKey = sectionByKey(m);
  var playNext = byKey['play-next'];
  var fromSource = byKey['from-source'];
  return [
    { tab: 'queue', label: 'Queue', html: body(playNext, 'Nothing queued — add videos with ＋'), empty: !(playNext && playNext.rows.length) },
    { tab: 'next', label: 'Next', html: body(fromSource, 'Nothing up next'), empty: !(fromSource && fromSource.rows.length) },
    { tab: 'coming-up', label: 'Coming Up', html: comingUp(byKey['then']), empty: byKey['then'].rows.length === 0 }
  ];
}

// Now Playing header + Queue / Next / Coming Up tabs (shared shell). Empty/
// absent snapshot still renders a stable shell.
export function queueViewHtml(snap) {
  var m = queueModel(snap);
  return tabShellHtml(nowPlayingHtml(m.nowPlaying, m.shuffle, m.repeat), tabPanels(m, panelBody, comingUpBody));
}

// ── companion (phone) Queue View ───────────────────────────────────────────
// The phone mirror of the TV overlay: the SAME four sections off the SAME
// server snapshot (via queueModel — no re-derived queue math), in the
// mockup's `.ph-*` phone markup. The companion drives the TV (FEAT-017/028
// mirror invariant): every control turns into the same TASK-419 action the TV
// fires, POSTed straight to /api/music-video-playback by
// companion-music-video-queue.js. Transport play/pause is the lone exception
// — it toggles the TV's local <video>, so it carries data-act="toggle" (a WS
// intent), not a server action.

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
  return '<div class="ph-section">Now Playing</div>' +
    '<div class="ph-np">' +
      '<div class="art">' + artHtml(np.poster, 'poster-thumb', '&#127916;') + '</div>' +
      '<div class="ph-np-body">' +
        '<div class="nm">' + escapeHtml(np.title) + '</div>' +
        '<div class="by">' + escapeHtml(np.artist) + '</div>' +
      '</div>' +
    '</div>' +
    phTransport(snap);
}

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

// Tap the name to play (skip to) that video; the side controls edit the row.
function phRow(row) {
  var grip = row.queued ? '&#10239;' : '&#127916;';
  var by = escapeHtml(row.durationText);
  return '<div class="ph-qrow' + (row.queued ? ' queued' : '') + '">' +
    '<button type="button" class="ph-qname" data-act="select" data-video="' + escapeHtml(row.videoId) + '" data-entry="' + escapeHtml(row.entryId) + '">' +
      '<span class="grip">' + artHtml(row.poster, 'poster-thumb', grip) + '</span>' +
      '<span class="nm">' + escapeHtml(row.title) + ' <span class="by">&middot; ' + by + '</span></span>' +
    '</button>' +
    phRowActions(row) +
  '</div>';
}

function phHintHtml(hint) {
  return '<div class="ph-qhint">' + escapeHtml(hint) + '</div>';
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
  return '<div class="ph-ends">&#9209; ' + escapeHtml(sec.endsText) + '</div>';
}

// Full phone Queue View — Now Playing header + Queue / Next / Coming Up tabs
// (same shell + tab mapping as the TV overlay). Empty/absent snapshot renders
// the stable shell.
export function companionQueueHtml(snap) {
  var s = snap || {};
  var m = queueModel(s);
  return phTabShellHtml(phNowPlaying(s), tabPanels(m, phPanelBody, phComingUpBody));
}
