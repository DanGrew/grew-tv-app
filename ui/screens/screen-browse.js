import { registerScreen } from '../../core/screen-registry.js';
import { createTile } from '../../components/tile.js';
import { buildTabs, buildTabRails, clampIndex, withPlaylistsRail } from '../../core/home-rails.js';
import { progressMapFromCW } from '../../core/progress.js';
import { personGlyph } from '../../core/profile-config.js';

var PLAY_KEYS     = { Enter: true, ' ': true };

// FEAT-020 (TASK-138): the browse screen is a content-type sidebar plus a
// rail area. Selecting a sidebar tab swaps the rails to that content type's
// rails. Pure grouping/ordering lives in core/home-rails.js; this module owns
// the DOM and the two-zone (sidebar / rails) d-pad focus model. Module state
// holds the last-rendered data so a tab switch can rebuild the rails.
var STATE = { server: null, cards: [], cw: [], recents: [], progress: {}, labels: {}, profile: null, onSelect: null, onQueue: null, onCreatePlaylist: null };

function tilesIn(railEl) {
  return Array.from(railEl.querySelectorAll('.film-tile'));
}

function allRows() {
  return Array.from(document.querySelectorAll('.rail-row'));
}

function sidebarTabs() {
  return Array.from(document.querySelectorAll('.sidebar-tab'));
}

function focusFirstTile() {
  [document.querySelector('.rail-row .film-tile')].filter(Boolean).forEach(function(t) { t.focus(); });
}

function focusActiveTab() {
  [document.querySelector('.sidebar-tab.active')].filter(Boolean).forEach(function(t) { t.focus(); });
}

function focusToggle() {
  document.querySelector('.sidebar-toggle').focus();
}

// BUG-007: the top-right profile control is the third focus target. It is the
// edge above both zones — Up from the top tab or the top rail lands here.
function focusProfileLabel() {
  document.getElementById('profile-label').focus();
}

function focusTab(i) {
  var tabs = sidebarTabs();
  [tabs[clampIndex(i, tabs.length)]].filter(Boolean).forEach(function(t) { t.focus(); });
}

function focusCol(railEl, col) {
  [railEl].filter(Boolean).forEach(function(r) {
    var tiles = tilesIn(r);
    [tiles[clampIndex(col, tiles.length)]].filter(Boolean).forEach(function(t) { t.focus(); });
  });
}

// Leftward from the rails: step a column, or hop into the sidebar at the
// leftmost column (the new content-type focus zone).
function leftFromRail(railEl, col) {
  ({ true: focusActiveTab, false: function() { focusCol(railEl, col - 1); } })[col <= 0]();
}

// Upward from the top rail (or the top tab): hop to the profile control;
// otherwise step a rail / tab as before.
function upFromRail(rows, railIdx, col) {
  ({ true: focusProfileLabel, false: function() { focusCol(rows[railIdx - 1], col); } })[railIdx <= 0]();
}

// The collapse toggle sits above the tabs; Up from the top tab lands on it
// (and Up from the toggle continues to the profile control — see toggleArrow).
function upFromTab(idx) {
  ({ true: focusToggle, false: function() { focusTab(idx - 1); } })[idx <= 0]();
}

