// TASK-503 (FEAT-497) — Films (standalone film / boxset / series) cut over
// onto the docs/QUEUE-UX-SHELL.md shell, the second media type on the
// TASK-498 unified queue engine (TASK-499 was the first, home movies). PURE:
// turns the `queue_playback` snapshot into the hero + Queue/Next/Coming-Up
// markup both surfaces mount — no client-side queue math.
//
// ⚠️ Superseded by core/queue-shell-view.js, which home movies already run on
// (TASK-516); TASK-517 points films there too and deletes this file.
//
// Differs from home movies in two ways the engine snapshot alone can't
// resolve:
//   * the hero subtitle names the SOURCE (a series/boxset title), not
//     derivable from source_type/source_id the way home movies' person/month
//     slugs are (an opaque collection id needs an actual title lookup) — the
//     caller (ui/screens/screen-film-queue.js) passes it in, already fetched
//     the same way the player's own breadcrumb resolves a series/boxset
//     title (core/app-api.js loadSeries, generic over any collection id).
//     null/'' for a standalone film (no source to name).
//   * Shuffle/Repeat are disabled-but-visible, not always-enabled: a
//     standalone film has literally nothing to shuffle/repeat (play_standalone
//     clears source_type), unlike home movies' Play All sources, which always
//     have one. Gated on `snap.source_type` alone (TASK-493 row 21 — the
//     Films-hides-Shuffle finding this fixes).
import { fmt } from './time.js';
import { qsTabShellHtml, phTabShellHtml } from './queue-tabs.js';

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

// Poster artwork: a bare content name served same-origin by media-manager's
// /media/ route (mirrors core/queue-shell-view.js's artHtml). A
// missing/abortive poster hides the <img> (onerror), falling back to the glyph.
function artHtml(poster, cls, glyph) {
  return [poster].filter(Boolean)
    .map(function(p) { return '<img class="' + cls + '" alt="" loading="lazy" src="/media/' + escapeHtml(p) + '" onerror="this.style.display=\'none\'">'; })
    .concat([glyph])[0];
}

function modelRow(entry) {
  return { entryId: entry.entry_id, itemId: entry.item_id, title: entry.title, poster: entry.poster, durationText: durationText(entry.duration) };
}
function modelRows(arr) {
  return (arr || []).map(modelRow);
}

function heroModel(snap, sourceTitle) {
  var np = snap.now_playing;
  if (!np) return null;
  return { itemId: np.item_id, title: np.title, poster: np.poster, subtitle: sourceTitle || '' };
}

// The view-model: a hero (null for an empty/absent snapshot) + the three tab
// sections, each already resolved server-side, plus hasSource (Shuffle/Repeat
// disabled state — no source to shuffle/repeat when false).
export function queueModel(snap, sourceTitle) {
  var s = snap || {};
  return {
    hero: heroModel(s, sourceTitle),
    hasSource: !!s.source_type,
    shuffle: !!s.shuffle,
    repeat: !!s.repeat,
    queueRows: modelRows(s.queue),
    nextRows: modelRows(s.next),
    comingUpRows: modelRows(s.coming_up)
  };
}

var ENDS_TEXT = 'Source ends — nothing plays after the last title (repeat is off)';

function tabLabel(base, count) { return base + ' ' + count; }

