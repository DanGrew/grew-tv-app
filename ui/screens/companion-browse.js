import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadBrowse, loadContinueWatching, videoPlaybackAction, loadVideoPlayback } from '../../core/app-api.js';
import { queueCount } from '../../core/video-player-router.js';
import { screenPage, filterByTitle, tileHint } from '../../core/companion-utils.js';
import { progressMapFromCW } from '../../core/progress.js';
import { buildTabs, buildTabRails } from '../../core/home-rails.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { push as pushTrail, clear as clearTrail, entries as entriesTrail } from '../../core/nav-trail.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { cardRoute } from '../../core/home-rails.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { desyncOpenPage, tileOffDesynced } from '../../core/companion-button-modes.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';

// FEAT-028 / TASK-168 — companion drill-down browse (replaces the flat
// FEAT-020/TASK-139 tab + all-rails + flat-search layout). The companion walks
// four levels — Sections -> Rails -> Grid -> Item — one at a time, TV-led: every
// tap funnels through navigate(), which BOTH emits the existing FEAT-017
// `navigate` intent (the app teleports the TV + echoes context — no new
// protocol) AND optimistically applies the matching local drill, so the view
// re-renders now and never waits a LAN round-trip per tap. The section + rail
// chip rows persist as the breadcrumb (chips = trail); tapping a different chip
// is a sideways jump, Back collapses exactly one level. Tiles are bare text
// labels — zero <img>, so ~0 image requests (posters live on the TV, fixing the
// poster-concurrency "half-loaded" issue). Section + rail chip lists come from
// the SAME shared core/home-rails helpers the app groups by, so the two surfaces
// never drift. L4 (item detail/transport) is the existing companion screen,
// reached when the app echoes the item context after a tile `select`.

// Which rows + Back show at each level. Sections is the root (no Back).
var LEVEL_VIEW = {
  sections: { rails: 'none', grid: 'none', back: 'none' },
  rails:    { rails: '',     grid: 'none', back: '' },
  grid:     { rails: '',     grid: '',     back: '' }
};

// A picked section opens its rails; no section is the root sections level.
var SECTION_LEVEL = { true: 'rails', false: 'sections' };

// Contexts whose screen lives INSIDE this drill page (companion stays put);
// anything else is a real page change the companion follows.
var DRILL_CTX = { browse: true, 'rail-grid': true };