// Sidebar zone: Up/Down move between tabs (each focus swaps the rails, below);
// Right enters the rails; Left is the edge.
export function sidebarArrow(e) {
  e.preventDefault();
  var idx = sidebarTabs().indexOf(document.activeElement);
  var SMOVE = {
    ArrowUp:    function() { upFromTab(idx); },
    ArrowDown:  function() { focusTab(idx + 1); },
    ArrowRight: function() { focusFirstTile(); },
    ArrowLeft:  function() {}
  };
  [SMOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
}

// Toggle zone: the collapse button above the tabs. Down drops to the first tab,
// Up rises to the profile control, Right enters the rails; Enter (native button
// click) flips the sidebar's collapsed class.
export function toggleArrow(e) {
  e.preventDefault();
  var TMOVE = {
    ArrowUp:    focusProfileLabel,
    ArrowDown:  function() { focusTab(0); },
    ArrowRight: focusFirstTile,
    ArrowLeft:  function() {}
  };
  [TMOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
}

// Topbar zone: the profile control sits above both zones. Down drops into the
// rails, Left into the sidebar; activation (Enter) is wired by the page.
export function profileArrow(e) {
  e.preventDefault();
  var PMOVE = {
    ArrowDown: focusFirstTile,
    ArrowLeft: focusActiveTab
  };
  [PMOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
}

// Rails zone: left/right scroll within a rail (left at col 0 hops to the
// sidebar); up/down change rail keeping the column. Same-id tiles can repeat
// across rails (a card in two genres) — focus is positional.
export function railArrow(e) {
  e.preventDefault();
  var active = document.activeElement;
  var rows = allRows();
  var railIdx = rows.findIndex(function(r) { return r.contains(active); });
  var tiles = [rows[railIdx]].filter(Boolean).map(tilesIn).concat([[]])[0];
  var col = tiles.indexOf(active);
  var MOVE = {
    ArrowLeft:  function() { leftFromRail(rows[railIdx], col); },
    ArrowRight: function() { focusCol(rows[railIdx], col + 1); },
    ArrowUp:    function() { upFromRail(rows, railIdx, col); },
    ArrowDown:  function() { focusCol(rows[railIdx + 1], col); }
  };
  [railIdx].filter(function() { return railIdx >= 0; }).forEach(function() {
    [MOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
  });
}

function topbarZone() {
  return [document.activeElement.closest('#profile-label')].filter(Boolean).map(function() { return 'topbar'; });
}

// Checked before sidebarZone — the toggle lives inside #sidebar, so its more
// specific match must win.
function toggleZone() {
  return [document.activeElement.closest('.sidebar-toggle')].filter(Boolean).map(function() { return 'toggle'; });
}

function sidebarZone() {
  return [document.activeElement.closest('#sidebar')].filter(Boolean).map(function() { return 'sidebar'; });
}

function zoneOf() {
  return topbarZone().concat(toggleZone()).concat(sidebarZone()).concat(['rails'])[0];
}

var ZONE = { toggle: toggleArrow, sidebar: sidebarArrow, rails: railArrow, topbar: profileArrow };

// Single d-pad entry point — routes the arrow to the zone holding focus.
export function browseArrow(e) {
  ZONE[zoneOf()](e);
}

// FEAT-039 (TASK-235) — the Playlists rail heading carries a subtle ＋ button to
// the right of the title ("Playlists ＋"); the rail body now holds only real
// playlists (the old "＋ New Playlist" tile is gone). A plain clickable button —
// creation is driven by mouse (desktop) or the companion (TV), so it needs no
// d-pad focus stop. Opens the existing create flow (STATE.onCreatePlaylist).
function createPlaylistBtn() {
  var b = document.createElement('button');
  b.className = 'rail-create';
  b.setAttribute('data-create-playlist', '');
  b.setAttribute('aria-label', 'New playlist');
  b.textContent = '＋';
  b.addEventListener('click', STATE.onCreatePlaylist);
  return b;
}

function railSection(rail) {
  var section = document.createElement('div');
  section.className = 'rail';
  var h = document.createElement('div');
  h.className = 'rail-title';
  h.textContent = rail.title;
  [rail.id].filter(function(id) { return id === 'playlists'; }).forEach(function() { h.appendChild(createPlaylistBtn()); });
  section.appendChild(h);
  var row = document.createElement('div');
  row.className = 'rail-row';
  row.setAttribute('data-rail', rail.id);
  // Music tiles are square (taller) — give their rail extra vertical room so the
  // focus scale (1.05) isn't clipped by the row's overflow.
  row.classList.toggle('rail-row-music', rail.items.some(function(card) { return card.section === 'music'; }));
  rail.items.forEach(function(card) {
    row.appendChild(createTile(STATE.server, card, { progress: STATE.progress, onSelect: STATE.onSelect, onQueue: STATE.onQueue }));
  });
  section.appendChild(row);
  return section;
}

function renderRailRows(rails) {
  var root = document.getElementById('rails');
  root.innerHTML = '';
  [rails].filter(function() { return rails.length === 0; }).forEach(function() {
    root.innerHTML = '<div class="home-empty">Nothing here yet</div>';
  });
  rails.forEach(function(rail) { root.appendChild(railSection(rail)); });
}

function markActive(tabId) {
  sidebarTabs().forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-tab') === tabId); });
}

// Show one tab's rails (does not move focus — the caller decides). Called both on
// initial render and whenever a sidebar tab gains focus. The Music tab is
// augmented with an always-present (possibly empty) Playlists rail (withPlaylistsRail)
// so the TV always renders the "Playlists ＋" heading; other tabs render
// buildTabRails as-is.
function selectTab(tabId) {
  STATE.activeTab = tabId;
  markActive(tabId);
  var rails = buildTabRails(tabId, STATE.cards, STATE.cw, STATE.labels, STATE.recents);
  renderRailRows(({ true: function() { return withPlaylistsRail(rails); }, false: function() { return rails; } })[tabId === 'music']());
}

function tabButton(tab) {
  var btn = document.createElement('button');
  btn.className = 'sidebar-tab';
  btn.setAttribute('data-tab', tab.id);
  btn.textContent = tab.title;
  btn.addEventListener('focus', function() { selectTab(tab.id); });
  // Click must switch the rail itself, not lean on the focus handler: macOS
  // Safari / iOS WebKit do NOT focus a <button> on click, so the focus event
  // never fires there and the tab silently didn't change. Chrome/Android focus
  // on click and masked it. selectTab is idempotent, so the focus+click double
  // call on Chrome is harmless.
  btn.addEventListener('click', function() { selectTab(tab.id); focusFirstTile(); });
  return btn;
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
  document.body.classList.toggle('sidebar-collapsed');
}

function toggleButton() {
  var btn = document.createElement('button');
  btn.className = 'sidebar-toggle';
  btn.setAttribute('aria-label', 'Toggle menu');
  btn.textContent = '☰';
  btn.addEventListener('click', toggleSidebar);
  return btn;
}

function renderSidebar(tabs) {
  var bar = document.getElementById('sidebar');
  bar.innerHTML = '';
  bar.appendChild(toggleButton());
  tabs.forEach(function(tab) { bar.appendChild(tabButton(tab)); });
}

// The tab currently shown — the page persists it so returning to browse lands
// on the same tab (and thus can restore focus to the last-opened tile).
export function getActiveTab() {
  return STATE.activeTab;
}

// rails come from buildTabRails per the selected tab; the page passes the raw
// /api/browse cards + the /api/continue-watching rows + genreLabels, the active
// `person` (FEAT-033 — its authored name + glyph badge the bar), the select
// handler, and an optional initialTab to land on (else the first tab). The CW
// rows feed both the per-tab Continue Watching rail and the tiles' progress bars
// (via progressMapFromCW). `recents` (FEAT-045/TASK-318, from the same
// continue-watching response) feeds the Music tab's Recently Played rail.
export function renderBrowse(server, cards, cwRows, labels, profile, person, onSelect, initialTab, onQueue, onCreatePlaylist, recents) {
  STATE.server = server;
  STATE.cards = cards;
  STATE.cw = cwRows;
  STATE.recents = recents;
  STATE.progress = progressMapFromCW(cwRows);
  STATE.labels = labels;
  STATE.profile = profile;
  STATE.onSelect = onSelect;
  STATE.onQueue = onQueue;
  STATE.onCreatePlaylist = onCreatePlaylist;
  document.getElementById('profile-label').textContent = personGlyph(person) + ' ' + person.name + ' ▸';
  var tabs = buildTabs(cards);
  var ids = tabs.map(function(t) { return t.id; });
  renderSidebar(tabs);
  selectTab([initialTab].filter(function(t) { return ids.indexOf(t) >= 0; }).concat(ids).concat(['films'])[0]);
  focusFirstTile();
}

export { PLAY_KEYS };

export function setup() {
  registerScreen('screen-browse', {
    onEnter: focusFirstTile,
    keys: { ArrowLeft: browseArrow, ArrowRight: browseArrow, ArrowUp: browseArrow, ArrowDown: browseArrow },
    remote: {}
  });
}
