import { getParam, getProfile, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { buildDetailList, detailArrow, detailLeft, detailRight, focusFirstDetailRow } from './screen-detail.js';
import { connectApp } from '../../core/app-ws.js';
import { loadSeries, loadContinueWatching } from '../../core/app-api.js';
import { progressMapFromCW } from '../../core/progress.js';
import { playNextIndex } from '../../core/series-detail.js';

var SERVER = 'http://localhost:8765';

export function initDetailPage() {
  var seriesId = getParam('series');
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var state = { series: { items: [] }, progress: {} };

  // resume = start where the backend left off (the row default); restart = from 0.
  var PLAY_PARAMS = {
    resume:  function(id) { return { video: id, series: seriesId, from: 'detail' }; },
    restart: function(id) { return { video: id, series: seriesId, from: 'detail', restart: '1' }; }
  };
  function play(item, mode) { navTo('video.html', PLAY_PARAMS[mode](item.video.id)); }
  function onPlayItem(item, i, mode) { play(item, mode); }

  // Header action: the episode after the most-recently-played one (wraps).
  function playNext() {
    var idx = playNextIndex(state.series.items, state.progress);
    [state.series.items[idx]].filter(Boolean).forEach(function(item) { play(item, 'resume'); });
  }

  function goBack(e) { [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); }); navTo('browse.html'); }

  var wsApp = connectApp('ws://localhost:8766', function(intent, params) {
    var INTENTS = {
      navigate_up:   function() { detailArrow({ key: 'ArrowUp',   preventDefault: function() {} }); },
      navigate_down: function() { detailArrow({ key: 'ArrowDown', preventDefault: function() {} }); },
      play_next:     function() { playNext(); },
      play:          function() {
        var id = [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)[0];
        var target = [id].filter(Boolean).map(function(i) { return document.querySelector('.detail-row[data-id="' + i + '"]'); }).filter(Boolean)[0];
        ([target].filter(Boolean).concat([document.activeElement]))[0].click();
      },
      back:          function() { goBack(null); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'detail', series_id: seriesId });
  // Live snapshot so the companion renders this series' context (TASK-118).
  wsApp.sendAppState({ screen: 'detail', itemId: seriesId, profile: profile });

  document.getElementById('btn-back-detail').addEventListener('click', goBack);
  document.getElementById('btn-play-next').addEventListener('click', playNext);
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
    loadSeries(SERVER, seriesId),
    loadContinueWatching(SERVER, profile).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      state.series = res[0];
      state.progress = progressMapFromCW(res[1].content);
      buildDetailList(SERVER, state.series, state.progress, onPlayItem);
      focusFirstDetailRow();
    })
    .catch(function() { navTo('error.html'); });
}
