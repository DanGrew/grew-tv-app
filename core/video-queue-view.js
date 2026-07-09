// FEAT-040 (TASK-250) Video Queue View model + markup. PURE: turns the server
// `video_playback` snapshot (TASK-221/247) into the view-model and the HTML the
// overlay mounts. The VIDEO snapshot shape DIFFERS from music's (which arrives
// pre-bucketed as play_next / from_source / then with an entry_id on every row):
// video gives the raw index-based shape
//   { now_playing, current_item_index, items[], override_queue[], repeat, ... }
// so this module derives the sections itself — it does NOT reuse core/queue-view's
// queueModel. The buckets, in order:
//   NOW PLAYING  — the current item (no entry_id; not an editable row).
//   PLAY NEXT    — override_queue entries (each carries entry_id) — the ONLY
//                  editable rows (reorder / remove). Hidden when the queue is empty.
//   FROM SERIES  — the source items after the current index. Source members have
//                  NO entry_id, so they are play-to-jump only (play-item), never
//                  edited. When the source has ended with nothing queued and repeat
//                  is off, this section carries the "Series ends" marker instead.
//   THEN         — only under repeat: the wrap tail (items before the current one)
//                  that replays after the source loops. Play-to-jump, not editable.
// Every PLAY NEXT row carries its entry_id (delete -> remove-queue-entry, shift
// up/down -> move-queue-entry by entry_id + direction). FROM SERIES / THEN rows
// carry the item_id (select -> play-item). The left accent marks a queued row.

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

// BUG-022: poster artwork. Posters are bare content names served same-origin by
// media-manager's /media/ route (the app derives its origin, no host/port here),
// so a relative /media/<name> resolves on both the TV app page and the companion.
// A missing/abortive poster hides the <img> (onerror), so no broken-image icon —
// matching companion-detail's posterImg. No poster -> the film-clapper glyph.
function artHtml(poster, cls, glyph) {
  return [poster].filter(Boolean)
    .map(function (p) { return '<img class="' + cls + '" alt="" loading="lazy" src="/media/' + escapeHtml(p) + '" onerror="this.style.display=\'none\'">'; })
    .concat([glyph])[0];
}

// A queued (override-queue) entry -> an editable row. Shift up/down are single
// neighbour swaps (the engine's `direction` move); canUp/canDown gate the edges so
// the d-pad never lands on a disabled control. queued + editable; selecting a
// queued row is a no-op (no backend action plays a queue entry directly — it plays
// itself when its turn comes), so it carries no select handle.
function queueRow(entry, canUp, canDown) {
  return {
    entryId: entry.entry_id,
    itemId: entry.item_id,
    title: entry.title,
    poster: entry.poster,
    durationText: durationText(entry.duration),
    queued: true,
    editable: true,
    canUp: canUp,
    canDown: canDown
  };
}

// A source item -> a play-to-jump row (FROM SERIES / THEN). No entry_id (source
// members aren't reorderable/removable), so editable is false; selecting it fires
// play-item to jump the source to that item.
function sourceRow(item) {
  return {
    entryId: null,
    itemId: item.item_id,
    title: item.title,
    poster: item.poster,
    durationText: durationText(item.duration),
    queued: false,
    editable: false,
    canUp: false,
    canDown: false
  };
}

// videoQueueModel always passes an array (override_queue || []), so the former
// `arr || []` guard was an unreachable branch (TASK-315).
function queueRows(arr) {
  return arr.map(function (e, i) { return queueRow(e, i > 0, i < arr.length - 1); });
}

function nowPlayingModel(snap) {
  var np = snap.now_playing;
  if (!np) return null;
  return {
    itemId: np.item_id,
    title: np.title,
    poster: np.poster,
    durationText: durationText(np.duration)
  };
}

// PLAY NEXT — the editable override queue. Omitted entirely when empty so the
// header never renders for an empty section.
function playNextSection(rows) {
  if (rows.length === 0) return null;
  return { key: 'play-next', label: 'Play Next', hint: 'you queued these · reorder / remove', rows: rows };
}

