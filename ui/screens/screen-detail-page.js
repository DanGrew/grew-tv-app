import { getParam, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { buildDetailList, detailArrow, focusFirstDetailRow } from './screen-detail.js';
import { connectApp } from '../../core/app-ws.js';
import { loadSeries } from '../../core/app-api.js';

var SERVER = 'http://localhost:8765';

export function initDetailPage() {
  var seriesId = getParam('series');

  function goBack(e) { [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); }); navTo('browse.html'); }

  var wsApp = connectApp('ws://localhost:8766', function(intent, params) {
    var INTENTS = {
      navigate_up:   function() { detailArrow({ key: 'ArrowUp',   preventDefault: function() {} }); },
      navigate_down: function() { detailArrow({ key: 'ArrowDown', preventDefault: function() {} }); },
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

  document.getElementById('btn-back-detail').addEventListener('click', goBack);
  document.addEventListener('keydown', dispatchKey);

  initPage({
    onEnter: focusFirstDetailRow,
    keys: {
      Escape:    function(e) { goBack(e); },
      Backspace: function(e) { goBack(e); },
      ArrowUp:   detailArrow,
      ArrowDown: detailArrow
    },
    remote: {}
  });

  loadSeries(SERVER, seriesId)
    .then(function(series) {
      buildDetailList(SERVER, series, function(item) {
        navTo('video.html', { video: item.video.id, series: seriesId, from: 'detail' });
      });
      focusFirstDetailRow();
    })
    .catch(function() { navTo('error.html'); });
}
