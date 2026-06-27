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
var state = { server: '', series: { items: [] }, progress: {}, onPlayItem: function() {}, onAddToPlaylist: null, onMoveItem: null, onRemoveItem: null, seasons: [], activeSeason: null };

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
    .concat(Array.from(document.querySelectorAll('#btn-delete-playlist')))
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

// A row's horizontal stops: the row itself, then each per-row action button in
// DOM order (Restart, then "+ Playlist" — TASK-206). Left/Right step through this
// list, so a row can carry more than one secondary control without bespoke nav.
// closest('.detail-row') resolves both a focused row (returns itself) and a
// focused action (returns its row); a non-row element (a season chip) yields [].
function rowHStops(el) {
  return [el.closest('.detail-row')].filter(Boolean)
    .map(function(r) { return [r].concat(Array.from(r.querySelectorAll('.detail-row-action'))); })
    .concat([[]])[0];
}

function rowHStep(el, delta) {
  var stops = rowHStops(el);
  var i = stops.indexOf(el);
  [stops[i + delta]].filter(Boolean).filter(function() { return i > -1; }).forEach(function(s) { s.focus(); });
}

// Right steps from a row onto its next action control (Restart / + Playlist), or
// from a season chip to the next chip.
export function detailRight(e) {
  e.preventDefault();
  var el = document.activeElement;
  rowHStep(el, 1);
  chipSibling(el, 1);
}

export function detailLeft(e) {
  e.preventDefault();
  var el = document.activeElement;
  rowHStep(el, -1);
  chipSibling(el, -1);
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
    btn.className = 'detail-restart detail-row-action';
    btn.tabIndex = 0;
    btn.textContent = '↺ Restart';
    btn.addEventListener('click', function(e) { e.stopPropagation(); onPlayItem(item, i, 'restart'); });
    btn.addEventListener('keydown', function(e) {
      [e.key].filter(function(k) { return PLAY_KEYS[k]; }).forEach(function() { e.preventDefault(); e.stopPropagation(); onPlayItem(item, i, 'restart'); });
    });
    row.appendChild(btn);
  });
}

// A per-track "+ Playlist" control (FEAT-036/TASK-206), present only on available
// rows AND only when the page wired an onAddToPlaylist handler (album / artist
// track contexts — never series episodes or the playlist's own detail). Like
// Restart it stops propagation so it never also fires the row's play handler, and
// carries `detail-row-action` so Left/Right reach it.
function appendAdd(row, available, item) {
  [available].filter(Boolean).forEach(function() {
    [state.onAddToPlaylist].filter(Boolean).forEach(function(onAdd) {
      var btn = document.createElement('button');
      btn.className = 'detail-add detail-row-action';
      btn.tabIndex = 0;
      btn.textContent = '＋ Playlist';
      btn.addEventListener('click', function(e) { e.stopPropagation(); onAdd(item); });
      btn.addEventListener('keydown', function(e) {
        [e.key].filter(function(k) { return PLAY_KEYS[k]; }).forEach(function() { e.preventDefault(); e.stopPropagation(); onAdd(item); });
      });
      row.appendChild(btn);
    });
  });
}

// A small secondary row control (↑ / ↓ / ✕ — FEAT-036/TASK-211), built like the
// Restart / + Playlist buttons: `detail-row-action` so Left/Right reach it, and
// stopPropagation so it never also fires the row's play handler.
function rowActionButton(glyph, cls, onActivate) {
  var btn = document.createElement('button');
  btn.className = 'detail-row-action ' + cls;
  btn.tabIndex = 0;
  btn.innerHTML = glyph;
  btn.addEventListener('click', function(e) { e.stopPropagation(); onActivate(); });
  btn.addEventListener('keydown', function(e) {
    [e.key].filter(function(k) { return PLAY_KEYS[k]; }).forEach(function() { e.preventDefault(); e.stopPropagation(); onActivate(); });
  });
  return btn;
}

// Per-track reorder controls, present only on a playlist detail (the page wired
// onMoveItem) and only on available rows. ↑ is omitted on the first row and ↓ on
// the last — an edge has nothing to swap with, so the control simply isn't there
// (no dead focus stop), matching the FEAT-031 queue-view edge gating.
function appendMoveUp(row, item, i) {
  [i].filter(function(idx) { return idx > 0; }).forEach(function() {
    row.appendChild(rowActionButton('&#8593;', 'detail-move-up', function() { state.onMoveItem(item, i, 'up'); }));
  });
}
function appendMoveDown(row, item, i, total) {
  [i].filter(function(idx) { return idx < total - 1; }).forEach(function() {
    row.appendChild(rowActionButton('&#8595;', 'detail-move-down', function() { state.onMoveItem(item, i, 'down'); }));
  });
}
function appendMove(row, available, item, i, total) {
  [available].filter(Boolean).forEach(function() {
    [state.onMoveItem].filter(Boolean).forEach(function() {
      appendMoveUp(row, item, i);
      appendMoveDown(row, item, i, total);
    });
  });
}

// A per-track remove (✕) control, present only on a playlist detail (the page
// wired onRemoveItem) and only on available rows. Removes BY POSITION (index i).
function appendRemove(row, available, item, i) {
  [available].filter(Boolean).forEach(function() {
    [state.onRemoveItem].filter(Boolean).forEach(function() {
      row.appendChild(rowActionButton('&#10005;', 'detail-remove danger', function() { state.onRemoveItem(item, i); }));
    });
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
  appendAdd(row, available, item);
  appendMove(row, available, item, i, series.items.length);
  appendRemove(row, available, item, i);
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
// 'resume' (row default) or 'restart'. onAddToPlaylist(item) is OPTIONAL
// (FEAT-036/TASK-206): when supplied (album / artist track contexts) each
// available row gains a "+ Playlist" control; omitted (series / playlist detail)
// no add control renders. onMoveItem(item, i, 'up'|'down') + onRemoveItem(item, i)
// are OPTIONAL (FEAT-036/TASK-211): supplied only by the playlist detail, they add
// per-track ↑ ↓ (reorder by position) and ✕ (remove) controls; omitted elsewhere
// (album / artist / series) no reorder/remove renders. With seasons[] the header
// carries a season chip row that filters the list + swaps the poster (TASK-123);
// without it the legacy single list + inline dividers render unchanged.
export function buildDetailList(server, series, progress, onPlayItem, onAddToPlaylist, onMoveItem, onRemoveItem) {
  state = {
    server: server, series: series, progress: progress, onPlayItem: onPlayItem,
    onAddToPlaylist: [onAddToPlaylist].filter(Boolean).concat([null])[0],
    onMoveItem: [onMoveItem].filter(Boolean).concat([null])[0],
    onRemoveItem: [onRemoveItem].filter(Boolean).concat([null])[0],
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
