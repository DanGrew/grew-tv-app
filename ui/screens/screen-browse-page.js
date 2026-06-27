import { getProfile, getPerson, getParam, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { browseArrow, renderBrowse, getActiveTab } from './screen-browse.js';
import { connectApp } from '../../core/app-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadBrowse, loadContinueWatching, scanDevices, loadConfig } from '../../core/app-api.js';
import { parseConfig, badgePerson } from '../../core/profile-config.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { cardRoute } from '../../core/home-rails.js';
import { mountBreadcrumb } from './breadcrumb.js';

// Backend = page origin, not a hardcoded host (BUG-009 — see screen-video-page).
var SERVER = window.location.origin;
var LAST_TILE_KEY = 'grew-tv:last-tile';
var LAST_TAB_KEY = 'grew-tv:last-tab';
var ACTIVATE_KEYS = { Enter: true, ' ': true };

export function initBrowsePage() {
  function showSettings() {
    document.getElementById('screen-settings').classList.add('active');
    document.getElementById('btn-back-settings').focus();
    var status = document.getElementById('settings-device-status');
    var btn = document.getElementById('btn-refresh');
    status.textContent = 'Scanning…';
    btn.disabled = true;
    btn.textContent = 'Scanning…';
    scanDevices(SERVER)
      .then(function(d) {
        var devices = [d.devices].filter(Array.isArray).concat([[]])[0];
        status.textContent = [devices].filter(function(x) { return x.length; }).map(function(x) { return x.join(', '); }).concat(['No devices found'])[0];
      })
      .catch(function() { status.textContent = 'Server unavailable'; })
      .then(function() { btn.disabled = false; btn.textContent = 'Refresh'; });
  }

  function hideSettings() {
    document.getElementById('screen-settings').classList.remove('active');
    [document.querySelector('.rail-row .film-tile')].filter(Boolean).forEach(function(t) { t.focus(); });
  }

  // BUG-007: the top-right profile control returns to the picker. Activating it
  // navigates the TV to profile.html, whose own load pushes the `profile`
  // context so the companion follows. Re-entering a locked profile re-runs the
  // PIN gate there — no silent re-entry.
  function goToProfile() {
    var t = switchProfileTarget();
    navTo(t.page, t.params);
  }

  var profileLabel = document.getElementById('profile-label');
  profileLabel.addEventListener('click', goToProfile);
  profileLabel.addEventListener('keydown', function(e) {
    [ACTIVATE_KEYS[e.key]].filter(Boolean).forEach(function() { e.preventDefault(); goToProfile(); });
  });

  document.getElementById('btn-settings').addEventListener('click', showSettings);
  document.getElementById('btn-back-settings').addEventListener('click', hideSettings);
  document.getElementById('btn-refresh').addEventListener('click', function() { showSettings(); });
  document.addEventListener('keydown', dispatchKey);
  mountBreadcrumb('breadcrumb', buildCrumbs('browse'));

  initPage({
    onEnter: function() { [document.querySelector('.rail-row .film-tile')].filter(Boolean).forEach(function(t) { t.focus(); }); },
    keys: { ArrowLeft: browseArrow, ArrowRight: browseArrow, ArrowUp: browseArrow, ArrowDown: browseArrow },
    remote: {}
  });

  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];

  // id -> browse card, filled once /api/browse resolves (below). The companion's
  // `select` intent carries only an id, and its tab is decoupled from the app's
  // (the app renders one tab at a time), so the chosen tile is often absent from
  // the live DOM. Resolve against the full catalog instead of a rendered tile —
  // BUG-008: the old querySelector + activeElement.click() fallback re-opened the
  // focused (last-watched) tile whenever the target tile wasn't on the active tab.
  var catalog = {};

  var wsApp = connectApp(wsUrl(window.location.hostname), function(intent, params) {
    var INTENTS = {
      navigate_up:    function() { browseArrow({ key: 'ArrowUp',    preventDefault: function() {} }); },
      navigate_down:  function() { browseArrow({ key: 'ArrowDown',  preventDefault: function() {} }); },
      navigate_left:  function() { browseArrow({ key: 'ArrowLeft',  preventDefault: function() {} }); },
      navigate_right: function() { browseArrow({ key: 'ArrowRight', preventDefault: function() {} }); },
      select:         function() {
        var id = [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)[0];
        [catalog[id]].filter(Boolean).forEach(onSelect);
      },
      back:           function() { navTo('profile.html'); },
      navigate:       function() { navTo(params.page, params.params); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'browse' });
  // Tell the companion the app is on Home (drives its catalog context + profile).
  wsApp.sendAppState({ screen: 'home', profile: profile });

  // A video card plays directly; a series card opens its detail screen. Music
  // (FEAT-027) routes by section: a 'music' card (album/playlist) opens the album
  // detail.
  // A video card carries `series` (its owning collection) when it is a series
  // episode — a Continue Watching tile (BUG-005). Threading it lets the player
  // resolve series context and run Next/Prev even though the episode was opened
  // from a tile, not the series detail. A standalone film has no `series`; navTo
  // drops the undefined param so it stays seriesless.
  var SELECT = {
    artist:   function(card) { navTo('artist.html', { artist: card.artist }); },
    album:    function(card) { navTo('album-detail.html', { album: card.id }); },
    playlist: function(card) { navTo('playlist-detail.html', { playlist: card.id }); },
    video:    function(card) { navTo('video.html', { video: card.id, from: 'browse', series: card.series }); },
    series:   function(card) { navTo('detail.html', { series: card.id }); }
  };

  // cardRoute (core) gives 'album' for a music card else the card's kind;
  // [value].filter(Boolean) guards an unknown route as a no-op rather than a throw.
  function onSelect(card) {
    sessionStorage.setItem(LAST_TILE_KEY, card.id);
    sessionStorage.setItem(LAST_TAB_KEY, getActiveTab());
    [SELECT[cardRoute(card)]].filter(Boolean).forEach(function(fn) { fn(card); });
  }

  Promise.all([
    loadBrowse(SERVER, profile),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; }),
    loadConfig(SERVER).catch(function() { return null; })
  ])
    .then(function(res) {
      var browse = res[0];
      var cw = [res[1].content].filter(Boolean).concat([[]])[0];
      // FEAT-033: badge the bar with the active person's authored name + glyph
      // (e.g. "🦖 Daddy"); falls back to the profile class if config/id is absent.
      var person = badgePerson(parseConfig(res[2]), getPerson(), profile);
      [browse.content].filter(Boolean).concat([[]])[0].forEach(function(c) { catalog[c.id] = c; });
      // Register CW items so a companion `select` on an in-progress tile resolves —
      // episodes are not browse cards, so add a minimal video card for any id the
      // browse catalog doesn't already hold (films keep their full browse card).
      cw.forEach(function(r) { catalog[r.item_id] = [catalog[r.item_id]].filter(Boolean).concat([{ kind: 'video', id: r.item_id, series: r.collection_id }])[0]; });
      var labels = [browse.genreLabels].filter(Boolean).concat([{}])[0];
      // A deep-link / breadcrumb ?tab= (FEAT-028 rail-grid section crumb) wins
      // over the last-visited tab; renderBrowse falls back when neither matches.
      var initialTab = [getParam('tab')].filter(Boolean).concat([sessionStorage.getItem(LAST_TAB_KEY)]).filter(Boolean)[0];
      renderBrowse(SERVER, browse.content, cw, labels, profile, person, onSelect, initialTab);
      [sessionStorage.getItem(LAST_TILE_KEY)].filter(Boolean).map(function(id) { return document.querySelector('.film-tile[data-id="' + id + '"]'); }).filter(Boolean).forEach(function(t) { t.focus(); });
    })
    .catch(function() { navTo('error.html'); });
}