export function initPage() {
  var host = window.location.hostname;
  var server = 'http://' + host + ':8765';
  var els = {
    connStatus: document.getElementById('conn-status'),
    search: document.getElementById('search'),
    drill: document.getElementById('drill'),
    sectionsRow: document.getElementById('sections-row'),
    railsWrap: document.getElementById('rails-wrap'),
    railsRow: document.getElementById('rails-row'),
    gridWrap: document.getElementById('grid-wrap'),
    gridCount: document.getElementById('grid-count'),
    txtgrid: document.getElementById('txtgrid'),
    back: document.getElementById('btn-back')
  };
  var state = {
    profile: null, person: null,
    cards: [], cw: [], labels: {}, progress: {},
    query: '', level: 'sections', section: null, rail: null
  };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }

  function chip(text) {
    var b = document.createElement('button');
    b.className = 'chip';
    b.textContent = text;
    return b;
  }

  function sectionChip(s) {
    var c = chip(s.title);
    c.setAttribute('data-section', s.id);
    c.classList.toggle('active', s.id === state.section);
    // Other sections dim once one is active (mockup L2/L3 breadcrumb styling).
    c.classList.toggle('dim', [state.section].filter(Boolean).filter(function(other) { return other !== s.id; }).length > 0);
    c.addEventListener('click', function() { selectSection(s.id); });
    return c;
  }

  function railChip(r) {
    var c = chip(r.title);
    c.setAttribute('data-rail', r.id);
    c.classList.toggle('active', r.id === state.rail);
    c.addEventListener('click', function() { selectRail(r.id); });
    return c;
  }

  // FEAT-039 (TASK-236) — the companion create affordance now lives INSIDE the
  // Music section, as a subtle ＋ chip in the rails row beside the Playlists rail
  // chip (was a standalone button alongside the top sections row). It's always
  // appended when Music is open, so the first playlist is still creatable even with
  // zero playlists (the Playlists rail chip is omitted when empty). Mirrors the
  // app's TASK-235 ＋-on-the-Playlists-heading affordance.
  function createChip() {
    var c = chip('＋');
    c.classList.add('chip-create');
    c.setAttribute('data-create-playlist', '');
    c.setAttribute('aria-label', 'New playlist');
    c.addEventListener('click', openCreate);
    return c;
  }

  function railList() { return buildTabRails(state.section, state.cards, state.cw, state.labels); }

  // The picked rail (its tiles), or an empty stand-in so callers stay branch-free.
  function activeRail() {
    return [railList().filter(function(r) { return r.id === state.rail; })[0]]
      .filter(Boolean).concat([{ title: '', items: [] }])[0];
  }

  // Transient confirmation toast for ＋ Queue (mirrors the companion-detail
  // producer) — fades after 2.5s; a fresh queue restarts the clock.
  function hideQueueStatus() { document.getElementById('queue-status').style.display = 'none'; }
  function showQueueStatus(text) {
    var el = document.getElementById('queue-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(state.queueTimer);
    state.queueTimer = setTimeout(hideQueueStatus, 2500);
  }

  // FEAT-040 (TASK-250) film ＋ Queue producer: queue a standalone film to the
  // SEPARATE video queue (Play Next). Server-authoritative — POST queue-video per
  // person; per-person POST ⇒ works in BOTH modes (the play tile may grey in
  // Browse, this stays live), and the film shows up on the Video Queue View + TV.
  function queueVideo(id) {
    videoPlaybackAction(server, 'queue-video', state.person, { video_id: id })
      .then(function() { showQueueStatus('Queued to Play Next'); refreshQueue(); })
      .catch(noop);
  }

  // FEAT-040 (Play Queue): when the override queue is non-empty, offer a quick
  // "▶ Play Queue (N)" — tapping it drives the TV player to start the queue head
  // (?playQueue), so you don't have to open a random video to reach the queue. The
  // count is read from the read-only GET snapshot (refreshed on person-load + after
  // queueing here). It drives the TV, so it greys while desynced (Browse).
  function showPlayQueue(count) {
    var btn = document.getElementById('btn-play-queue');
    btn.textContent = '▶ Play Queue (' + count + ')';
    btn.style.display = ({ 'true': 'block', 'false': 'none' })[(count > 0) + ''];
  }
  function refreshQueue() {
    [state.person].filter(Boolean).forEach(function(p) {
      loadVideoPlayback(server, p).then(function(snap) { showPlayQueue(queueCount(snap)); }).catch(noop);
    });
  }
  function onPlayQueue() {
    api.sendIntent('navigate', { page: 'video.html', params: { playQueue: 1, from: 'browse' } });
  }

  // Bare text-label tile: title + an optional resume-percent badge, no poster.
  function nameTile(card) {
    var hint = tileHint(state.progress, card);
    var el = document.createElement('button');
    el.className = 'ph-txt';
    el.setAttribute('data-id', card.id);
    el.classList.toggle('prog', Boolean(hint));
    // Desynced: grey tiles we can't open on our own (artist/playlist pages aren't
    // desync-aware yet; a bare film only plays). Safe-by-default — no dead clicks.
    el.classList.toggle('desync-off', tileOffDesynced(cardRoute(card), mode.isDesynced()));
    var nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = [card.title].filter(Boolean).concat([card.id])[0];
    el.appendChild(nm);
    [hint].filter(Boolean).forEach(function(h) {
      var b = document.createElement('span');
      b.className = 'pct';
      b.textContent = h;
      el.appendChild(b);
    });
    el.addEventListener('click', function() { openItem(card); });
    return el;
  }

  // A film tile gains a sibling ＋ Queue control (TASK-250 fills the gap: a
  // standalone film has no detail-row list, so this is its only queue affordance).
  // The control stays live in Browse (per-person POST), unlike the play tile.
  function filmQueueBtn(card) {
    var b = document.createElement('button');
    b.className = 'ph-cell-queue';
    b.setAttribute('data-queue', card.id);
    b.setAttribute('aria-label', 'Queue');
    b.textContent = '＋ Queue';
    b.addEventListener('click', function() { queueVideo(card.id); });
    return b;
  }
  function filmCell(card) {
    var cell = document.createElement('div');
    cell.className = 'ph-txt-cell';
    cell.appendChild(nameTile(card));
    cell.appendChild(filmQueueBtn(card));
    return cell;
  }

  // Only a standalone film/video gets the ＋ Queue cell; series/album/artist/
  // playlist tiles route to their own pages (and series already queue per-episode
  // from the detail screen). cardRoute(card)==='video' marks a film.
  var CELL = { 'true': filmCell, 'false': nameTile };
  function txtTile(card) { return CELL[String(cardRoute(card) === 'video')](card); }

  function renderSections() {
    els.sectionsRow.innerHTML = '';
    filterByTitle(buildTabs(state.cards), state.query).forEach(function(s) { els.sectionsRow.appendChild(sectionChip(s)); });
  }

  function renderRails() {
    els.railsRow.innerHTML = '';
    filterByTitle(railList(), state.query).forEach(function(r) { els.railsRow.appendChild(railChip(r)); });
    [state.section].filter(function(s) { return s === 'music'; }).forEach(function() { els.railsRow.appendChild(createChip()); });
  }

  function renderGrid() {
    els.txtgrid.innerHTML = '';
    var items = filterByTitle(activeRail().items, state.query);
    els.gridCount.textContent = items.length + ' items';
    items.forEach(function(c) { els.txtgrid.appendChild(txtTile(c)); });
  }

  function sectionTitle() {
    return [buildTabs(state.cards).filter(function(t) { return t.id === state.section; })[0]]
      .filter(Boolean).map(function(t) { return t.title; }).concat([state.section])[0];
  }

  function railTitle() { return [activeRail().title].filter(Boolean).concat([''])[0]; }

  // The FEAT-021 trail, per level: Home (sections) -> Home > Section (rails) ->
  // Home > Section > Rail (grid). Reuses core/breadcrumb.js so it styles + wires
  // for free (a crumb tap routes back through navigate()).
  function crumbModel() {
    var ctx = { sectionId: state.section, sectionTitle: sectionTitle(), railTitle: railTitle() };
    var BY_LEVEL = {
      sections: function() { return buildCrumbs('browse'); },
      rails:    function() { return buildCrumbs('detail', { seriesTitle: sectionTitle() }); },
      grid:     function() { return buildCrumbs('rail-grid', ctx); }
    };
    return BY_LEVEL[state.level]();
  }

  function applyLevel() {
    var v = LEVEL_VIEW[state.level];
    els.railsWrap.style.display = v.rails;
    els.gridWrap.style.display = v.grid;
    els.back.style.display = v.back;
  }

  // FEAT-032 (TASK-218): persist the drill position so returning to browse — Back,
  // or a player's breadcrumb — lands where you were (the items), not the sections
  // root. The trail holds ONE browse entry = the current level; sections clears it
  // (top = no trail). nav-trail is sessionStorage-backed, so it survives the page
  // load when the companion follows the TV back onto browse.html.
  function recordTrail() {
    ({ sections: clearTrail, rails: recordRails, grid: recordGrid })[state.level]();
  }
  function recordRails() { writeTrail({ tab: state.section }, sectionTitle()); }
  function recordGrid() { writeTrail({ tab: state.section, rail: state.rail }, railTitle()); }
  function writeTrail(params, label) {
    clearTrail();
    pushTrail({ page: 'browse.html', params: params, label: label });
  }

  // On load, seed the level/section/rail from the recorded trail (if any) before
  // the first render; an empty trail leaves the default sections root. reconcile()
  // is guarded on level==='sections', so a restored grid is not clobbered by a
  // late TV echo.
  function restoreTrail() {
    [browseTrailEntry()].filter(Boolean).forEach(seedFromTrail);
  }
  // Restore from THIS page's own browse.html entry — a deeper artist.html entry
  // can sit on top of it (recorded by the artist page), and that one has no
  // tab/rail so it would read as the sections root. The stale top is wiped by the
  // next recordTrail() (clear+push) once browse renders.
  function browseTrailEntry() {
    return entriesTrail().filter(function(e) { return e.page === 'browse.html'; }).slice(-1)[0];
  }
  function seedFromTrail(entry) {
    state.section = [entry.params.tab].filter(Boolean).concat([null])[0];
    state.rail = [entry.params.rail].filter(Boolean).concat([null])[0];
    state.level = ({ true: 'grid', false: SECTION_LEVEL[Boolean(entry.params.tab)] })[Boolean(entry.params.rail)];
  }

  // Seeding the level locally is not enough: a tile tap emits `select`, which the
  // TV's rail-grid page routes — so the TV must be ON that rail-grid or the tap is
  // dropped (the companion shows the restored grid but presses do nothing until a
  // tab switch re-syncs). So once bound (first app_state), drive the TV to the
  // restored position through the same navigate() funnel a drill uses. Fire once.
  var restoreDriven = false;
  function driveRestore() {
    ({ 'false': doDriveRestore, 'true': function() {} })[String(restoreDriven)]();
  }
  function doDriveRestore() {
    restoreDriven = true;
    [browseTrailEntry()].filter(Boolean).forEach(function(entry) {
      api.sendIntent('navigate', ({ true: { page: 'rail-grid.html', params: { section: entry.params.tab, rail: entry.params.rail } }, false: { page: 'browse.html', params: { tab: entry.params.tab } } })[Boolean(entry.params.rail)]);
    });
  }

  // FEAT-036 (TASK-209) — the companion's create affordance links to the companion
  // create page, carrying the live profile so its picker preselects. TASK-236 moved
  // its trigger from a standalone section-level button to the ＋ rails-row chip
  // (createChip, rendered in renderRails when Music is open).
  function openCreate() {
    window.location.href = 'playlist-create.html?profile=' + encodeURIComponent([state.profile].filter(Boolean).concat(['adults'])[0]);
  }
  document.getElementById('btn-play-queue').addEventListener('click', onPlayQueue);

  // Switch-profile drives the TV, so it greys out while desynced (the WS layer
  // already no-ops its intent; this is the visible half — no dead click).
  function applyMode() {
    document.getElementById('switch-profile').classList.toggle('desync-off', mode.isDesynced());
    document.getElementById('btn-play-queue').classList.toggle('desync-off', mode.isDesynced());
  }

  function render() {
    applyLevel();
    applyMode();
    renderSections();
    renderRails();
    renderGrid();
    recordTrail();
    mountCompanionBreadcrumb('breadcrumb', crumbModel(), navigate);
  }

  // The single funnel for every drill move: emit the FEAT-017 `navigate` intent
  // (drives + mirrors the TV) AND optimistically apply the matching local drill,
  // so the companion re-renders now and never blocks on the LAN echo.
  function navigate(page, params) {
    api.sendIntent('navigate', { page: page, params: params });
    localApply(page, params);
  }

  function applyDrill(tab) {
    state.section = [tab].filter(Boolean).concat([null])[0];
    state.rail = null;
    state.level = SECTION_LEVEL[Boolean(tab)];
    render();
  }

  function applyGrid(section, rail) {
    state.section = section;
    state.rail = rail;
    state.level = 'grid';
    render();
  }

  function localApply(page, params) {
    var TARGET = {
      'browse.html':    function() { applyDrill(params.tab); },
      'rail-grid.html': function() { applyGrid(params.section, params.rail); }
    };
    [TARGET[page]].filter(Boolean).forEach(function(fn) { fn(); });
  }

  function selectSection(id) { navigate('browse.html', { tab: id }); }
  function selectRail(id) { navigate('rail-grid.html', { section: state.section, rail: id }); }

  // Tapping a tile. SYNCED: send `select`; the app's rail-grid routes it to the
  // item's detail/player and echoes the new context, which onContext follows to
  // the existing companion L4 screen (no redesign). DESYNCED: open the item's
  // page locally — detail (series/album), playlist, or artist per the card's
  // route — carrying the id so that page self-loads without the TV. A
  // non-openable card (film) is a no-op (its tile is greyed).
  function openItemLocal(card) {
    var page = desyncOpenPage(cardRoute(card));
    [page].filter(Boolean).forEach(function(p) { window.location.href = p + '?id=' + encodeURIComponent(card.id); });
  }
  function openItem(card) {
    ({ true: function() { openItemLocal(card); }, false: function() { api.sendIntent('select', { id: card.id }); } })[mode.isDesynced()]();
  }

  // Back collapses exactly one level: grid -> its section's rails, rails -> the
  // root sections. Each step drives the TV through the same navigate() funnel.
  function back() {
    var BACK = {
      grid:  function() { navigate('browse.html', { tab: state.section }); },
      rails: function() { navigate('browse.html', {}); }
    };
    [BACK[state.level]].filter(Boolean).forEach(function(fn) { fn(); });
  }
  els.back.addEventListener('click', back);

  // Render ONCE after both browse + continue-watching settle (the FEAT-020
  // double-render request storm is moot here — text-only — but a single render
  // keeps the optimistic level intact when reconcile drilled ahead of the load).
  function applyCatalog(b, c) {
    state.cards = [b.content].filter(Boolean).concat([[]])[0];
    state.labels = [b.genreLabels].filter(Boolean).concat([{}])[0];
    state.cw = [c.content].filter(Boolean).concat([[]])[0];
    state.progress = progressMapFromCW(state.cw);
    render();
  }

  function loadCatalog(profile) {
    state.profile = profile;
    Promise.all([
      loadBrowse(server, profile).catch(function() { return {}; }),
      loadContinueWatching(server, profile, state.person).catch(function() { return {}; })
    ]).then(function(r) { applyCatalog(r[0], r[1]); });
  }

  els.search.addEventListener('input', function() {
    state.query = els.search.value;
    render();
  });

  // While the companion targets no live screen, hide the drill content and let
  // the screen chooser take over — never a blank page (TASK-179 A2, BUG-013).
  function setBound(bound) {
    var disp = ({ true: '', false: 'none' })[bound];
    els.search.style.display = disp;
    els.drill.style.display = disp;
  }

  // Optimistic-nav reconcile: adopt the app's deep position from its echoed
  // app_state ONLY before the user has drilled locally (fresh load / reconnect
  // while the TV sits on a rail-grid). Once drilling, the companion is the driver
  // and wins, so a late echo can't clobber an in-flight tap.
  function reconcile(snap) {
    [snap].filter(function(s) { return s.screen === 'rail-grid'; })
      .filter(function() { return state.level === 'sections'; })
      .filter(function(s) { return Boolean(s.section); })
      .forEach(function(s) { applyGrid(s.section, s.rail); });
  }

  // Profile (and thus which catalog) rides the live app snapshot; (re)load when
  // it first arrives or changes. The active person rides the same snapshot
  // (FEAT-026 TASK-158) and keys Continue-Watching per person.
  function onAppState(snap) {
    state.person = [snap.person].filter(Boolean).concat([state.person])[0];
    // Read the queue once the person is known (first app_state) — drives the
    // "Play Queue" button's count.
    [state.person].filter(Boolean).filter(function() { return !state.queueFetched; }).forEach(function() {
      state.queueFetched = true; refreshQueue();
    });
    [snap.profile].filter(Boolean).filter(function(p) { return p !== state.profile; }).forEach(loadCatalog);
    // Following the TV's deep position is the inbound nav seam — gated when
    // desynced (FEAT-038). Catalog/person/status still update (display + data).
    ({ true: function() { reconcile(snap); driveRestore(); }, false: noop })[mode.drivesNav()]();
  }

  // Item/leaf contexts (detail/video/audio/profile) are real companion page
  // changes; browse + rail-grid both live on this drill page, so stay put.
  function followContext(payload) {
    var page = screenPage(payload.context_id);
    [page].filter(function(p) { return !DRILL_CTX[p]; }).forEach(function(p) { window.location.href = p + '.html'; });
  }
  // The status strip title rides the context (both modes); only the nav-follow is
  // gated — desynced, the companion stays on its own browse.
  function onContext(payload) {
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
  }

  // BUG-007: Switch profile drives the TV back to the picker via the same
  // `navigate` intent the breadcrumb uses; the app teleports and echoes a
  // `profile` context, which onContext follows. One path.
  function switchProfile() { api.sendIntent('navigate', switchProfileTarget()); }
  document.getElementById('switch-profile').addEventListener('click', switchProfile);

  // Toggle handler: going DESYNCED re-renders to grey TV-driving controls and
  // switch the tile taps to local opens; going SYNCED re-runs the reconnect path
  // (reload) so the companion snaps back to wherever the TV now is.
  // Re-sync = jump to where the TV IS. Clear the local browse trail first, so the
  // reloaded (synced) browse does NOT driveRestore the companion's last drilled
  // spot onto the TV (that stray rail-grid navigate was driving the TV to the
  // Playlists rail + 404ing). With no trail it starts clean and follows the TV.
  function reSync() { clearTrail(); window.location.reload(); }
  function onToggle(desynced) {
    ({ true: render, false: reSync })[desynced]();
  }

  restoreTrail();
  mountSyncBar(mode, onToggle);
  api = connect(wsUrl(host), onContext, function(s) { els.connStatus.textContent = s; }, onAppState, onDevices, { mode: mode });
  updateBar = mountScreenBar(getApi, setBound);
}
