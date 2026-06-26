import { createTile } from '../../components/tile.js';
import { clampIndex } from '../../core/home-rails.js';

// FEAT-028 (TASK-167) — the L3 "rail grid" screen: a full poster grid of every
// item in one (section, rail), the page the companion's drill-down drives and
// mirrors. Reuses the shared tile (components/tile.js) + the browse glass tokens
// so it looks like the existing browse page, not a new style. This module owns
// the DOM + the two-zone (breadcrumb / grid) d-pad focus model; grouping is the
// existing core/home-rails grouping (the page picks the rail before render).

function tiles() {
  return Array.from(document.querySelectorAll('#rail-grid .film-tile'));
}

// The tiles sharing the first tile's offsetTop are the first visual row; their
// count is how many columns the responsive grid wrapped to — the Up/Down step.
// Empty/single-row -> 1 so the step is always >= 1.
function columns() {
  var t = tiles();
  var top = [t[0]].filter(Boolean).map(function(el) { return el.offsetTop; }).concat([0])[0];
  return [t.filter(function(el) { return el.offsetTop === top; }).length].filter(Boolean).concat([1])[0];
}

function curIndex() {
  return tiles().indexOf(document.activeElement);
}

function focusTileAt(i) {
  var t = tiles();
  [t[clampIndex(i, t.length)]].filter(Boolean).forEach(function(el) { el.focus(); });
}

export function focusFirstGridTile() {
  [tiles()[0]].filter(Boolean).forEach(function(el) { el.focus(); });
}

// FEAT-031 (TASK-214) — an OPTIONAL header-action row (e.g. the artist page's
// Play / Shuffle) that sits between the breadcrumb and the grid. Inert when the
// page has no `#header-actions` (the rail-grid page): the lookups return [] so
// gridUp/crumbDown fall back to their original crumb<->grid behaviour.
function actionBtns() {
  return Array.from(document.querySelectorAll('#header-actions .action-btn'));
}

function focusFirstAction() {
  [actionBtns()[0]].filter(Boolean).forEach(function(el) { el.focus(); });
}

function focusActionAt(i) {
  var a = actionBtns();
  [a[clampIndex(i, a.length)]].filter(Boolean).forEach(function(el) { el.focus(); });
}

function crumbLinks() {
  return Array.from(document.querySelectorAll('#breadcrumb .crumb-link'));
}

function focusFirstCrumb() {
  [crumbLinks()[0]].filter(Boolean).forEach(function(el) { el.focus(); });
}

function focusCrumbAt(i) {
  var c = crumbLinks();
  [c[clampIndex(i, c.length)]].filter(Boolean).forEach(function(el) { el.focus(); });
}

// The row above the grid: the header-action row when the page has one, else the
// breadcrumb. Returns a focus fn (no branch — filter/map/concat).
function aboveGrid() {
  return [actionBtns().length].filter(Boolean).map(function() { return focusFirstAction; }).concat([focusFirstCrumb])[0];
}

// Up from the first grid row hops to whatever sits above it (actions or crumbs);
// from any lower row it steps up one row (column kept by the index arithmetic).
function gridUp(i, cols) {
  ({ true: aboveGrid(), false: function() { focusTileAt(i - cols); } })[i < cols]();
}

// Grid zone: Left/Right step one tile, Up/Down a whole row; Up from row 0 leaves
// for the breadcrumb. Same-id tiles can repeat (a card in two genres) — focus is
// positional, like the browse rails.
function gridArrowImpl(e) {
  var i = curIndex();
  var cols = columns();
  var MOVE = {
    ArrowLeft:  function() { focusTileAt(i - 1); },
    ArrowRight: function() { focusTileAt(i + 1); },
    ArrowUp:    function() { gridUp(i, cols); },
    ArrowDown:  function() { focusTileAt(i + cols); }
  };
  [MOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
}

// The row below the breadcrumb: the header-action row when present, else the
// grid (rail-grid page). Returns a focus fn (no branch).
function belowCrumbs() {
  return [actionBtns().length].filter(Boolean).map(function() { return focusFirstAction; }).concat([focusFirstGridTile])[0];
}

// Breadcrumb zone: Left/Right move between crumbs, Down drops to the next row
// (actions or grid), Up is the edge.
function crumbArrow(e) {
  var i = crumbLinks().indexOf(document.activeElement);
  var CMOVE = {
    ArrowLeft:  function() { focusCrumbAt(i - 1); },
    ArrowRight: function() { focusCrumbAt(i + 1); },
    ArrowDown:  belowCrumbs(),
    ArrowUp:    function() {}
  };
  [CMOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
}

// Action zone: Left/Right between the header buttons, Down into the grid, Up to
// the breadcrumb.
function actionArrow(e) {
  var i = actionBtns().indexOf(document.activeElement);
  var AMOVE = {
    ArrowLeft:  function() { focusActionAt(i - 1); },
    ArrowRight: function() { focusActionAt(i + 1); },
    ArrowDown:  focusFirstGridTile,
    ArrowUp:    focusFirstCrumb
  };
  [AMOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
}

function inActions() {
  return [document.activeElement.closest('#header-actions')].filter(Boolean).map(function() { return 'actions'; });
}

function inCrumbs() {
  return [document.activeElement.closest('#breadcrumb')].filter(Boolean).map(function() { return 'crumbs'; });
}

function zoneOf() {
  return inActions().concat(inCrumbs()).concat(['grid'])[0];
}

var ZONE = { crumbs: crumbArrow, actions: actionArrow, grid: gridArrowImpl };

// Single d-pad entry point — routes the arrow to the zone holding focus.
export function gridArrow(e) {
  e.preventDefault();
  ZONE[zoneOf()](e);
}

// Render every card of the chosen rail as a focusable tile, reusing the shared
// component (posters + progress bar + CC badge) so the grid matches browse.
export function renderGrid(server, items, progress, onSelect) {
  var root = document.getElementById('rail-grid');
  root.innerHTML = '';
  [items].filter(function() { return items.length === 0; }).forEach(function() {
    root.innerHTML = '<div class="home-empty">Nothing here yet</div>';
  });
  items.forEach(function(card) {
    root.appendChild(createTile(server, card, { progress: progress, onSelect: onSelect }));
  });
}
