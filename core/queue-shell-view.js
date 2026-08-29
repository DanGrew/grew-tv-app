// TASK-515 (FEAT-497) — THE Queue UX shell. ONE implementation of
// docs/QUEUE-UX-SHELL.md, expressing the whole design for every media type,
// replacing the near-identical per-cutover copies TASK-499 (home movies) and
// TASK-503 (films) each shipped — and which had already drifted five ways.
// Nothing points at this yet: TASK-516 (home movies) and TASK-517 (films)
// consume it, TASK-504/505 after them.
//
// PURE: turns the TASK-498 unified queue engine's `queue_playback` snapshot
// ({ now_playing, queue, next, coming_up, shuffle, repeat, source_type,
// source_id }) into the hero + Queue/Next/Coming-Up markup both surfaces
// mount. The client does NO queue math — the server already resolved every
// list.
//
// Two surfaces, one renderer. Everything a surface changes is a CLASS NAME,
// so both come out of the same builders (SURFACE below) rather than two
// hand-maintained copies:
//   TV        — the `.qs-*` class set (kept apart from the older `.qtab`/
//               `.q-row` classes, still live for the media types not yet cut
//               over), tab bar via queue-tabs.js's qsTabShellHtml.
//   Companion — the existing `.ph-qrow`/`.ph-qname`/`.ph-ract`/`.ph-qtab*`
//               classes, via phTabShellHtml. The hero's icon-only circular
//               transport row shares the SAME `.qs-*` classes as the TV's
//               (each surface's own `<style>` block defines them identically;
//               this app has no shared stylesheet — docs/ARCHITECTURE.md).
//
// Everything media-type-specific is CONFIG, never a branch — see
// core/queue-shell-config.js for the shape (media noun, fallback glyph,
// source-subtitle resolver, row sub-line resolver, transport rule, the
// playing-on-its-own wording). A fifth media type is data, not code.
//
// Every row's tap plays it now via `play-item` — never queue-item, never a
// remove/re-add pair — so no row mutates queue/source data by being tapped
// (QUEUE-UX-SHELL.md "Rows"). Coming Up rows carry no actions: the engine
// itself refuses remove/move against next_permutation (queue_engine.py), so
// those controls would silently 400 if offered here.

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

// A duration as the row's muted second line — the shell's default sub-line
// resolver, and the only one derivable for every media type today.
export function durationText(secs) {
  if (secs == null || isNaN(secs)) return '';
  return fmt(secs);
}

// Artwork: a bare content name served same-origin by media-manager's /media/
// route. A missing/abortive poster hides the <img> (onerror), falling back to
// the config's own glyph.
function artHtml(poster, cls, glyph) {
  return [poster].filter(Boolean)
    .map(function(p) { return '<img class="' + cls + '" alt="" loading="lazy" src="/media/' + escapeHtml(p) + '" onerror="this.style.display=\'none\'">'; })
    .concat([glyph])[0];
}

// ── the transport rule ─────────────────────────────────────────────────────
// ONE rule for every media type, not a per-type gate. Films shipped ⏭ gated
// on `source_type` alone, which reads dead while a queued item is waiting to
// play (BUG-510); home movies shipped no rule at all. Both are the same
// defect against QUEUE-UX-SHELL.md, so this replaces them:
//   next     — live whenever there is ANYTHING to advance to, from either the
//              override queue or the source, matching the engine's own
//              advance() (it pops the queue front regardless of source_type).
//   previous — a source to step back through.
//   shuffle  — a source whose order there is something to shuffle.
//   repeat   — a source that can wrap.
// Shuffle/Repeat/⏮ are DISABLED-but-visible when off, never hidden
// (QUEUE-UX-SHELL.md "Hero"; TASK-493 row 21, the Films-hides-Shuffle
// finding). Config carries this as `transport` so a media type CAN state its
// own, but no type does — a difference between types is a defect to fix here,
// not a per-type rule to codify.
export function transportState(snap) {
  var s = snap || {};
  var hasSource = !!s.source_type;
  var ahead = (s.queue || []).length + (s.next || []).length + (s.coming_up || []).length;
  return { previous: hasSource, next: ahead > 0, shuffle: hasSource, repeat: hasSource };
}

// ── the view-model ─────────────────────────────────────────────────────────
function modelRow(entry, config) {
  return {
    entryId: entry.entry_id,
    itemId: entry.item_id,
    title: entry.title,
    poster: entry.poster,
    sub: config.rowSub(entry)
  };
}
function modelRows(arr, config) {
  return (arr || []).map(function(entry) { return modelRow(entry, config); });
}

function heroModel(snap, wording, sourceTitle) {
  var np = snap.now_playing;
  if (!np) return null;
  return { itemId: np.item_id, title: np.title, poster: np.poster, subtitle: wording.source(snap, sourceTitle) };
}