// ── shared hero transport (both TV + companion mount the SAME `.qs-*`
// classes for this, per docs/QUEUE-UX-SHELL.md's Hero section). Shuffle/
// Repeat carry `disabled` (a real HTML attribute, not `data-act`-only) when
// there is nothing to shuffle/repeat — inert on tap, dimmed by `.is-disabled`,
// and excluded from the overlay's own d-pad grid (`button:not([disabled])`,
// screen-film-queue.js's buildGrid) the same way every other disabled control
// in this app already works (`.q-act.is-disabled`, `.np-pill.is-disabled`).
function heroBtn(glyph, sizeCls, act, action, on, label, disabled) {
  var onCls = on ? ' on' : '';
  var disCls = disabled ? ' is-disabled' : '';
  var disAttr = disabled ? ' disabled' : '';
  var dataAction = (action && !disabled) ? ' data-action="' + action + '"' : '';
  var dataAct = disabled ? '' : ' data-act="' + act + '"';
  return '<button type="button" class="qs-tbtn ' + sizeCls + onCls + disCls + '"' + disAttr + dataAct + dataAction + ' aria-label="' + label + '">' + glyph + '</button>';
}
function heroTransportHtml(shuffle, repeat, hasSource) {
  var disabled = !hasSource;
  return '<div class="qs-transport">' +
    heroBtn('&#9198;', 'qs-tbtn-sm', 'transport', 'previous', false, 'Previous', disabled) +
    heroBtn('&#9199;', 'qs-tbtn-lg', 'toggle', null, false, 'Play / pause', false) +
    heroBtn('&#9197;', 'qs-tbtn-sm', 'transport', 'next', false, 'Next', disabled) +
    heroBtn('&#128256;', 'qs-tbtn-sm', 'transport', 'toggle-shuffle', shuffle, 'Shuffle', disabled) +
    heroBtn('&#128257;', 'qs-tbtn-sm', 'transport', 'toggle-repeat', repeat, 'Repeat', disabled) +
  '</div>';
}

// ── TV ──────────────────────────────────────────────────────────────────
function tvHeroHtml(m) {
  if (!m.hero) return '';
  return '<div class="qs-hero">' +
    '<div class="qs-hero-top">' +
      '<div class="qs-art">' + artHtml(m.hero.poster, 'poster-thumb', '&#127916;') + '</div>' +
      '<div class="qs-hero-body">' +
        '<div class="qs-hero-title">' + escapeHtml(m.hero.title) + '</div>' +
        '<div class="qs-hero-sub">' + escapeHtml(m.hero.subtitle) + '</div>' +
      '</div>' +
    '</div>' +
    heroTransportHtml(m.shuffle, m.repeat, m.hasSource) +
  '</div>';
}
function tvShiftBtn(entry, dir, enabled, glyph, label) {
  var extra = enabled ? '' : ' is-disabled';
  var dis = enabled ? '' : ' disabled';
  return '<button type="button" class="qs-act' + extra + '"' + dis + ' data-act="move" data-entry="' + entry + '" data-dir="' + dir + '" title="' + label + '" aria-label="' + label + '">' + glyph + '</button>';
}
function tvActionsHtml(row, canUp, canDown) {
  var entry = escapeHtml(row.entryId);
  return '<div class="qs-actions">' +
    tvShiftBtn(entry, 'up', canUp, '&#8593;', 'Shift up') +
    tvShiftBtn(entry, 'down', canDown, '&#8595;', 'Shift down') +
    '<button type="button" class="qs-act danger" data-act="remove" data-entry="' + entry + '" title="Remove" aria-label="Remove">&#10005;</button>' +
  '</div>';
}
function tvSelectHtml(row) {
  return '<button type="button" class="qs-select" data-act="select" data-item="' + escapeHtml(row.itemId) + '">' +
      '<span class="qs-thumb">' + artHtml(row.poster, 'poster-thumb', '&#127916;') + '</span>' +
      '<span class="qs-name">' + escapeHtml(row.title) + '</span>' +
      '<span class="qs-dur">' + escapeHtml(row.durationText) + '</span>' +
    '</button>';
}
function tvRowHtml(row, i, len) {
  return '<div class="qs-row">' + tvSelectHtml(row) + tvActionsHtml(row, i > 0, i < len - 1) + '</div>';
}
function tvReadOnlyRowHtml(row) {
  return '<div class="qs-row qs-readonly">' + tvSelectHtml(row) + '</div>';
}
function tvEmptyHtml(text) { return '<div class="qs-empty">' + escapeHtml(text) + '</div>'; }
function tvEditableBody(rows, emptyText) {
  if (!rows.length) return tvEmptyHtml(emptyText);
  return rows.map(function(r, i) { return tvRowHtml(r, i, rows.length); }).join('');
}
function tvComingUpBody(rows) {
  if (rows.length > 0) return rows.map(tvReadOnlyRowHtml).join('');
  return '<div class="qs-ends">&#9209; ' + escapeHtml(ENDS_TEXT) + '</div>';
}
function tvTabPanels(m) {
  return [
    { tab: 'queue', label: tabLabel('Queue', m.queueRows.length), html: tvEditableBody(m.queueRows, 'Nothing queued'), empty: !m.queueRows.length },
    { tab: 'next', label: tabLabel('Next', m.nextRows.length), html: tvEditableBody(m.nextRows, 'Nothing up next'), empty: !m.nextRows.length },
    { tab: 'coming-up', label: tabLabel('Coming Up', m.comingUpRows.length), html: tvComingUpBody(m.comingUpRows), empty: !m.comingUpRows.length }
  ];
}
export function filmQueueViewHtml(snap, sourceTitle) {
  var m = queueModel(snap, sourceTitle);
  return qsTabShellHtml(tvHeroHtml(m), tvTabPanels(m));
}

