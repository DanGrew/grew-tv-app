import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadBrowse, loadContinueWatching } from '../../core/app-api.js';
import { screenPage, filterByTitle, tileHint } from '../../core/companion-utils.js';
import { progressMapFromCW } from '../../core/progress.js';
import { buildTabs, buildTabRails } from '../../core/home-rails.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';

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

  function railList() { return buildTabRails(state.section, state.cards, state.cw, state.labels); }

  // The picked rail (its tiles), or an empty stand-in so callers stay branch-free.
  function activeRail() {
    return [railList().filter(function(r) { return r.id === state.rail; })[0]]
      .filter(Boolean).concat([{ title: '', items: [] }])[0];
  }

  // Bare text-label tile: title + an optional resume-percent badge, no poster.
  function txtTile(card) {
    var hint = tileHint(state.progress, card);
    var el = document.createElement('button');
    el.className = 'ph-txt';
    el.setAttribute('data-id', card.id);
    el.classList.toggle('prog', Boolean(hint));
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

  function renderSections() {
    els.sectionsRow.innerHTML = '';
    filterByTitle(buildTabs(state.cards), state.query).forEach(function(s) { els.sectionsRow.appendChild(sectionChip(s)); });
  }

  function renderRails() {
    els.railsRow.innerHTML = '';
    filterByTitle(railList(), state.query).forEach(function(r) { els.railsRow.appendChild(railChip(r)); });
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

  function render() {
    applyLevel();
    renderSections();
    renderRails();
    renderGrid();
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

  // Tapping a tile sends `select`; the app's rail-grid page routes it to the
  // item's detail/player and echoes the new context, which onContext follows to
  // the existing companion L4 screen (no redesign).
  function openItem(card) { api.sendIntent('select', { id: card.id }); }

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
    [snap.profile].filter(Boolean).filter(function(p) { return p !== state.profile; }).forEach(loadCatalog);
    reconcile(snap);
  }

  // Item/leaf contexts (detail/video/audio/profile) are real companion page
  // changes; browse + rail-grid both live on this drill page, so stay put.
  function onContext(payload) {
    var page = screenPage(payload.context_id);
    [page].filter(function(p) { return !DRILL_CTX[p]; }).forEach(function(p) { window.location.href = p + '.html'; });
  }

  // BUG-007: Switch profile drives the TV back to the picker via the same
  // `navigate` intent the breadcrumb uses; the app teleports and echoes a
  // `profile` context, which onContext follows. One path.
  function switchProfile() { api.sendIntent('navigate', switchProfileTarget()); }
  document.getElementById('switch-profile').addEventListener('click', switchProfile);

  api = connect(wsUrl(host), onContext, function(s) { els.connStatus.textContent = s; }, onAppState, onDevices);
  updateBar = mountScreenBar(getApi, setBound);
}