// ── which words the page uses ──────────────────────────────────────────────
// Two wording sets, three slots each: the hero's source line, the empty-Next
// line, and the Coming Up end-marker. This is the set for a play WITH a source
// behind it — the media noun is the ONLY thing that varies in it, the wording
// itself being the shared design's (home movies and films shipped two
// different empty-Queue strings; that was drift). The standalone set is the
// same three slots as data on each config row (queue-shell-config.js).
function sourcedWording(config) {
  return {
    source: config.sourceSubtitle,
    emptyNext: 'Nothing up next',
    ends: 'Source ends — nothing plays after the last ' + config.noun + ' (repeat is off)'
  };
}

// TASK-535 — a MAP keyed on whether something is playing with no source to
// name, not a branch for the no-source case: the same boolean-key dispatch the
// Queue overlay's own ON_SNAP already uses. One rule for all five types, and
// it reads the SNAPSHOT rather than what a source resolver handed back — home
// movies' resolver answers 'All' for a standalone clip, which claims a source
// that isn't there. An absent snapshot (nothing playing at all) is not a
// standalone play, so the all-empty shell keeps the wording it always had.
function wordingFor(snap, config) {
  return { false: sourcedWording(config), true: config.standalone }[!!(snap.now_playing && !snap.source_type)];
}

function textsFor(config, wording) {
  return {
    emptyQueue: 'Nothing queued — add ' + config.nounPlural + ' with ＋',
    emptyNext: wording.emptyNext,
    ends: wording.ends
  };
}

// `sourceTitle` is the caller's own lookup for a source whose name is not
// derivable from the snapshot (a film's series/boxset id, an album/playlist
// id — all opaque); a type that derives its own (home movies' person/month
// slugs) ignores it.
export function queueShellModel(snap, config, sourceTitle) {
  var s = snap || {};
  var wording = wordingFor(s, config);
  return {
    hero: heroModel(s, wording, sourceTitle),
    transport: config.transport(s),
    shuffle: !!s.shuffle,
    repeat: !!s.repeat,
    queueRows: modelRows(s.queue, config),
    nextRows: modelRows(s.next, config),
    comingUpRows: modelRows(s.coming_up, config),
    texts: textsFor(config, wording),
    glyph: config.glyph
  };
}

// ── surfaces: the same builders, two class sets ────────────────────────────
var TV = {
  hero: 'qs-hero', heroTop: 'qs-hero-top', heroBody: 'qs-hero-body',
  heroTitle: 'qs-hero-title', heroSub: 'qs-hero-sub',
  row: 'qs-row', readOnly: 'qs-row qs-readonly',
  select: 'qs-select', thumb: 'qs-thumb', rowBody: 'qs-body',
  rowTitle: 'qs-name', rowSub: 'qs-sub',
  actsTag: 'div', acts: 'qs-actions', act: 'qs-act', remove: 'qs-act danger',
  empty: 'qs-empty', ends: 'qs-ends',
  shell: qsTabShellHtml
};

var PHONE = {
  hero: 'qs-ph-hero', heroTop: 'qs-ph-top', heroBody: 'qs-ph-body',
  heroTitle: 'qs-ph-title', heroSub: 'qs-ph-sub',
  row: 'ph-qrow', readOnly: 'ph-qrow ph-readonly',
  select: 'ph-qname', thumb: 'grip', rowBody: 'nm',
  rowTitle: 'qs-name', rowSub: 'qs-sub',
  actsTag: 'span', acts: 'acts', act: 'ph-ract', remove: 'ph-ract x',
  empty: 'ph-qempty', ends: 'ph-ends',
  shell: phTabShellHtml
};

// ── hero ───────────────────────────────────────────────────────────────────
// A disabled control keeps its glyph and its place (dimmed via .is-disabled)
// but drops `data-act`/`data-action` along with carrying the real `disabled`
// attribute — inert on tap, and excluded from the TV overlay's own d-pad grid
// (`button:not([disabled])`), the same way every other disabled control in
// this app already works.
function heroBtn(glyph, sizeCls, act, action, on, label, enabled) {
  var onCls = on ? ' on' : '';
  var disCls = enabled ? '' : ' is-disabled';
  var disAttr = enabled ? '' : ' disabled';
  var dataAct = enabled ? ' data-act="' + act + '"' : '';
  var dataAction = (action && enabled) ? ' data-action="' + action + '"' : '';
  return '<button type="button" class="qs-tbtn ' + sizeCls + onCls + disCls + '"' + disAttr + dataAct + dataAction + ' aria-label="' + label + '">' + glyph + '</button>';
}

function heroTransportHtml(m) {
  var t = m.transport;
  return '<div class="qs-transport">' +
    heroBtn('&#9198;', 'qs-tbtn-sm', 'transport', 'previous', false, 'Previous', t.previous) +
    heroBtn('&#9199;', 'qs-tbtn-lg', 'toggle', null, false, 'Play / pause', true) +
    heroBtn('&#9197;', 'qs-tbtn-sm', 'transport', 'next', false, 'Next', t.next) +
    heroBtn('&#128256;', 'qs-tbtn-sm', 'transport', 'toggle-shuffle', m.shuffle, 'Shuffle', t.shuffle) +
    heroBtn('&#128257;', 'qs-tbtn-sm', 'transport', 'toggle-repeat', m.repeat, 'Repeat', t.repeat) +
  '</div>';
}

