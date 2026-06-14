import { registerScreen } from '../../core/screen-registry.js';
import { mediaUrl } from '../../core/app-api.js';
import { percent, isMidWatch } from '../../core/progress.js';
import { resumeOf, episodeLabel, durationMarkup, progressBarMarkup, detailTagMarkup } from '../../core/detail-view.js';
import { primaryAction } from '../../core/series-detail.js';
import { seasonsOf, seasonLabel, chipClass, visibleItems, defaultSeason, seasonPosterOf, posterCandidates } from '../../core/seasons.js';

var DETAIL_ARROW_DELTA = { ArrowUp: -1, ArrowDown: 1 };
var PLAY_KEYS = { Enter: true, ' ': true };
var AVAILABLE_ROW = {
  'true':  { className: 'detail-row',             tabIndex: 0  },
  'false': { className: 'detail-row unavailable', tabIndex: -1 }
};

// Per-render context for the detail screen: the series + progress + the active
// season chip (TASK-123). null activeSeason = no season chips (legacy single
// list). Reset on each buildDetailList.
var state = { server: '', series: { items: [] }, progress: {}, onPlayItem: function() {}, seasons: [], activeSeason: null };

// Up/Down move between vertical stops: clickable breadcrumb crumbs (top), then
// the header Play-next action, the shuffle button, the active season chip, then
// every available episode row. A focused per-row Restart control counts as its
// row; Left/Right move sideways onto it (or between season chips).
function crumbStops() {
  return Array.from(document.querySelectorAll('#breadcrumb .crumb-link'));
}

