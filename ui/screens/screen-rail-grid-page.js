import { getParam, getProfile, getPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { gridArrow, renderGrid, focusFirstGridTile } from './screen-rail-grid.js';
import { connectApp } from '../../core/app-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadBrowse, loadContinueWatching, videoPlaybackAction } from '../../core/app-api.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';
import { buildTabs, buildTabRails, cardRoute } from '../../core/home-rails.js';
import { progressMapFromCW } from '../../core/progress.js';

// Backend = page origin, not a hardcoded host (BUG-009 — see screen-video-page).
var SERVER = window.location.origin;

export function initRailGridPage() {
  var section = getParam('section');
  var railId = getParam('rail');
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];

  // id -> browse card, filled once /api/browse resolves. The companion's `select`
  // intent carries only an id, so resolve against the catalog rather than a
  // rendered tile (BUG-008, mirrors the browse page).
  var catalog = {};

  // A video card plays; a series opens its detail; a music card opens album
  // detail; a playlist card opens its own detail (FEAT-036/TASK-205 — the Music
  // tab's Playlists rail drills here too, so the companion `select` must resolve a
  // playlist, mirroring the browse page). cardRoute (core) picks by the server
  // `section`/`collectionType`, never a type enum. A CW episode tile carries
  // `series` (its owning collection) so the player can run Next/Prev from a tile
  // launch (BUG-005); a film has none and navTo drops it.
  var SELECT = {
    artist:   function(card) { navTo('artist.html', { artist: card.artist }); },
    album:    function(card) { navTo('album-detail.html', { album: card.id }); },
    playlist: function(card) { navTo('playlist-detail.html', { playlist: card.id }); },
    video:    function(card) { navTo('video.html', { video: card.id, from: 'grid', series: card.series }); },
    series:   function(card) { navTo('detail.html', { series: card.id }); }
  };
  function onSelect(card) {
    [SELECT[cardRoute(card)]].filter(Boolean).forEach(function(fn) { fn(card); });
  }

  // FEAT-040: film tile ＋Queue (mirrors the browse page) — POST queue-video per
  // person + a transient toast. Films only (createTile gates on video kind).
  var statusTimer = null;
  function hideStatus() { document.getElementById('queue-status').style.display = 'none'; }
  function showStatus(text) {
    var el = document.getElementById('queue-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(hideStatus, 2500);
  }
  function onQueue(card) {
    videoPlaybackAction(SERVER, 'queue-video', getPerson(), { video_id: card.id })
      .then(function() { showStatus('Queued to Play Next'); })
      .catch(function() {});
  }

  // Back collapses one level — to the section's rails on the browse page.
  function goBack(e) {
    [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); });
    navTo('browse.html', { tab: section });
  }

  var wsApp = connectApp(wsUrl(window.location.hostname), function(intent, params) {
    var INTENTS = {
      navigate_up:    function() { gridArrow({ key: 'ArrowUp',    preventDefault: function() {} }); },
      navigate_down:  function() { gridArrow({ key: 'ArrowDown',  preventDefault: function() {} }); },
      navigate_left:  function() { gridArrow({ key: 'ArrowLeft',  preventDefault: function() {} }); },
      navigate_right: function() { gridArrow({ key: 'ArrowRight', preventDefault: function() {} }); },
      select:         function() {
        var id = [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)[0];
        [catalog[id]].filter(Boolean).forEach(onSelect);
      },
      back:           function() { goBack(null); },
      navigate:       function() { navTo(params.page, params.params); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'rail-grid', section: section, rail: railId });
  // Live snapshot so the companion mirrors this L3 state (TASK-168 reads it).
  wsApp.sendAppState({ screen: 'rail-grid', section: section, rail: railId, profile: profile });

  document.addEventListener('keydown', dispatchKey);

  initPage({
    onEnter: focusFirstGridTile,
    keys: {
      ArrowLeft:  gridArrow,
      ArrowRight: gridArrow,
      ArrowUp:    gridArrow,
      ArrowDown:  gridArrow,
      Escape:     goBack,
      Backspace:  goBack
    },
    remote: {}
  });

  Promise.all([
    loadBrowse(SERVER, profile),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      var browse = res[0];
      var cw = [res[1].content].filter(Boolean).concat([[]])[0];
      var cards = [browse.content].filter(Boolean).concat([[]])[0];
      cards.forEach(function(c) { catalog[c.id] = c; });
      cw.forEach(function(r) { catalog[r.item_id] = [catalog[r.item_id]].filter(Boolean).concat([{ kind: 'video', id: r.item_id, series: r.collection_id }])[0]; });
      var labels = [browse.genreLabels].filter(Boolean).concat([{}])[0];
      var rails = buildTabRails(section, cards, cw, labels);
      var rail = [rails.filter(function(r) { return r.id === railId; })[0]].filter(Boolean).concat([{ title: '', items: [] }])[0];
      var sectionTitle = [buildTabs(cards).filter(function(t) { return t.id === section; })[0]].filter(Boolean).map(function(t) { return t.title; }).concat([section])[0];
      // The rail's tiles can be CW rows (episodes/tracks) the catalog lacks — add
      // a minimal card so a companion `select` on them resolves.
      rail.items.forEach(function(c) { catalog[c.id] = [catalog[c.id]].filter(Boolean).concat([c])[0]; });
      document.getElementById('grid-title').textContent = sectionTitle + ' · ' + rail.title;
      mountBreadcrumb('breadcrumb', buildCrumbs('rail-grid', { sectionId: section, sectionTitle: sectionTitle, railTitle: rail.title }));
      renderGrid(SERVER, rail.items, progressMapFromCW(cw), onSelect, onQueue);
      focusFirstGridTile();
    })
    .catch(function() { navTo('error.html'); });
}
