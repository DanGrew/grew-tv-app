import { registerScreen } from '../../core/screen-registry.js';
import { createTile, createChannelTile, applyChannelView } from '../../components/tile.js';
import { buildTabs, railsForBrowseSection, clampIndex } from '../../core/home-rails.js';
import { progressMapFromCW } from '../../core/progress.js';
import { personGlyph } from '../../core/profile-config.js';
import { withChannelsTab, channelsById, channelCardView, landingTab, tileVariant } from '../../core/channels.js';

// FEAT-020 (TASK-138): the browse screen is a content-type sidebar plus a
// rail area. Selecting a sidebar tab swaps the rails to that content type's
// rails. Pure grouping/ordering lives in core/home-rails.js; this module owns
// the DOM and the two-zone (sidebar / rails) d-pad focus model. Module state
// holds the last-rendered data so a tab switch can rebuild the rails.
var STATE = { server: null, cards: [], cw: [], recents: [], progress: {}, labels: {}, profile: null, onSelect: null, onQueue: null, onCreatePlaylist: null, onTabChange: null, channels: [], channelsById: {}, channelsAt: 0, railCol: 0 };

// FEAT-560/TASK-563 — the Channels strip ticks (decision 14): a card baked at
// fetch time is wrong within a minute of render. Every second the rendered
// cards re-derive their position from the clock; the strip itself is re-fetched
// by the page, which is what rolls a card on to the next programme entry.
var TICK_MS = 1000;
var tickTimer = null;

function elapsedSeconds() {
  return (Date.now() - STATE.channelsAt) / 1000;
}

function channelTileEls() {
  return Array.from(document.querySelectorAll('.channel-tile'));
}

// Re-apply each rendered card's view in place. In place, not a rebuild: the
// strip is on screen while someone is browsing it, and replacing the elements
// every second would throw focus back to the start of the rail once a second.
function tickChannels() {
  var elapsed = elapsedSeconds();
  channelTileEls().forEach(function(el) {
    [STATE.channelsById[el.getAttribute('data-channel')]].filter(Boolean).forEach(function(line) {
      applyChannelView(el, channelCardView(line, elapsed));
    });
  });
}

function startTick() {
  clearInterval(tickTimer);
  tickTimer = setInterval(tickChannels, TICK_MS);
}

