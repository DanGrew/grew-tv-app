import { getParam, getProfile, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-audio-player.js';
import { connectApp } from '../../core/app-ws.js';
import { loadAlbum, loadVideo, loadProgress } from '../../core/app-api.js';
import { isMidWatch } from '../../core/progress.js';
import { albumOrder, shuffleOrder, neighborId, trackById } from '../../core/queue.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// FEAT-018 (TASK-130) audio page. Drives the <audio> player over an album queue
// (or a single track). Tracks switch IN PLACE — no per-track navigation — so the
// shuffle order stays stable in memory and playback is continuous. An album is a
// series, so /api/album gives the full track records up front (items[].video);
// the page never re-fetches per track. Backend is the progress source of truth.
var SERVER = window.location.origin;

var RESUME_BY_RESTART = {
  'true':  function() { return 0; },
  'false': function(prog) { return [prog.position_secs].filter(function(p) { return isMidWatch(p, prog.duration_secs); }).concat([0])[0]; }
};
function resumeStart(restart, prog) { return RESUME_BY_RESTART[!!restart + ''](prog); }
var AUDIO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

// Album payload -> {items, title}; a single -> a one-track album wrapping the
// /api/video record. Both feed the same queue model.
var LOAD_QUEUE = {
  'true':  function(albumId) { return loadAlbum(SERVER, albumId).then(function(a) { return { items: a.items, title: a.title, single: false }; }); },
  'false': function(albumId, trackId) { return loadVideo(SERVER, trackId).then(function(v) { return { items: [{ video: v }], title: v.title, single: true }; }); }
};

// shuffle on -> a shuffled permutation; off -> album order. (Pure in core/queue.)
var ORDER_FOR = {
  'true':  function(items) { return shuffleOrder(albumOrder(items)); },
  'false': function(items) { return albumOrder(items); }
};

export function initAudioPage() {
  var albumId  = getParam('album');
  var trackId  = getParam('track');
  var restart  = getParam('restart');
  var from     = [getParam('from')].filter(Boolean).concat(['browse'])[0];
  var profile  = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var wsApp = null;
  var player;
  var state = { items: [], order: [], currentId: trackId, title: '' };

  // Play a track id in place: resolve its full record from the album items and
  // hand it to the player. delta-driven (next/prev/ended) tracks start fresh; the
  // entry track resumes (handled at first play, below).
  function playId(id, startSec) {
    [trackById(state.items, id)].filter(Boolean).forEach(function(rec) {
      state.currentId = id;
      player.playTrack(rec, from, startSec);
    });
  }

  function nextId() { return neighborId(state.order, state.currentId, 1); }
  function prevId() { return neighborId(state.order, state.currentId, -1); }

  // Manual ⏭/⏮ wrap the queue. Autoplay-at-end stops at the last track in the
  // current order rather than looping the album forever.
  function nextNow() { [nextId()].filter(Boolean).forEach(function(id) { playId(id, 0); }); }
  function previous() { [prevId()].filter(Boolean).forEach(function(id) { playId(id, 0); }); }

  var END_ACTION = {
    'true':  function() { player.stop(); },
    'false': function() { playId(nextId(), 0); }
  };
  function advanceAuto() { END_ACTION[(state.currentId === state.order[state.order.length - 1]) + ''](); }

  // Shuffle toggled in the player -> rebuild the upcoming order, keep playing.
  function onShuffle(on) { state.order = ORDER_FOR[on + ''](state.items); }

  function goBackNav() {
    var STOP_NAV = {
      'detail-album': function() { navTo('album-detail.html', { album: albumId }); },
      'browse':       function() { navTo('browse.html'); }
    };
    [STOP_NAV[from]].filter(Boolean).concat([function() { navTo('browse.html'); }])[0]();
  }

  player = setupPlayer({
    audio: document.getElementById('audio'),
    server: SERVER,
    onStop: goBackNav,
    onEnded: advanceAuto,
    onNext: nextNow,
    onPrev: previous,
    onShuffle: onShuffle,
    emitState: function(snap) { [wsApp].filter(Boolean).forEach(function(ws) { ws.sendAppState(snap); }); },
    appContext: function() {
      return { screen: 'player', itemId: [albumId].filter(Boolean).concat([state.currentId])[0], episodeId: state.currentId, profile: profile };
    },
    onIntent: function(intent) {
      var AUDIO_CTX = { play: true, audio: true };
      [wsApp].filter(Boolean).forEach(function(ws) {
        [AUDIO_CTX[intent]].filter(Boolean).forEach(function() {
          ws.sendContext({ context_id: 'audio', display: player.currentTrackDisplay() });
        });
      });
    }
  });

  var keys = {};
  AUDIO_KEYS.forEach(function(k) { keys[k] = player.handleAudioKey; });
  initPage({ onEnter: function() { document.getElementById('btn-play-pause').focus(); }, keys: keys, remote: player.remote });

  function appIntent(intent, params) {
    var EXTRA = { navigate: function() { navTo(params.page, params.params); } };
    var fn = [EXTRA[intent]].filter(Boolean).concat([player.remote[intent]]).filter(Boolean)[0];
    [fn].filter(Boolean).forEach(function(f) { f(params); });
  }
  wsApp = connectApp('ws://localhost:8766', appIntent);
  wsApp.sendContext({ context_id: 'audio' });
  wsApp.sendAppState({ screen: 'player', itemId: [albumId].filter(Boolean).concat([trackId])[0], profile: profile });

  document.addEventListener('keydown', dispatchKey);

  // Entry: load the queue, set the order (initial shuffle from the param), then
  // resume the start track from the backend position. Subsequent tracks start at 0.
  var shuffleParam = !!getParam('shuffle');
  Promise.all([
    LOAD_QUEUE[(!!albumId) + ''](albumId, trackId),
    loadProgress(SERVER, trackId).catch(function() { return { position_secs: 0, duration_secs: null }; })
  ])
    .then(function(res) {
      state.items = res[0].items;
      state.title = res[0].title;
      state.order = ORDER_FOR[shuffleParam + ''](state.items);
      player.setQueueMode(!res[0].single);
      player.setShuffle(shuffleParam);
      mountBreadcrumb('breadcrumb', buildCrumbs('video', { videoTitle: state.title }));
      playId(trackId, resumeStart(restart, res[1]));
    })
    .catch(function() { navTo('error.html'); });
}