// FROM SERIES — the source items after the current one. When that is empty AND
// nothing is queued AND repeat is off, the source has nothing left to play, so the
// section shows the end marker instead of an empty list.
function fromSeriesSection(after, queueLen, repeat) {
  if (after.length > 0) {
    return { key: 'from-series', label: 'From Series', hint: 'plays after the queue · jump to any', rows: after.map(sourceRow) };
  }
  if (queueLen > 0 || repeat) {
    return { key: 'from-series', label: 'From Series', hint: '', rows: [] };
  }
  return {
    key: 'from-series', label: 'From Series', hint: '', rows: [],
    endsText: 'Series ends — nothing plays after this episode (repeat is off)'
  };
}

// THEN — only under repeat: the wrap tail (items BEFORE the current one) that
// replays after the source loops back to the top. Omitted when off or empty.
function thenSection(before, repeat) {
  if (!repeat || before.length === 0) return null;
  return { key: 'then', label: 'Then', hint: 'repeats from the top · jump to any', rows: before.map(sourceRow) };
}

// The bucketed view-model from a `video_playback` snapshot.
export function videoQueueModel(snap) {
  var s = snap || {};
  var items = s.items || [];
  var idx = s.current_item_index || 0;
  var queue = s.override_queue || [];
  var repeat = !!s.repeat;
  var after = items.slice(idx + 1);
  var before = items.slice(0, idx);
  var sections = [
    playNextSection(queueRows(queue)),
    fromSeriesSection(after, queue.length, repeat),
    thenSection(before, repeat)
  ].filter(Boolean);
  return { nowPlaying: nowPlayingModel(s), repeat: repeat, repeatable: items.length > 1, sections: sections };
}

// ── TV overlay markup ───────────────────────────────────────────────────────
// Reuses the music Queue View's CSS classes (.now-playing/.np-*/.rail-label/
// .q-row/.q-act/...) so video.html carries the same overlay styles.

// Repeat is a live toggle inside the Queue View (data-act=transport -> the overlay
// fires toggle-repeat; the snapshot flips the `on` state). Video has no shuffle of
// the override queue (FEAT-040), so Repeat is the lone transport pill here.
function pill(label, on, action, name) {
  return '<button type="button" class="np-pill' + (on ? ' on' : '') + '" data-act="transport" data-action="' + action + '" aria-label="' + name + '">' + label + '</button>';
}

// BUG-024: on a non-repeatable (single-item) source, toggle-repeat is a backend
// no-op, so the pill is greyed + disabled and carries NO data-act — a tap can't
// fire the action. Mirrors the player transport's `.single` treatment.
function disabledPill(label, name) {
  return '<button type="button" class="np-pill is-disabled" disabled aria-label="' + name + '">' + label + '</button>';
}

function repeatPill(repeat, repeatable) {
  if (!repeatable) return disabledPill('&#128257; Repeat', 'Repeat');
  return pill('&#128257; Repeat', repeat, 'toggle-repeat', 'Repeat');
}

