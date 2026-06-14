import { getParam, getProfile, getPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { buildDetailList, detailArrow, detailLeft, detailRight, focusFirstDetailRow } from './screen-detail.js';
import { connectApp } from '../../core/app-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadSeries, loadContinueWatching, resetProgress } from '../../core/app-api.js';
import { progressMapFromCW } from '../../core/progress.js';
import { primaryAction, playNextLabel } from '../../core/series-detail.js';
import { collectionMetaLine } from '../../core/detail-view.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// Backend = page origin, not a hardcoded host (BUG-009 — see screen-video-page).
var SERVER = window.location.origin;

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

  // Reset (TASK-142): wipe this episode's backend progress, then re-pull
  // Continue-Watching and re-render so its resume bar / RESUME tag clear. Re-focus
  // the same row after the rebuild so the d-pad position is kept.
  function focusRow(id) {
    [document.querySelector('.detail-row[data-id="' + id + '"]')].filter(Boolean).forEach(function(r) { r.focus(); });
  }
  function rerender(focusId, content) {
    state.progress = progressMapFromCW(content);
    document.getElementById('btn-play-next').textContent = '▶ ' + playNextLabel(state.series.items, state.progress);
    buildDetailList(SERVER, state.series, state.progress, onPlayItem, onResetItem);
    focusRow(focusId);
  }
  function refreshProgress(focusId) {
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; })
      .then(function(cw) { rerender(focusId, cw.content); });
  }
  function onResetItem(item) {
    resetProgress(SERVER, item.video.id, getPerson()).then(function() { refreshProgress(item.video.id); });
  }

  // Header action: continue the most-recent episode while it is still mid-watch,
  // otherwise the next one (wraps at the series end). Resume mode replays from the
  // backend position — the mid-watch point for continue, 0 for a fresh episode.
  function playNext() {
    var idx = primaryAction(state.series.items, state.progress).index;
    [state.series.items[idx]].filter(Boolean).forEach(function(item) { play(item, 'resume'); });
  }

  function goBack(e) { [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); }); navTo('browse.html'); }

  var wsApp = connectApp(wsUrl(window.location.hostname), function(intent, params) {
    var INTENTS = {
      navigate_up:   function() { detailArrow({ key: 'ArrowUp',   preventDefault: function() {} }); },
      navigate_down: function() { detailArrow({ key: 'ArrowDown', preventDefault: function() {} }); },
      play_next:     function() { playNext(); },
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
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      state.series = res[0];
      state.progress = progressMapFromCW(res[1].content);
      mountBreadcrumb('breadcrumb', buildCrumbs('detail', { seriesId: seriesId, seriesTitle: state.series.title }));
      document.getElementById('detail-meta').textContent = collectionMetaLine(state.series);
      document.getElementById('btn-play-next').textContent = '▶ ' + playNextLabel(state.series.items, state.progress);
      buildDetailList(SERVER, state.series, state.progress, onPlayItem, onResetItem);
      focusFirstDetailRow();
    })
    .catch(function() { navTo('error.html'); });
}
