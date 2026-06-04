import { registerScreen } from '../../core/screen-registry.js';
import { fmt } from '../../core/time.js';

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

export function buildDetailList(film, contentBase, onPlayItem) {
  document.getElementById('detail-title').textContent = film.title;
  var list = document.getElementById('detail-list');
  list.innerHTML = '';
  film.items.forEach(function(item, i) {
    var available = item.available !== false;
    var avConfig = AVAILABLE_ROW[available + ''];
    var row = document.createElement('div');
    row.className = avConfig.className;
    row.tabIndex = avConfig.tabIndex;
    row.setAttribute('data-index', i);
    var posterSrc = contentBase + ([item.poster].filter(Boolean).concat([film.poster].filter(Boolean)))[0];
    var thumbHtml =
      '<img class="detail-thumb" src="' + posterSrc + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
      '<div class="detail-thumb-placeholder" style="display:none">\uD83C\uDFAC</div>';
    var resumeKey = 'grew-tv:position:' + film.id + ':' + item.id;
    var saved = localStorage.getItem(resumeKey);
    [saved].filter(Boolean).forEach(function() { row.classList.add('has-resume'); });
    var resumeHtml = [saved].filter(Boolean).map(function(s) { return '<div class="detail-resume">\u25cf ' + fmt(parseFloat(s)) + '</div>'; }).join('');
    var durationHtml = [item.duration].filter(Boolean).map(function(d) { return '<div class="detail-duration">' + d + '</div>'; }).join('');
    var descHtml = [item.description].filter(Boolean).map(function(d) { return '<div class="detail-desc">' + d + '</div>'; }).join('');
    var label = [item.label, item.title, 'Item ' + (i + 1)].filter(Boolean)[0];
    row.innerHTML = thumbHtml + '<div class="detail-info"><div class="detail-label">' + label + '</div>' + durationHtml + descHtml + resumeHtml + '</div>';
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
