import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadBrowse, loadContinueWatching, mediaUrl } from '../../core/app-api.js';
import { screenPage, filterByTitle } from '../../core/companion-utils.js';
import { buildTabs, buildTabRails } from '../../core/home-rails.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';

// Companion Home (TASK-117 + FEAT-020/TASK-139): a content-type tab strip
// (Continue / Series / Films / Home Movies) mirroring the app, each tab showing
// that type's rails — genre rails for Series/Films, person rails for Home
// Movies, the resume feed for Continue — built from the SAME shared
// core/home-rails helpers so app and companion group/order identically. Search
// spans the full catalog (flat grid) and takes over while typing. Tapping a
// tile sends `select`, teleporting the TV.
export function initPage() {
  var host = window.location.hostname;
  var server = 'http://' + host + ':8765';
  var els = {
    connStatus: document.getElementById('conn-status'),
    search: document.getElementById('search'),
    tabs: document.getElementById('tabs'),
    railsSection: document.getElementById('rails-section'),
    rails: document.getElementById('rails'),
    searchSection: document.getElementById('search-section'),
    grid: document.getElementById('grid'),
    empty: document.getElementById('empty')
  };
  var state = { profile: null, person: null, cards: [], cw: [], labels: {}, query: '', activeTab: null };
  var api = {};

  // Breadcrumb trail (FEAT-021): Home is the root — a single inert crumb.
  function noNav() {}
  mountCompanionBreadcrumb('breadcrumb', buildCrumbs('browse'), noNav);

  function tap(card) { api.sendIntent('select', { id: card.id }); }

  // Poster <img> with a load-failure fallback: a missing/abortive poster hides
  // the image instead of showing a broken icon (matches the app's tile.js and
  // companion-profile). loading="lazy" keeps off-screen rail posters from all
  // firing at once and saturating the browser's per-origin connection cap.
  function posterImg(poster) {
    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    var src = mediaUrl(server, poster);
    ({
      true: function() {
        img.src = src;
        img.addEventListener('error', function() { img.style.display = 'none'; });
      },
      false: function() { img.style.display = 'none'; }
    })[String(!!src)]();
    return img;
  }

  function tile(card, poster) {
    var btn = document.createElement('button');
    btn.className = 'tile-btn';
    btn.setAttribute('data-id', card.id);
    btn.appendChild(posterImg(poster));
    var span = document.createElement('span');
    span.textContent = [card.title].filter(Boolean).concat([card.id])[0];
    btn.appendChild(span);
    btn.addEventListener('click', function() { tap(card); });
    return btn;
  }

  function railRow(rail) {
    var section = document.createElement('div');
    section.className = 'c-rail';
    var h = document.createElement('div');
    h.className = 'section-title';
    h.textContent = rail.title;
    section.appendChild(h);
    var row = document.createElement('div');
    row.className = 'c-rail-row';
    row.setAttribute('data-rail', rail.id);
    rail.items.forEach(function(card) { row.appendChild(tile(card, card.poster)); });
    section.appendChild(row);
    return section;
  }

  function renderRails() {
    els.rails.innerHTML = '';
    var rails = buildTabRails(state.activeTab, state.cards, state.cw, state.labels);
    rails.forEach(function(rail) { els.rails.appendChild(railRow(rail)); });
  }

  function markTab() {
    Array.from(els.tabs.children).forEach(function(b) { b.classList.toggle('active', b.getAttribute('data-tab') === state.activeTab); });
  }

  function selectTab(id) {
    state.activeTab = id;
    markTab();
    renderRails();
  }

  function tabButton(tab) {
    var b = document.createElement('button');
    b.className = 'c-tab';
    b.setAttribute('data-tab', tab.id);
    b.textContent = tab.title;
    b.addEventListener('click', function() { selectTab(tab.id); });
    return b;
  }

  function renderTabs() {
    els.tabs.innerHTML = '';
    var tabs = buildTabs(state.cards);
    tabs.forEach(function(t) { els.tabs.appendChild(tabButton(t)); });
    selectTab([tabs[0]].filter(Boolean).map(function(t) { return t.id; }).concat(['films'])[0]);
  }

  function renderSearch() {
    els.grid.innerHTML = '';
    var shown = filterByTitle(state.cards, state.query);
    els.empty.style.display = ({ true: 'none', false: 'block' })[shown.length > 0];
    shown.forEach(function(card) { els.grid.appendChild(tile(card, card.poster)); });
  }

  // Search takes over the view while typing; otherwise the tab strip + rails.
  function applyView() {
    var searching = !!state.query.trim();
    els.searchSection.style.display = ({ true: 'block', false: 'none' })[searching];
    els.railsSection.style.display = ({ true: 'none', false: 'block' })[searching];
    ({ true: renderSearch, false: renderRails })[searching]();
  }

  // Render ONCE after both browse + continue-watching settle. Rendering on each
  // callback separately tore the whole tile tree down and rebuilt it twice,
  // aborting and re-issuing every poster request mid-flight — the cause of
  // posters intermittently failing to load on the companion (the app renders
  // once and never hit this). Either fetch failing degrades to an empty set.
  function applyCatalog(b, c) {
    state.cards = [b.content].filter(Boolean).concat([[]])[0];
    state.labels = [b.genreLabels].filter(Boolean).concat([{}])[0];
    state.cw = [c.content].filter(Boolean).concat([[]])[0];
    renderTabs();
    applyView();
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
    applyView();
  });

  // Profile (and thus which catalog to show) comes from the live app snapshot;
  // (re)load when it first arrives or changes. The active person rides the same
  // snapshot (FEAT-026 TASK-158) and keys Continue-Watching per person — captured
  // before the reload so the CW rail carries ?person= again (closes TASK-155).
  function onAppState(snap) {
    state.person = [snap.person].filter(Boolean).concat([state.person])[0];
    [snap.profile].filter(Boolean).filter(function(p) { return p !== state.profile; }).forEach(loadCatalog);
  }

  // Legacy context routing still switches the companion between page files.
  function onContext(payload) {
    var page = screenPage(payload.context_id);
    [page].filter(function(p) { return p !== 'browse'; }).forEach(function(p) { window.location.href = p + '.html'; });
  }

  // BUG-007: Switch profile drives the TV back to the picker via the same
  // `navigate` intent the breadcrumb crumbs use — the app teleports and echoes
  // the `profile` context back, which onContext above then follows. One path.
  function switchProfile() { api.sendIntent('navigate', switchProfileTarget()); }
  document.getElementById('switch-profile').addEventListener('click', switchProfile);

  api = connect(wsUrl(host), onContext, function(s) { els.connStatus.textContent = s; }, onAppState);
}