function nowPlayingHtml(np, repeat, repeatable) {
  if (!np) return '';
  return '<div class="rail-label">Now Playing</div>' +
    '<div class="now-playing">' +
      '<div class="np-art">' + artHtml(np.poster, 'poster-thumb', '&#127916;') + '</div>' +
      '<div class="np-body">' +
        '<div class="np-title">' + escapeHtml(np.title) + '</div>' +
        '<div class="np-status">' +
          '<div class="np-transport">' +
            repeatPill(repeat, repeatable) +
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

// Per-row edit controls — only editable (queued) rows get them.
function actionsHtml(row) {
  if (!row.editable) return '';
  var entry = escapeHtml(row.entryId);
  return '<div class="q-actions">' +
    shiftBtn(entry, 'up', row.canUp, '&#8593;', 'Shift up') +
    shiftBtn(entry, 'down', row.canDown, '&#8595;', 'Shift down') +
    '<button type="button" class="q-act danger" data-act="remove" data-entry="' + entry + '" title="Remove" aria-label="Remove">&#10005;</button>' +
  '</div>';
}

// A queued row's name is inert (no backend action plays a queue entry directly); a
// A queued ("Play Next") row plays NOW on tap (play-now = remove this entry +
// play-video it, so it doesn't replay from the queue afterwards); a source row's
// name jumps within the source (play-item by item_id).
function nameHtml(row) {
  var inner = '<span class="q-grip">' + artHtml(row.poster, 'poster-thumb', row.queued ? '&#10239;' : '&#127916;') + '</span>' +
    '<span class="q-name">' + escapeHtml(row.title) + '</span>' +
    '<span class="q-dur">' + escapeHtml(row.durationText) + '</span>';
  if (row.editable) return '<button type="button" class="q-select" data-act="play-now" data-entry="' + escapeHtml(row.entryId) + '" data-item="' + escapeHtml(row.itemId) + '">' + inner + '</button>';
  return '<button type="button" class="q-select" data-act="select" data-item="' + escapeHtml(row.itemId) + '">' + inner + '</button>';
}

function rowHtml(row) {
  return '<div class="q-row' + (row.queued ? ' queued' : '') + '">' +
    nameHtml(row) +
    actionsHtml(row) +
  '</div>';
}

// TASK-238: a section drops its own rail-label — the TAB is the label. Tab mapping:
// Queue = Play Next (your queued episodes), Next = From Series (rest of the source,
// or the "Series ends" marker the model attaches here), Coming Up = Then (the
// repeat wrap, present only under repeat).
// Only ever called (via rowsHtml) on a rows-bearing section, which always carries
// a non-empty hint, so the former empty-guard was an unreachable branch (TASK-315).
function hintHtml(hint) {
  return '<div class="q-hint">' + escapeHtml(hint) + '</div>';
}
function emptyHtml(text) {
  return '<div class="q-empty">' + escapeHtml(text) + '</div>';
}
function rowsHtml(sec) {
  return hintHtml(sec.hint) + sec.rows.map(rowHtml).join('');
}
function panelBody(sec, emptyText) {
  if (sec && sec.rows.length > 0) return rowsHtml(sec);
  return emptyHtml(emptyText);
}
// Next (From Series): rows, else the "Series ends" marker the model attaches here
// (ordered + repeat off, nothing queued), else a plain note.
function nextBody(sec, emptyText) {
  if (sec && sec.rows.length > 0) return rowsHtml(sec);
  if (sec && sec.endsText) return '<div class="q-ends">&#9209; ' + escapeHtml(sec.endsText) + '</div>';
  return emptyHtml(emptyText);
}
function sectionByKey(model) {
  var byKey = {};
  model.sections.forEach(function (s) { byKey[s.key] = s; });
  return byKey;
}
function videoPanels(m, rowEmpty, next, comingUp) {
  var byKey = sectionByKey(m);
  var playNext = byKey['play-next'];
  var fromSeries = byKey['from-series'];
  var then = byKey['then'];
  return [
    { tab: 'queue', label: 'Queue', html: rowEmpty(playNext, 'Nothing queued — add episodes with ＋'), empty: !(playNext && playNext.rows.length) },
    { tab: 'next', label: 'Next', html: next(fromSeries, 'Nothing up next'), empty: !(fromSeries && fromSeries.rows.length) },
    { tab: 'coming-up', label: 'Coming Up', html: comingUp(then, 'Nothing coming up'), empty: !(then && then.rows.length) }
  ];
}

// FEAT-039 (TASK-238): Now Playing header + Queue / Next / Coming Up tabs (shared
// shell). Empty/absent snapshot still renders a stable shell.
export function videoQueueViewHtml(snap) {
  var m = videoQueueModel(snap);
  return tabShellHtml(nowPlayingHtml(m.nowPlaying, m.repeat, m.repeatable), videoPanels(m, panelBody, nextBody, panelBody));
}

// ── companion (phone) Queue View ───────────────────────────────────────────
// The phone mirror — the SAME sections off the SAME snapshot (via videoQueueModel),
// in the mockup's `.ph-*` markup. The companion DRIVES the TV (FEAT-017/028 mirror
// invariant): every control turns into the same video-playback action the TV fires,
// POSTed to /api/video-playback by companion-video-queue.js.

function phTransportBtn(act, action, glyph, on, label) {
  var cls = on ? ' on' : '';
  return '<button type="button" class="ph-tbtn' + cls + '" data-act="' + act + '" data-action="' + action + '" aria-label="' + label + '">' + glyph + '</button>';
}

// BUG-024: mirror of the TV disabledPill — a non-repeatable source greys the
// companion Repeat button and strips its data-act so a tap can't fire it.
function phDisabledRepeat() {
  return '<button type="button" class="ph-tbtn is-disabled" disabled aria-label="Repeat">&#128257;</button>';
}

function phRepeatBtn(repeat, repeatable) {
  if (!repeatable) return phDisabledRepeat();
  return phTransportBtn('transport', 'toggle-repeat', '&#128257;', repeat, 'Repeat');
}

function phTransport(repeat, repeatable) {
  return '<div class="ph-transport">' +
    phTransportBtn('transport', 'previous', '&#9198;', false, 'Previous') +
    phTransportBtn('toggle', '', '&#9199;', false, 'Play / pause') +
    phTransportBtn('transport', 'next', '&#9197;', false, 'Next') +
    phRepeatBtn(repeat, repeatable) +
  '</div>';
}

function phNowPlaying(m) {
  var np = m.nowPlaying;
  if (!np) return '';
  return '<div class="ph-section">Now Playing</div>' +
    '<div class="ph-np">' +
      '<div class="art">' + artHtml(np.poster, 'poster-thumb', '&#127916;') + '</div>' +
      '<div class="ph-np-body">' +
        '<div class="nm">' + escapeHtml(np.title) + '</div>' +
        '<div class="by">' + escapeHtml(np.durationText) + '</div>' +
      '</div>' +
    '</div>' +
    phTransport(m.repeat, m.repeatable);
}

function phAct(entry, act, dir, enabled, glyph, label) {
  var dis = enabled ? '' : ' disabled';
  var cls = enabled ? '' : ' is-disabled';
  return '<button type="button" class="ph-ract' + cls + '"' + dis + ' data-act="' + act + '" data-entry="' + entry + '" data-dir="' + dir + '" aria-label="' + label + '">' + glyph + '</button>';
}

function phRowActions(row) {
  if (!row.editable) return '';
  var entry = escapeHtml(row.entryId);
  return '<span class="acts">' +
    phAct(entry, 'move', 'up', row.canUp, '&#8593;', 'Shift up') +
    phAct(entry, 'move', 'down', row.canDown, '&#8595;', 'Shift down') +
    '<button type="button" class="ph-ract x" data-act="remove" data-entry="' + entry + '" aria-label="Remove">&#10005;</button>' +
  '</span>';
}

function phName(row) {
  var inner = '<span class="grip">' + artHtml(row.poster, 'poster-thumb', row.queued ? '&#10239;' : '&#127916;') + '</span>' +
    '<span class="nm">' + escapeHtml(row.title) + ' <span class="by">&middot; ' + escapeHtml(row.durationText) + '</span></span>';
  if (row.editable) return '<button type="button" class="ph-qname" data-act="play-now" data-entry="' + escapeHtml(row.entryId) + '" data-item="' + escapeHtml(row.itemId) + '">' + inner + '</button>';
  return '<button type="button" class="ph-qname" data-act="select" data-item="' + escapeHtml(row.itemId) + '">' + inner + '</button>';
}

function phRow(row) {
  return '<div class="ph-qrow' + (row.queued ? ' queued' : '') + '">' +
    phName(row) +
    phRowActions(row) +
  '</div>';
}

// Phone tab-panel bodies (mirror the TV helpers, `.ph-*` markup).
// See hintHtml: only called on a rows-bearing (non-empty-hint) section, so the
// empty-guard was unreachable (TASK-315).
function phHintHtml(hint) {
  return '<div class="ph-qhint">' + escapeHtml(hint) + '</div>';
}
function phEmptyHtml(text) {
  return '<div class="ph-qempty">' + escapeHtml(text) + '</div>';
}
function phRowsHtml(sec) {
  return phHintHtml(sec.hint) + sec.rows.map(phRow).join('');
}
function phPanelBody(sec, emptyText) {
  if (sec && sec.rows.length > 0) return phRowsHtml(sec);
  return phEmptyHtml(emptyText);
}
function phNextBody(sec, emptyText) {
  if (sec && sec.rows.length > 0) return phRowsHtml(sec);
  if (sec && sec.endsText) return '<div class="ph-ends">&#9209; ' + escapeHtml(sec.endsText) + '</div>';
  return phEmptyHtml(emptyText);
}

// Full phone Video Queue View — Now Playing header + Queue / Next / Coming Up tabs
// (same shell + tab mapping as the TV overlay). Empty/absent snapshot renders the
// stable shell.
export function companionVideoQueueHtml(snap) {
  var m = videoQueueModel(snap);
  return phTabShellHtml(phNowPlaying(m), videoPanels(m, phPanelBody, phNextBody, phPanelBody));
}
