import { getParam, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-video-player.js';
import { connectApp } from '../../core/app-ws.js';
import { loadManifest } from '../../core/app-manifest.js';

var SERVER = 'http://localhost:8765';
var VIDEO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
var SKIP_ACTIONS = [
  'skip_back_10', 'skip_back_30', 'skip_back_120', 'skip_back_300', 'skip_back_900', 'skip_back_1800',
  'skip_fwd_10', 'skip_fwd_30', 'skip_fwd_120', 'skip_fwd_300', 'skip_fwd_900', 'skip_fwd_1800'
];

export function initVideoPage() {
  var filmId = getParam('film');
  var from   = [getParam('from')].filter(Boolean).concat(['browse'])[0];
  var filmData = null;
  var wsApp = null;
  var player;

  player = setupPlayer({
    video: document.getElementById('video'),
    contentBase: '',
    onStop: function() {
      var STOP_NAV = {
        detail: function() { navTo('detail.html', { film: filmId }); },
        browse: function() { navTo('browse.html'); }
      };
      [STOP_NAV[from]].filter(Boolean).forEach(function(fn) { fn(); });
      [!STOP_NAV[from]].filter(Boolean).forEach(function() { navTo('browse.html'); });
    },
    onNext: function() {
      var idx = parseInt([getParam('item')].filter(Boolean).concat(['0'])[0]);
      [filmData].filter(Boolean).forEach(function(f) {
        [f.items[idx + 1]].filter(Boolean).forEach(function() {
          navTo('video.html', { film: filmId, item: idx + 1, from: from });
        });
      });
    },
    onPrev: function() {
      var idx = parseInt([getParam('item')].filter(Boolean).concat(['0'])[0]);
      [filmData].filter(Boolean).forEach(function(f) {
        [f.items[idx - 1]].filter(Boolean).forEach(function() {
          navTo('video.html', { film: filmId, item: idx - 1, from: from });
        });
      });
    },
    onIntent: function(intent) {
      var VIDEO_CTX = { play: true, video: true };
      [wsApp].filter(Boolean).forEach(function(ws) {
        [VIDEO_CTX[intent]].filter(Boolean).forEach(function() {
          ws.sendContext({ context_id: 'video', actions: SKIP_ACTIONS, display: player.currentVideoDisplay() });
        });
        [intent === 'resume_prompt'].filter(Boolean).forEach(function() {
          ws.sendContext({ context_id: 'resume_prompt' });
        });
      });
    }
  });

  var keys = {};
  VIDEO_KEYS.forEach(function(k) { keys[k] = player.handleVideoKey; });
  initPage({ onEnter: function() { document.getElementById('btn-play-pause').focus(); }, keys: keys, remote: player.remote });

  wsApp = connectApp('ws://localhost:8766', function(intent, params) {
    [player.remote[intent]].filter(Boolean).forEach(function(fn) { fn(params); });
  });

  document.addEventListener('keydown', dispatchKey);

  loadManifest(SERVER)
    .then(function(manifest) {
      var film = manifest.content.filter(function(f) { return f.id === filmId; })[0];
      [!film].filter(Boolean).forEach(function() { navTo('error.html'); });
      [film].filter(Boolean).forEach(function(f) {
        filmData = f;
        player.updateContentBase(manifest.contentBase);
        var itemIdx = parseInt([getParam('item')].filter(Boolean).concat(['0'])[0]);
        player.playFilm(f, f.items[itemIdx], from);
      });
    })
    .catch(function() { navTo('error.html'); });
}
