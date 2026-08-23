// TASK-499 (FEAT-497) — the FIRST cutover onto the docs/QUEUE-UX-SHELL.md
// Queue UX shell: home movies, over the TASK-498 unified queue engine's own
// `queue_playback` snapshot ({ now_playing, queue, next, coming_up, shuffle,
// repeat, source_type, source_id }). PURE: turns that snapshot into the hero
// + Queue/Next/Coming-Up markup both surfaces mount — the client does NO
// queue math (the server already resolved every list).
//
// Two DOM surfaces, one model (queueModel), mirroring core/
// music-video-queue-view.js's own TV/companion split:
//   TV        — a NEW class set (`.qs-*`) rather than reusing `.qtab`/
//               `.q-row`/`.now-playing`: those stay live for every media type
//               not yet cut over onto this shell (TASK-503/504/505), so
//               restyling them here would leak into screens this task never
//               touches. The hero (art/title/source-subtitle + one icon-only
//               circular transport row) is new; the tab bar reuses
//               queue-tabs.js's qsTabShellHtml (full-width equal tabs).
//   Companion — the EXISTING `.ph-qrow`/`.ph-qname`/`.ph-ract`/`.ph-qtab*`
//               classes already match this shell's pixel spec (48px thumb,
//               34px 6px-radius action buttons, flex:1 tabs) — reused as-is,
//               via the existing phTabShellHtml. Only the hero's icon-only
//               circular transport row is new there too (the old `.ph-tbtn`
//               row is uniform/non-circular) — it shares the SAME `.qs-*`
//               transport classes the TV hero uses (each surface's own
//               `<style>` block defines them identically; there is no shared
//               stylesheet file in this app, docs/ARCHITECTURE.md).
//
// Every row's tap plays it now via `play-item` — never queue-item, never a
// remove/re-add pair — so no row mutates queue/source data by being tapped
// (QUEUE-UX-SHELL.md "Rows"). Coming Up rows carry no actions: the engine
// itself refuses remove/move against next_permutation (queue_engine.py), so
// those controls would silently 400 if offered here.

import { fmt } from './time.js';
import { qsTabShellHtml, phTabShellHtml } from './queue-tabs.js';
import { homeMoviesSourceLabel } from './home-rails.js';

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

// Clip artwork: a bare content name served same-origin by media-manager's
// /media/ route (mirrors core/music-video-queue-view.js's artHtml). A
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

function heroModel(snap) {
  var np = snap.now_playing;
  if (!np) return null;
  return { itemId: np.item_id, title: np.title, poster: np.poster, subtitle: homeMoviesSourceLabel(snap.source_type, snap.source_id) };
}

// The view-model: a hero (null for an empty/absent snapshot) + the three
// tab sections, each already resolved server-side — no client bucketing.
export function queueModel(snap) {
  var s = snap || {};
  return {
    hero: heroModel(s),
    shuffle: !!s.shuffle,
    repeat: !!s.repeat,
    queueRows: modelRows(s.queue),
    nextRows: modelRows(s.next),
    comingUpRows: modelRows(s.coming_up)
  };
}

var ENDS_TEXT = 'Source ends — nothing plays after the last clip (repeat is off)';

function tabLabel(base, count) { return base + ' ' + count; }

// ── shared hero transport (both TV + companion mount the SAME `.qs-*`
// classes for this, per docs/QUEUE-UX-SHELL.md's Hero section) ─────────────
function heroBtn(glyph, sizeCls, act, action, on, label) {
  var onCls = on ? ' on' : '';
  var dataAction = action ? ' data-action="' + action + '"' : '';
  return '<button type="button" class="qs-tbtn ' + sizeCls + onCls + '" data-act="' + act + '"' + dataAction + ' aria-label="' + label + '">' + glyph + '</button>';
}
function heroTransportHtml(shuffle, repeat) {
  return '<div class="qs-transport">' +
    heroBtn('&#9198;', 'qs-tbtn-sm', 'transport', 'previous', false, 'Previous') +
    heroBtn('&#9199;', 'qs-tbtn-lg', 'toggle', null, false, 'Play / pause') +
    heroBtn('&#9197;', 'qs-tbtn-sm', 'transport', 'next', false, 'Next') +
    heroBtn('&#128256;', 'qs-tbtn-sm', 'transport', 'toggle-shuffle', shuffle, 'Shuffle') +
    heroBtn('&#128257;', 'qs-tbtn-sm', 'transport', 'toggle-repeat', repeat, 'Repeat') +
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
    heroTransportHtml(m.shuffle, m.repeat) +
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
    { tab: 'queue', label: tabLabel('Queue', m.queueRows.length), html: tvEditableBody(m.queueRows, 'Nothing queued — add clips with ＋'), empty: !m.queueRows.length },
    { tab: 'next', label: tabLabel('Next', m.nextRows.length), html: tvEditableBody(m.nextRows, 'Nothing up next'), empty: !m.nextRows.length },
    { tab: 'coming-up', label: tabLabel('Coming Up', m.comingUpRows.length), html: tvComingUpBody(m.comingUpRows), empty: !m.comingUpRows.length }
  ];
}
export function homeMoviesQueueViewHtml(snap) {
  var m = queueModel(snap);
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
    heroTransportHtml(m.shuffle, m.repeat) +
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
    { tab: 'queue', label: tabLabel('Queue', m.queueRows.length), html: phEditableBody(m.queueRows, 'Nothing queued — add clips with ＋'), empty: !m.queueRows.length },
    { tab: 'next', label: tabLabel('Next', m.nextRows.length), html: phEditableBody(m.nextRows, 'Nothing up next'), empty: !m.nextRows.length },
    { tab: 'coming-up', label: tabLabel('Coming Up', m.comingUpRows.length), html: phComingUpBody(m.comingUpRows), empty: !m.comingUpRows.length }
  ];
}
export function companionHomeMoviesQueueHtml(snap) {
  var m = queueModel(snap || {});
  return phTabShellHtml(phHeroHtml(m), phTabPanels(m));
}
