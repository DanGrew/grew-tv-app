import { registerScreen } from '../../core/screen-registry.js';
import { mediaUrl } from '../../core/app-api.js';
import { percent, isMidWatch } from '../../core/progress.js';
import { resumeOf, episodeLabel, durationMarkup, progressBarMarkup } from '../../core/detail-view.js';

var DETAIL_ARROW_DELTA = { ArrowUp: -1, ArrowDown: 1 };
var PLAY_KEYS = { Enter: true, ' ': true };
var AVAILABLE_ROW = {
  'true':  { className: 'detail-row',             tabIndex: 0  },
  'false': { className: 'detail-row unavailable', tabIndex: -1 }
};

// Up/Down move between vertical stops: the header Play-next action plus every
// available episode row. A focused per-row Restart control counts as its row.
function verticalStops() {
  return [document.getElementById('btn-play-next')].filter(Boolean)
    .concat(Array.from(document.querySelectorAll('.detail-row:not(.unavailable)')));
}

function activeStop() {
  var active = document.activeElement;
  return [active.closest('.detail-row')].filter(Boolean).concat([active])[0];
}

export function detailArrow(e) {
  e.preventDefault();
  var delta = DETAIL_ARROW_DELTA[e.key];
  var stops = verticalStops();
  var idx = stops.indexOf(activeStop());
  [stops[idx + delta]].filter(Boolean).filter(function() { return idx > -1; }).forEach(function(s) { s.focus(); });
}

// Right steps from a row onto its Restart control; Left steps back to the row.
export function detailRight(e) {
  e.preventDefault();
  var row = document.activeElement;
  [row].filter(function(r) { return r.classList.contains('detail-row'); })
    .map(function(r) { return r.querySelector('.detail-restart'); })
    .filter(Boolean)
    .forEach(function(btn) { btn.focus(); });
}

export function detailLeft(e) {
  e.preventDefault();
  var active = document.activeElement;
  [active.closest('.detail-row')].filter(Boolean)
    .filter(function() { return active.classList.contains('detail-restart'); })
    .forEach(function(r) { r.focus(); });
}

export function focusFirstDetailRow() {
  [verticalStops()[0]].filter(Boolean).forEach(function(s) { s.focus(); });
}

function seasonHeader(list, season) {
  var h = document.createElement('div');
  h.className = 'detail-season';
  h.textContent = 'Season ' + season;
  list.appendChild(h);
}

function maybeSeasonHeader(list, item, ctx) {
  [item.season]
    .filter(function(s) { return s != null; })
    .filter(function(s) { return s !== ctx.lastSeason; })
    .forEach(function(s) { seasonHeader(list, s); ctx.lastSeason = s; });
}

function thumbMarkup(src) {
  return [src].filter(Boolean).map(function(s) {
    return '<img class="detail-thumb" src="' + s + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
      '<div class="detail-thumb-placeholder" style="display:none">🎬</div>';
  }).concat(['<div class="detail-thumb-placeholder" style="display:flex">🎬</div>'])[0];
}

// Restart is a small secondary control, present only when the row is mid-watch
// (a fresh row has nothing to restart). It stops propagation so it never also
// fires the row's resume handler.
function appendRestart(row, mid, onPlayItem, item, i) {
  [mid].filter(Boolean).forEach(function() {
    var btn = document.createElement('button');
    btn.className = 'detail-restart';
    btn.tabIndex = 0;
    btn.textContent = '↺ Restart';
    btn.addEventListener('click', function(e) { e.stopPropagation(); onPlayItem(item, i, 'restart'); });
    btn.addEventListener('keydown', function(e) {
      [e.key].filter(function(k) { return PLAY_KEYS[k]; }).forEach(function() { e.preventDefault(); e.stopPropagation(); onPlayItem(item, i, 'restart'); });
    });
    row.appendChild(btn);
  });
}

function bindRow(row, available, onPlayItem, item, i) {
  [row].filter(function() { return available; }).forEach(function(r) {
    r.addEventListener('click', function() { onPlayItem(item, i, 'resume'); });
    r.addEventListener('keydown', function(e) {
      [e.key].filter(function(k) { return PLAY_KEYS[k]; }).forEach(function() { e.preventDefault(); onPlayItem(item, i, 'resume'); });
    });
  });
}

function buildRow(server, series, progress, onPlayItem, item, i) {
  var video = item.video;
  var available = video.available !== false;
  var avConfig = AVAILABLE_ROW[available + ''];
  var row = document.createElement('div');
  row.className = avConfig.className;
  row.tabIndex = avConfig.tabIndex;
  row.setAttribute('data-index', i);
  row.setAttribute('data-id', video.id);

  var resume = resumeOf(progress[video.id]);
  var mid = isMidWatch(resume, video.duration);
  [mid].filter(Boolean).forEach(function() { row.classList.add('has-resume'); });

  var posterName = [video.poster, series.poster].filter(Boolean)[0];
  var thumbHtml = thumbMarkup(mediaUrl(server, posterName));
  row.innerHTML = thumbHtml +
    '<div class="detail-info"><div class="detail-label">' + episodeLabel(item) + '</div>' +
    durationMarkup(video.duration) + progressBarMarkup(mid, percent(resume, video.duration), 'detail-progress') + '</div>';

  appendRestart(row, mid, onPlayItem, item, i);
  bindRow(row, available, onPlayItem, item, i);
  return row;
}

// Series header poster: real art when get_series carries one, else the 🎬
// placeholder. Same per-element graceful fallback as the tile/episode thumbs —
// an onerror swap covers a poster ref whose file is missing on the server.
function setHeaderPoster(server, series) {
  var img = document.getElementById('detail-header-poster');
  var ph = document.getElementById('detail-header-placeholder');
  var src = mediaUrl(server, series.poster);
  ({
    true: function() {
      img.src = src;
      img.style.display = 'block';
      ph.style.display = 'none';
      img.addEventListener('error', function() {
        img.style.display = 'none';
        ph.style.display = 'flex';
      });
    },
    false: function() {
      img.style.display = 'none';
      ph.style.display = 'flex';
    }
  })[String(!!src)]();
}

// series: v3 /api/series record {title, poster, items:[{season?, episode?,
// video:<full record>}]}. progress: id -> {resumePositionSec, lastPlayed} from
// /api/continue-watching (backend is the source of truth — no localStorage).
// onPlayItem(item, i, mode) where mode is 'resume' (row default) or 'restart'.
export function buildDetailList(server, series, progress, onPlayItem) {
  document.getElementById('detail-title').textContent = series.title;
  setHeaderPoster(server, series);
  var list = document.getElementById('detail-list');
  list.innerHTML = '';
  var ctx = { lastSeason: null };
  series.items.forEach(function(item, i) {
    maybeSeasonHeader(list, item, ctx);
    list.appendChild(buildRow(server, series, progress, onPlayItem, item, i));
  });
}

export function setup(onBack) {
  registerScreen('screen-detail', {
    onEnter: focusFirstDetailRow,
    keys: {
      Escape:     function(e) { e.preventDefault(); onBack(); },
      Backspace:  function(e) { e.preventDefault(); onBack(); },
      ArrowUp:    detailArrow,
      ArrowDown:  detailArrow,
      ArrowLeft:  detailLeft,
      ArrowRight: detailRight
    },
    remote: {}
  });
}