function heroHtml(m, s) {
  if (!m.hero) return '';
  return '<div class="' + s.hero + '">' +
    '<div class="' + s.heroTop + '">' +
      '<div class="qs-art">' + artHtml(m.hero.poster, 'poster-thumb', m.glyph) + '</div>' +
      '<div class="' + s.heroBody + '">' +
        '<div class="' + s.heroTitle + '">' + escapeHtml(m.hero.title) + '</div>' +
        '<div class="' + s.heroSub + '">' + escapeHtml(m.hero.subtitle) + '</div>' +
      '</div>' +
    '</div>' +
    heroTransportHtml(m) +
  '</div>';
}

// ── rows ───────────────────────────────────────────────────────────────────
function selectHtml(row, m, s) {
  return '<button type="button" class="' + s.select + '" data-act="select" data-item="' + escapeHtml(row.itemId) + '">' +
      '<span class="' + s.thumb + '">' + artHtml(row.poster, 'poster-thumb', m.glyph) + '</span>' +
      '<span class="' + s.rowBody + '">' +
        '<span class="' + s.rowTitle + '">' + escapeHtml(row.title) + '</span>' +
        '<span class="' + s.rowSub + '">' + escapeHtml(row.sub) + '</span>' +
      '</span>' +
    '</button>';
}

function shiftBtn(entry, dir, enabled, glyph, label, s) {
  var cls = enabled ? '' : ' is-disabled';
  var dis = enabled ? '' : ' disabled';
  return '<button type="button" class="' + s.act + cls + '"' + dis + ' data-act="move" data-entry="' + entry + '" data-dir="' + dir + '" title="' + label + '" aria-label="' + label + '">' + glyph + '</button>';
}

function actionsHtml(row, canUp, canDown, s) {
  var entry = escapeHtml(row.entryId);
  return '<' + s.actsTag + ' class="' + s.acts + '">' +
    shiftBtn(entry, 'up', canUp, '&#8593;', 'Shift up', s) +
    shiftBtn(entry, 'down', canDown, '&#8595;', 'Shift down', s) +
    '<button type="button" class="' + s.remove + '" data-act="remove" data-entry="' + entry + '" title="Remove" aria-label="Remove">&#10005;</button>' +
  '</' + s.actsTag + '>';
}

function rowHtml(row, i, len, m, s) {
  return '<div class="' + s.row + '">' + selectHtml(row, m, s) + actionsHtml(row, i > 0, i < len - 1, s) + '</div>';
}

// Coming Up is read-only and visibly dimmed on BOTH surfaces — the companion
// copy emitted no read-only class at all, so its Coming Up rows read as
// editable-looking rows that simply lack buttons.
function readOnlyRowHtml(row, m, s) {
  return '<div class="' + s.readOnly + '">' + selectHtml(row, m, s) + '</div>';
}

function editableBody(rows, emptyText, m, s) {
  if (!rows.length) return '<div class="' + s.empty + '">' + escapeHtml(emptyText) + '</div>';
  return rows.map(function(r, i) { return rowHtml(r, i, rows.length, m, s); }).join('');
}

function comingUpBody(rows, m, s) {
  if (rows.length > 0) return rows.map(function(r) { return readOnlyRowHtml(r, m, s); }).join('');
  return '<div class="' + s.ends + '">&#9209; ' + escapeHtml(m.texts.ends) + '</div>';
}

// The count is bracketed — "Next (2)" — and an empty tab still reads "(0)"
// rather than losing the number. Both surfaces label through here.
function tabLabel(base, count) { return base + ' (' + count + ')'; }

function tabPanels(m, s) {
  return [
    { tab: 'queue', label: tabLabel('Queue', m.queueRows.length), html: editableBody(m.queueRows, m.texts.emptyQueue, m, s), empty: !m.queueRows.length },
    { tab: 'next', label: tabLabel('Next', m.nextRows.length), html: editableBody(m.nextRows, m.texts.emptyNext, m, s), empty: !m.nextRows.length },
    { tab: 'coming-up', label: tabLabel('Coming Up', m.comingUpRows.length), html: comingUpBody(m.comingUpRows, m, s), empty: !m.comingUpRows.length }
  ];
}

function render(snap, config, sourceTitle, s) {
  var m = queueShellModel(snap, config, sourceTitle);
  return s.shell(heroHtml(m, s), tabPanels(m, s));
}

// The TV overlay's Queue screen.
export function queueShellHtml(snap, config, sourceTitle) {
  return render(snap, config, sourceTitle, TV);
}

// The companion (phone) Queue page — the same screen, the phone's classes.
export function companionQueueShellHtml(snap, config, sourceTitle) {
  return render(snap, config, sourceTitle, PHONE);
}