// ── companion (phone) ──────────────────────────────────────────────────
function phHeroHtml(m) {
  if (!m.hero) return '';
  return '<div class="qs-ph-hero">' +
    '<div class="qs-ph-top">' +
      '<div class="qs-art">' + artHtml(m.hero.poster, 'poster-thumb', '&#127916;') + '</div>' +
      '<div class="qs-ph-body">' +
        '<div class="qs-ph-title">' + escapeHtml(m.hero.title) + '</div>' +
        '<div class="qs-ph-sub">' + escapeHtml(m.hero.subtitle) + '</div>' +
      '</div>' +
    '</div>' +
    heroTransportHtml(m.shuffle, m.repeat, m.hasSource) +
  '</div>';
}
function phAct(entry, act, dir, enabled, glyph, label) {
  var dis = enabled ? '' : ' disabled';
  var cls = enabled ? '' : ' is-disabled';
  return '<button type="button" class="ph-ract' + cls + '"' + dis + ' data-act="' + act + '" data-entry="' + entry + '" data-dir="' + dir + '" aria-label="' + label + '">' + glyph + '</button>';
}
function phRowActions(row, canUp, canDown) {
  var entry = escapeHtml(row.entryId);
  return '<span class="acts">' +
    phAct(entry, 'move', 'up', canUp, '&#8593;', 'Shift up') +
    phAct(entry, 'move', 'down', canDown, '&#8595;', 'Shift down') +
    '<button type="button" class="ph-ract x" data-act="remove" data-entry="' + entry + '" aria-label="Remove">&#10005;</button>' +
  '</span>';
}
function phSelectHtml(row) {
  return '<button type="button" class="ph-qname" data-act="select" data-item="' + escapeHtml(row.itemId) + '">' +
      '<span class="grip">' + artHtml(row.poster, 'poster-thumb', '&#127916;') + '</span>' +
      '<span class="nm">' + escapeHtml(row.title) + '</span>' +
    '</button>';
}
function phRow(row, i, len) {
  return '<div class="ph-qrow">' + phSelectHtml(row) + phRowActions(row, i > 0, i < len - 1) + '</div>';
}
function phReadOnlyRow(row) {
  return '<div class="ph-qrow">' + phSelectHtml(row) + '</div>';
}
function phEmpty(text) { return '<div class="ph-qempty">' + escapeHtml(text) + '</div>'; }
function phEditableBody(rows, emptyText) {
  if (!rows.length) return phEmpty(emptyText);
  return rows.map(function(r, i) { return phRow(r, i, rows.length); }).join('');
}
function phComingUpBody(rows) {
  if (rows.length > 0) return rows.map(phReadOnlyRow).join('');
  return '<div class="ph-ends">&#9209; ' + escapeHtml(ENDS_TEXT) + '</div>';
}
function phTabPanels(m) {
  return [
    { tab: 'queue', label: tabLabel('Queue', m.queueRows.length), html: phEditableBody(m.queueRows, 'Nothing queued'), empty: !m.queueRows.length },
    { tab: 'next', label: tabLabel('Next', m.nextRows.length), html: phEditableBody(m.nextRows, 'Nothing up next'), empty: !m.nextRows.length },
    { tab: 'coming-up', label: tabLabel('Coming Up', m.comingUpRows.length), html: phComingUpBody(m.comingUpRows), empty: !m.comingUpRows.length }
  ];
}
export function companionFilmQueueHtml(snap, sourceTitle) {
  var m = queueModel(snap || {}, sourceTitle);
  return phTabShellHtml(phHeroHtml(m), phTabPanels(m));
}
