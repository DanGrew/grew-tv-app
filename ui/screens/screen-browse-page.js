import { getProfile, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { browseArrow, buildGrid } from './screen-browse.js';
import { connectApp } from '../../core/app-ws.js';
import { loadManifest, scanDevices } from '../../core/app-manifest.js';

var SERVER = 'http://localhost:8765';

export function initBrowsePage() {
  function showSettings() {
    document.getElementById('screen-settings').classList.add('active');
    document.getElementById('btn-back-settings').focus();
    var status = document.getElementById('settings-device-status');
    var btn = document.getElementById('btn-refresh');
    status.textContent = 'Scanning\u2026';
    btn.disabled = true;
    btn.textContent = 'Scanning\u2026';
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
    [document.querySelector('.film-tile')].filter(Boolean).forEach(function(t) { t.focus(); });
  }

  document.getElementById('btn-settings').addEventListener('click', showSettings);
  document.getElementById('btn-back-settings').addEventListener('click', hideSettings);
  document.getElementById('btn-refresh').addEventListener('click', function() { showSettings(); });
  document.addEventListener('keydown', dispatchKey);

  initPage({
    onEnter: function() { [document.querySelector('.film-tile')].filter(Boolean).forEach(function(t) { t.focus(); }); },
    keys: { ArrowLeft: browseArrow, ArrowRight: browseArrow, ArrowUp: browseArrow, ArrowDown: browseArrow },
    remote: {}
  });

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

  loadManifest(SERVER)
    .then(function(manifest) {
      var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];
      buildGrid(manifest.content, manifest.contentBase, profile, function(film) {
        var TILE_NAV = {
          'true':  function() { navTo('video.html', { film: film.id, item: 0, from: 'browse' }); },
          'false': function() { navTo('detail.html', { film: film.id }); }
        };
        TILE_NAV[film.items.length === 1]();
      });
    })
    .catch(function() { navTo('error.html'); });
}