// The page's poll landed: swap the lines in and let the next tick redraw. Kept
// separate from renderBrowse so a refresh never rebuilds the sidebar or moves
// focus — a channel rolling over to its next programme entry should change what
// a card says and nothing else.
export function updateChannels(lines) {
  STATE.channels = lines;
  STATE.channelsById = channelsById(lines);
  STATE.channelsAt = Date.now();
  tickChannels();
}

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
// TASK-595 — Right enters the bottom-right cluster. It is the second of the two
// ways in, and like the first it was a press that did nothing before: this table
// mapped Down and Left only.
export function profileArrow(e) {
  e.preventDefault();
  var PMOVE = {
    ArrowDown: focusFirstTile,
    ArrowLeft: focusActiveTab,
    ArrowRight: function() { enterCluster(0); }
  };
  [PMOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
}

// Downward from the rails: step a rail, or — off the LAST one — leave for the
// bottom-right cluster (TASK-595). That press did nothing before: there is no
// rail below, so focusCol was handed an absent row and returned without moving.
// The column travels with it, so ▲ comes back to the tile it left rather than to
// the start of the row.
function downFromRail(rows, railIdx, col) {
  ({ true: function() { enterCluster(col); }, false: function() { focusCol(rows[railIdx + 1], col); } })[railIdx + 1 >= rows.length]();
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
    ArrowDown:  function() { downFromRail(rows, railIdx, col); }
  };
  [railIdx].filter(function() { return railIdx >= 0; }).forEach(function() {
    [MOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
  });
}

// ── TASK-595 (FEAT-526): the cluster, and the play menu inside it ────────────
// #queue-actions floats bottom-right and holds the Guide, Search and the ▶ play
// menu. All three were click-only, and btn-search is the only way into Search —
// so from the couch the entire Search surface was unreachable, not merely
// awkward. It is a fifth zone here, beside topbar / toggle / sidebar / rails.
//
// A stop is a control that is actually on screen and would actually do
// something: btn-guide and btn-play-all are shown per tab by style.display, and
// a Continue button with nothing to continue carries the real `disabled`
// attribute. Both are skipped the way the video player skips a disabled
// transport control, so a walk never lands somewhere a press does nothing.
function visibleStops(sel) {
  return Array.from(document.querySelectorAll(sel))
    .filter(function(b) { return b.offsetParent !== null; })
    .filter(function(b) { return !b.disabled; });
}

// The cluster's own controls — everything but the menu's contents, which are a
// zone of their own while it is open.
export function clusterStops() {
  return visibleStops('#queue-actions button').filter(function(b) { return !b.closest('#queue-menu'); });
}

export function menuStops() {
  return visibleStops('#queue-menu button');
}

// No wrap at either end: a cluster of two or three controls is read as a row
// with edges, and wrapping a three-stop row reads as the focus jumping.
function focusStop(stops, i) {
  [stops[i]].filter(Boolean).forEach(function(b) { b.focus(); });
}

export function enterCluster(col) {
  STATE.railCol = col;
  focusStop(clusterStops(), 0);
}

function focusBottomRail() {
  var rows = allRows();
  focusCol(rows[rows.length - 1], STATE.railCol);
}

// Cluster zone: Left/Right walk the controls, Up returns to the bottom rail.
// Down is the edge — the cluster is the last thing on the screen.
export function clusterArrow(e) {
  e.preventDefault();
  var stops = clusterStops();
  var i = stops.indexOf(document.activeElement);
  var CMOVE = {
    ArrowLeft:  function() { focusStop(stops, i - 1); },
    ArrowRight: function() { focusStop(stops, i + 1); },
    ArrowUp:    focusBottomRail,
    ArrowDown:  function() {}
  };
  [CMOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
}

// Play-menu zone: an overlay for as long as it is open, so Up/Down walk its
// buttons and Left/Right do nothing — the cluster behind it is reached by
// closing it, not by walking off its edge.
export function menuArrow(e) {
  e.preventDefault();
  var stops = menuStops();
  var i = stops.indexOf(document.activeElement);
  var MMOVE = {
    ArrowUp:   function() { focusStop(stops, i - 1); },
    ArrowDown: function() { focusStop(stops, i + 1); }
  };
  [MMOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
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

// Checked before clusterZone — #queue-menu lives inside #queue-actions, so the
// more specific match must win (the same reason toggleZone precedes sidebarZone).
function menuZone() {
  return [document.activeElement.closest('#queue-menu')].filter(Boolean).map(function() { return 'menu'; });
}

function clusterZone() {
  return [document.activeElement.closest('#queue-actions')].filter(Boolean).map(function() { return 'cluster'; });
}

function zoneOf() {
  return topbarZone().concat(toggleZone()).concat(sidebarZone()).concat(menuZone()).concat(clusterZone()).concat(['rails'])[0];
}

var ZONE = { toggle: toggleArrow, sidebar: sidebarArrow, rails: railArrow, topbar: profileArrow, cluster: clusterArrow, menu: menuArrow };

// Single d-pad entry point — routes the arrow to the zone holding focus.
export function browseArrow(e) {
  ZONE[zoneOf()](e);
}

function noop() {}

// TASK-594 (FEAT-526) — Home is one layer up. On browse the section is the layer
// above a rail and browse is the top, so the rails and the cluster step to the lit
// tab and every other zone is the ceiling. The profile picker is reached by
// pressing the profile control, never by pressing Home once too often. An open
// play menu or Search panel handles Home itself and stops it before it gets here,
// so one press closes the overlay and nothing more.
var HOME = { toggle: noop, sidebar: noop, rails: focusActiveTab, topbar: noop, cluster: focusActiveTab, menu: noop };

export function browseHome(e) {
  e.preventDefault();
  HOME[zoneOf()]();
}

// FEAT-039 (TASK-235) — the Playlists rail heading carries a subtle ＋ button to
// the right of the title ("Playlists ＋"); the rail body now holds only real
// playlists (the old "＋ New Playlist" tile is gone). A plain clickable button —
// creation is driven by mouse (desktop) or the companion (TV), so it needs no
// d-pad focus stop. Opens the existing create flow (STATE.onCreatePlaylist).
// TASK-378: the same heading ＋ also attaches to the Music Videos tab's own
// Playlists rail (`mv-playlists`) — STATE.onCreatePlaylist itself decides which
// collectionType the new playlist gets (screen-browse-page, keyed off the active
// tab), this button stays rail-id-agnostic.
function createPlaylistBtn() {
  var b = document.createElement('button');
  b.className = 'rail-create';
  b.setAttribute('data-create-playlist', '');
  b.setAttribute('aria-label', 'New playlist');
  b.textContent = '＋';
  b.addEventListener('click', STATE.onCreatePlaylist);
  return b;
}

var PLUS_RAIL = { playlists: true, 'mv-playlists': true };

// A channel card is built by its own renderer (components/tile.js), never
// createTile — createTile's bar comes from watch progress, and a channel's comes
// from the schedule. core's tileVariant picks, so this is a plain lookup.
var TILE_BUILDER = {
  channel: function(card) {
    return createChannelTile(STATE.server, card, { elapsedSeconds: elapsedSeconds(), onSelect: STATE.onSelect });
  },
  library: function(card) {
    return createTile(STATE.server, card, { progress: STATE.progress, onSelect: STATE.onSelect, onQueue: STATE.onQueue });
  }
};

function buildTile(card) {
  return TILE_BUILDER[tileVariant(card)](card);
}

function railSection(rail) {
  var section = document.createElement('div');
  section.className = 'rail';
  var h = document.createElement('div');
  h.className = 'rail-title';
  h.textContent = rail.title;
  [rail.id].filter(function(id) { return PLUS_RAIL[id]; }).forEach(function() { h.appendChild(createPlaylistBtn()); });
  section.appendChild(h);
  var row = document.createElement('div');
  row.className = 'rail-row';
  row.setAttribute('data-rail', rail.id);
  // Music tiles are square (taller) — give their rail extra vertical room so the
  // focus scale (1.05) isn't clipped by the row's overflow.
  row.classList.toggle('rail-row-music', rail.items.some(function(card) { return card.section === 'music'; }));
  rail.items.forEach(function(card) { row.appendChild(buildTile(card)); });
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
// initial render and whenever a sidebar tab gains focus. core's railsForSection
// augments Music/Music Videos with their own always-present (possibly empty)
// Playlists rail (TASK-378, shared with the companion — TASK-424) so the TV
// always renders the "Playlists ＋" heading there; other tabs pass through as-is.
// TASK-445 — onTabChange lets the page show/hide a tab-scoped control (Play
// All) without this module knowing what Play All is; fires on every select,
// including the initial one, so the page's first render is already correct.
// TASK-563 — core resolves which rails a tab holds, because Channels' come
// from the /api/channels strip rather than the catalog. Reads the active tab
// selectTab has just set, so this screen keeps no section branch of its own.
function railsFor() {
  return railsForBrowseSection(STATE.activeTab, STATE.cards, STATE.cw, STATE.labels, STATE.recents, STATE.channels);
}

function selectTab(tabId) {
  STATE.activeTab = tabId;
  markActive(tabId);
  renderRailRows(railsFor());
  [STATE.onTabChange].filter(Boolean).forEach(function(fn) { fn(tabId); });
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
// TASK-563 — `channels` is the /api/channels strip (possibly empty). It adds
// the Channels tab, first in the sidebar and the tab browse lands on; with none
// there is no tab and browse behaves exactly as it did (story 6). `requestedTab`
// is an explicit ?tab= and `lastTab` the remembered one — core's landingTab
// settles which of the three wins.
export function renderBrowse(server, cards, cwRows, labels, profile, person, onSelect, requestedTab, onQueue, onCreatePlaylist, recents, onTabChange, channels, lastTab) {
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
  STATE.onTabChange = onTabChange;
  STATE.channels = channels;
  STATE.channelsById = channelsById(channels);
  STATE.channelsAt = Date.now();
  document.getElementById('profile-label').textContent = personGlyph(person) + ' ' + person.name + ' ▸';
  var tabs = withChannelsTab(buildTabs(cards), channels);
  var ids = tabs.map(function(t) { return t.id; });
  renderSidebar(tabs);
  selectTab([landingTab(ids, requestedTab, lastTab, channels)].filter(Boolean).concat(['films'])[0]);
  startTick();
  focusFirstTile();
}

export function setup() {
  registerScreen('screen-browse', {
    onEnter: focusFirstTile,
    keys: { ArrowLeft: browseArrow, ArrowRight: browseArrow, ArrowUp: browseArrow, ArrowDown: browseArrow, Escape: browseHome },
    remote: {}
  });
}
