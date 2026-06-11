import { getParam, getProfile, getPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { buildDetailList, detailArrow, detailLeft, detailRight, focusFirstDetailRow } from './screen-detail.js';
import { connectApp } from '../../core/app-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadAlbum, loadContinueWatching } from '../../core/app-api.js';
import { progressMapFromCW } from '../../core/progress.js';
import { playNextIndex } from '../../core/series-detail.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// FEAT-018 (TASK-130) album detail. An album is a series, so this reuses the
// FEAT-017 series-detail render + d-pad nav (buildDetailList + the detailArrow/
// Left/Right helpers) wholesale; only the wiring differs — tracks play in the
// <audio> player (audio.html) not the video player, and the header gains a
// Shuffle action that starts the album shuffled. Track rows reuse items[].episode
// as the track number via episodeLabel.
var SERVER = window.location.origin;

export function initAlbumDetailPage() {
  var albumId = getParam('album');
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var state = { album: { items: [] }, progress: {} };

  // resume = backend position (the row default); restart = from 0. Always carry
  // the album id so the player can build the queue.
  var PLAY_PARAMS = {
    resume:  function(id) { return { album: albumId, track: id, from: 'detail-album' }; },
    restart: function(id) { return { album: albumId, track: id, from: 'detail-album', restart: '1' }; }
  };
  function play(item, mode) { navTo('audio.html', PLAY_PARAMS[mode](item.video.id)); }
  function onPlayItem(item, i, mode) { play(item, mode); }

  // Header Play: the track after the most-recently-played one (wraps), resumed.
  function playFromResume() {
    var idx = playNextIndex(state.album.items, state.progress);
    [state.album.items[idx]].filter(Boolean).forEach(function(item) { play(item, 'resume'); });
  }

  // Header Shuffle: start the album shuffled from its first track (the player
  // builds + holds the shuffled order).
  function shufflePlay() {
    [state.album.items[0]].filter(Boolean).forEach(function(item) {
      navTo('audio.html', { album: albumId, track: item.video.id, shuffle: '1', from: 'detail-album' });
    });
  }

  function goBack(e) { [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); }); navTo('browse.html'); }

  var wsApp = connectApp(wsUrl(window.location.hostname), function(intent, params) {
    var INTENTS = {
      navigate_up:   function() { detailArrow({ key: 'ArrowUp',   preventDefault: function() {} }); },
      navigate_down: function() { detailArrow({ key: 'ArrowDown', preventDefault: function() {} }); },
      play_next:     function() { playFromResume(); },
      shuffle:       function() { shufflePlay(); },
      play:          function() {
        var id = [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)[0];
        var target = [id].filter(Boolean).map(function(i) { return document.querySelector('.detail-row[data-id="' + i + '"]'); }).filter(Boolean)[0];
        ([target].filter(Boolean).concat([document.activeElement]))[0].click();
      },
      back:          function() { goBack(null); },
      navigate:      function() { navTo(params.page, params.params); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'detail', series_id: albumId });
  wsApp.sendAppState({ screen: 'detail', itemId: albumId, profile: profile });

  document.getElementById('btn-back-detail').addEventListener('click', goBack);
  document.getElementById('btn-play-next').addEventListener('click', playFromResume);
  document.getElementById('btn-shuffle').addEventListener('click', shufflePlay);
  document.addEventListener('keydown', dispatchKey);

  initPage({
    onEnter: focusFirstDetailRow,
    keys: {
      Escape:     function(e) { goBack(e); },
      Backspace:  function(e) { goBack(e); },
      ArrowUp:    detailArrow,
      ArrowDown:  detailArrow,
      ArrowLeft:  detailLeft,
      ArrowRight: detailRight
    },
    remote: {}
  });

  Promise.all([
    loadAlbum(SERVER, albumId),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      state.album = res[0];
      state.progress = progressMapFromCW(res[1].content);
      mountBreadcrumb('breadcrumb', buildCrumbs('detail', { seriesId: albumId, seriesTitle: state.album.title }));
      buildDetailList(SERVER, state.album, state.progress, onPlayItem);
      focusFirstDetailRow();
    })
    .catch(function() { navTo('error.html'); });
}
