import { getProfile, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { browseArrow, renderBrowse, getActiveTab } from './screen-browse.js';
import { progressMapFromCW } from '../../core/progress.js';
import { connectApp } from '../../core/app-ws.js';
import { loadBrowse, loadContinueWatching, scanDevices } from '../../core/app-api.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

var SERVER = 'http://localhost:8765';
var LAST_TILE_KEY = 'grew-tv:last-tile';
var LAST_TAB_KEY = 'grew-tv:last-tab';

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

  var wsApp = connectApp('ws://localhost:8766', function(intent, params) {
    var INTENTS = {
      navigate_up:    function() { browseArrow({ key: 'ArrowUp',    preventDefault: function() {} }); },
      navigate_down:  function() { browseArrow({ key: 'ArrowDown',  preventDefault: function() {} }); },
      navigate_left:  function() { browseArrow({ key: 'ArrowLeft',  preventDefault: function() {} }); },
      navigate_right: function() { browseArrow({ key: 'ArrowRight', preventDefault: function() {} }); },
      select:         function() {
        var id = [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)[0];
        var target = [id].filter(Boolean).map(function(i) { return document.querySelector('.film-tile[data-id="' + i + '"]'); }).filter(Boolean)[0];
        ([target].filter(Boolean).concat([document.activeElement]))[0].click();
      },
      back:           function() { navTo('profile.html'); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'browse' });
  // Tell the companion the app is on Home (drives its catalog context + profile).
  wsApp.sendAppState({ screen: 'home', profile: profile });

  // A video card plays directly; a series card opens its detail screen.
  var SELECT = {
    video:  function(card) { navTo('video.html', { video: card.id, from: 'browse' }); },
    series: function(card) { navTo('detail.html', { series: card.id }); }
  };

  function onSelect(card) {
    sessionStorage.setItem(LAST_TILE_KEY, card.id);
    sessionStorage.setItem(LAST_TAB_KEY, getActiveTab());
    SELECT[card.kind](card);
  }

  Promise.all([
    loadBrowse(SERVER, profile),
    loadContinueWatching(SERVER, profile).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      var browse = res[0];
      var progress = progressMapFromCW(res[1].content);
      var labels = [browse.genreLabels].filter(Boolean).concat([{}])[0];
      renderBrowse(SERVER, browse.content, progress, labels, profile, onSelect, sessionStorage.getItem(LAST_TAB_KEY));
      [sessionStorage.getItem(LAST_TILE_KEY)].filter(Boolean).map(function(id) { return document.querySelector('.film-tile[data-id="' + id + '"]'); }).filter(Boolean).forEach(function(t) { t.focus(); });
    })
    .catch(function() { navTo('error.html'); });
}
