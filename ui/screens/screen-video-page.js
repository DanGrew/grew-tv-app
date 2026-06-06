import { getParam, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-video-player.js';
import { connectApp } from '../../core/app-ws.js';
import { loadVideo, loadNext } from '../../core/app-api.js';

var SERVER = 'http://localhost:8765';
var VIDEO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
var SKIP_ACTIONS = [
  'skip_back_10', 'skip_back_30', 'skip_back_120', 'skip_back_300', 'skip_back_900', 'skip_back_1800',
  'skip_fwd_10', 'skip_fwd_30', 'skip_fwd_120', 'skip_fwd_300', 'skip_fwd_900', 'skip_fwd_1800'
];

export function initVideoPage() {
  var videoId  = getParam('video');
  var seriesId = getParam('series');
  var from     = [getParam('from')].filter(Boolean).concat(['browse'])[0];
  var wsApp = null;
  var player;

  // End-of-video / next: within a series, advance to /api/next; otherwise (a
  // standalone video, or the end of the series) leave playback.
  function advance() {
    [seriesId].filter(Boolean).forEach(function() {
      loadNext(SERVER, seriesId, videoId)
        .then(function(d) {
          [d.next].filter(Boolean).forEach(function(n) { navTo('video.html', { video: n.video.id, series: seriesId, from: from }); });
          [!d.next].filter(Boolean).forEach(function() { player.stop(); });
        })
        .catch(function() { player.stop(); });
    });
    [!seriesId].filter(Boolean).forEach(function() { player.stop(); });
  }

  player = setupPlayer({
    video: document.getElementById('video'),
    server: SERVER,
    onStop: function() {
      var STOP_NAV = {
        detail: function() { navTo('detail.html', { series: seriesId }); },
        browse: function() { navTo('browse.html'); }
      };
      [STOP_NAV[from]].filter(Boolean).forEach(function(fn) { fn(); });
      [!STOP_NAV[from]].filter(Boolean).forEach(function() { navTo('browse.html'); });
    },
    onEnded: advance,
    onNext: advance,
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

  loadVideo(SERVER, videoId)
    .then(function(record) { player.playVideo(record, from); })
    .catch(function() { navTo('error.html'); });
}
