import { registerScreen } from '../../core/screen-registry.js';
import { fmt } from '../../core/time.js';
import { mediaUrl } from '../../core/app-api.js';

var DETAIL_ARROW_DELTA = { ArrowUp: -1, ArrowDown: 1 };
var AVAILABLE_ROW = {
  'true':  { className: 'detail-row',             tabIndex: 0  },
  'false': { className: 'detail-row unavailable', tabIndex: -1 }
};

export function detailArrow(e) {
  e.preventDefault();
  var delta = DETAIL_ARROW_DELTA[e.key];
  var rows = Array.from(document.querySelectorAll('.detail-row:not(.unavailable)'));
  var idx = rows.indexOf(document.activeElement);
  [rows[idx + delta]].filter(Boolean).filter(function() { return idx > -1; }).forEach(function(r) { r.focus(); });
}

export function focusFirstDetailRow() {
  var list = document.getElementById('detail-list');
  var target = [list.querySelector('.detail-row.has-resume'), list.querySelector('.detail-row:not(.unavailable)')].filter(Boolean)[0];
  [target].filter(Boolean).forEach(function(r) { r.focus(); });
}

function seasonHeader(list, season) {
  var h = document.createElement('div');
  h.className = 'detail-season';
  h.textContent = 'Season ' + season;
  list.appendChild(h);
}

// series: v3 /api/series record {title, poster, items:[{season?, episode?,
// video:<full record>}]}. Rows are the resolved videos in order; when items
// carry seasons we group them under "Season N" headers. Resume state is keyed
// by the video id (matching /api/progress). onPlayItem(item, i).
export function buildDetailList(server, series, onPlayItem) {
  document.getElementById('detail-title').textContent = series.title;
  var list = document.getElementById('detail-list');
  list.innerHTML = '';
  var lastSeason = null;
  series.items.forEach(function(item, i) {
    var video = item.video;
    [item.season].filter(function(s) { return s != null && s !== lastSeason; }).forEach(function(s) { seasonHeader(list, s); lastSeason = s; });
    var available = video.available !== false;
    var avConfig = AVAILABLE_ROW[available + ''];
    var row = document.createElement('div');
    row.className = avConfig.className;
    row.tabIndex = avConfig.tabIndex;
    row.setAttribute('data-index', i);
    row.setAttribute('data-id', video.id);
    var posterName = [video.poster, series.poster].filter(Boolean)[0];
    var posterSrc = mediaUrl(server, posterName);
    var thumbHtml = [posterSrc].filter(Boolean).map(function(src) {
      return '<img class="detail-thumb" src="' + src + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
        '<div class="detail-thumb-placeholder" style="display:none">🎬</div>';
    }).concat(['<div class="detail-thumb-placeholder" style="display:flex">🎬</div>'])[0];
    var resumeKey = 'grew-tv:position:' + video.id;
    var saved = localStorage.getItem(resumeKey);
    [saved].filter(Boolean).forEach(function() { row.classList.add('has-resume'); });
    var resumeHtml = [saved].filter(Boolean).map(function(s) { return '<div class="detail-resume">● ' + fmt(parseFloat(s)) + '</div>'; }).join('');
    var durationHtml = [video.duration].filter(Boolean).map(function(d) { return '<div class="detail-duration">' + fmt(d) + '</div>'; }).join('');
    var label = [item.episode].filter(function(e) { return e != null; }).map(function(e) { return e + '. ' + video.title; }).concat([video.title])[0];
    row.innerHTML = thumbHtml + '<div class="detail-info"><div class="detail-label">' + label + '</div>' + durationHtml + resumeHtml + '</div>';
    [row].filter(function() { return available; }).forEach(function(r) {
      r.addEventListener('click', function() { onPlayItem(item, i); });
      r.addEventListener('keydown', function(e) {
        [e.key].filter(function(k) { return k === 'Enter'; }).forEach(function() { e.preventDefault(); onPlayItem(item, i); });
      });
    });
    list.appendChild(row);
  });
}

export function setup(onBack) {
  registerScreen('screen-detail', {
    onEnter: focusFirstDetailRow,
    keys: {
      Escape:    function(e) { e.preventDefault(); onBack(); },
      Backspace: function(e) { e.preventDefault(); onBack(); },
      ArrowUp:   detailArrow,
      ArrowDown: detailArrow
    },
    remote: {}
  });
}