function verticalStops() {
  return crumbStops()
    .concat([document.getElementById('btn-play-next')].filter(Boolean))
    .concat(Array.from(document.querySelectorAll('#btn-shuffle:not(.hidden)')))
    .concat(Array.from(document.querySelectorAll('.season-chip.active')))
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

// Focus the next/previous season chip (a horizontal group). Focusing it fires
// its `focus` handler -> the season is picked. Guards non-chip elements (indexOf
// -1) and the ends of the row.
function chipSibling(el, delta) {
  var chips = Array.from(document.querySelectorAll('.season-chip'));
  var i = chips.indexOf(el);
  [chips[i + delta]].filter(Boolean).filter(function() { return i > -1; }).forEach(function(c) { c.focus(); });
}

// Right steps from a row onto its Restart control, or from a season chip to the
// next chip.
export function detailRight(e) {
  e.preventDefault();
  var el = document.activeElement;
  [el].filter(function(r) { return r.classList.contains('detail-row'); })
    .map(function(r) { return r.querySelector('.detail-restart'); })
    .filter(Boolean)
    .forEach(function(btn) { btn.focus(); });
  chipSibling(el, 1);
}

export function detailLeft(e) {
  e.preventDefault();
  var active = document.activeElement;
  [active.closest('.detail-row')].filter(Boolean)
    .filter(function() { return active.classList.contains('detail-restart'); })
    .forEach(function(r) { r.focus(); });
  chipSibling(active, -1);
}

// Default focus lands on Play-next (not the breadcrumb): the crumbs are a stop
// you reach by pressing Up, never the entry focus.
export function focusFirstDetailRow() {
  [document.getElementById('btn-play-next')].filter(Boolean).forEach(function(s) { s.focus(); });
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

// Inline "Season N" dividers belong to the legacy single-list mode only — when
// the season chips drive the list (activeSeason set) the chip IS the label.
function maybeSeasonHeaderFor(list, item, ctx) {
  ({
    true:  function() { maybeSeasonHeader(list, item, ctx); },
    false: function() {}
  })[String(state.activeSeason === null)]();
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

function buildRow(server, series, progress, onPlayItem, item, i, isNext) {
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
    durationMarkup(video.duration) + detailTagMarkup(mid, video.duration - resume, isNext) +
    progressBarMarkup(mid, percent(resume, video.duration), 'detail-progress') + '</div>';

  appendRestart(row, mid, onPlayItem, item, i);
  bindRow(row, available, onPlayItem, item, i);
  return row;
}

function showImg(img, ph) { img.style.display = 'block'; ph.style.display = 'none'; }
function showPlaceholder(img, ph) { img.style.display = 'none'; ph.style.display = 'flex'; }

// Header poster with a graceful fallback chain: the active season's art, then the
// series art, then the 🎬 placeholder. `cands` is the ordered list of present
// poster URLs (TASK-122/123); each 404 shifts to the next, an empty list shows
// the placeholder up front. Same idea as the per-element tile/episode fallback.
function applyPoster(img, ph, cands) {
  img.onerror = function() {
    cands.shift();
    ({
      true:  function() { showPlaceholder(img, ph); },
      false: function() { img.src = cands[0]; }
    })[String(cands.length === 0)]();
  };
  ({
    true:  function() { showPlaceholder(img, ph); },
    false: function() { showImg(img, ph); img.src = cands[0]; }
  })[String(cands.length === 0)]();
}

function renderHeaderPoster() {
  var img = document.getElementById('detail-header-poster');
  var ph = document.getElementById('detail-header-placeholder');
  var seasonPoster = seasonPosterOf(state.seasons, state.activeSeason);
  applyPoster(img, ph, posterCandidates(state.server, seasonPoster, state.series.poster));
}

function makeChip(s) {
  var btn = document.createElement('button');
  btn.className = chipClass(s.season, state.activeSeason);
  btn.tabIndex = 0;
  btn.textContent = seasonLabel(s.season);
  btn.setAttribute('data-season', s.season);
  btn.addEventListener('focus', function() { pickSeason(s.season); });
  return btn;
}

function setChipBoxVisible(box, n) {
  ({
    true:  function() { box.style.display = 'none'; },
    false: function() { box.style.display = 'flex'; }
  })[String(n === 0)]();
}

// buildDetailList is shared with the album-detail page, whose HTML has no
// #season-chips (albums never have seasons) — no-op when the container is absent.
function renderChips() {
  [document.getElementById('season-chips')].filter(Boolean).forEach(function(box) {
    box.innerHTML = '';
    state.seasons.forEach(function(s) { box.appendChild(makeChip(s)); });
    setChipBoxVisible(box, state.seasons.length);
  });
}

function updateChipActive() {
  Array.from(document.querySelectorAll('.season-chip')).forEach(function(btn) {
    btn.className = chipClass(Number(btn.getAttribute('data-season')), state.activeSeason);
  });
}

// A chip gained focus (d-pad or click): make it the active season and re-flow the
// header poster + episode list. Chips are NOT rebuilt, so focus stays put.
function pickSeason(season) {
  state.activeSeason = season;
  updateChipActive();
  renderHeaderPoster();
  renderList();
}

function renderList() {
  var list = document.getElementById('detail-list');
  list.innerHTML = '';
  var ctx = { lastSeason: null };
  // Tag the row the header action will play. A 'continue' row is mid-watch, so it
  // renders RESUME (detailTagMarkup prefers it); 'next'/'again' rows get NEXT.
  // nextIdx indexes the FULL items[]; visibleItems carries each item's original
  // index, so a filtered season still tags the right row.
  var nextIdx = primaryAction(state.series.items, state.progress).index;
  visibleItems(state.series.items, state.activeSeason).forEach(function(e) {
    maybeSeasonHeaderFor(list, e.item, ctx);
    list.appendChild(buildRow(state.server, state.series, state.progress, state.onPlayItem, e.item, e.idx, e.idx === nextIdx));
  });
}

// series: v3 /api/series record {title, poster, seasons:[{season,poster}],
// items:[{season?, episode?, video:<full record>}]}. progress: id ->
// {resumePositionSec, lastPlayed} from /api/continue-watching (backend is the
// source of truth — no localStorage). onPlayItem(item, i, mode) where mode is
// 'resume' (row default) or 'restart'. With seasons[] the header carries a season
// chip row that filters the list + swaps the poster (TASK-123); without it the
// legacy single list + inline dividers render unchanged.
export function buildDetailList(server, series, progress, onPlayItem) {
  state = {
    server: server, series: series, progress: progress, onPlayItem: onPlayItem,
    seasons: seasonsOf(series),
    activeSeason: defaultSeason(series.items, progress, seasonsOf(series))
  };
  document.getElementById('detail-title').textContent = series.title;
  renderChips();
  renderHeaderPoster();
  renderList();
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
