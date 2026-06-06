import { registerScreen } from '../../core/screen-registry.js';
import { createTile } from '../../components/tile.js';

var PROFILE_LABEL = { kids: 'Kids', adults: 'Adults' };
var PLAY_KEYS     = { Enter: true, ' ': true };

function tilesIn(railEl) {
  return Array.from(railEl.querySelectorAll('.film-tile'));
}

function allRows() {
  return Array.from(document.querySelectorAll('.rail-row'));
}

function focusCol(railEl, col) {
  [railEl].filter(Boolean).forEach(function(r) {
    var tiles = tilesIn(r);
    var last = tiles.length - 1;
    var idx = col < 0 ? 0 : (col > last ? last : col);
    [tiles[idx]].filter(Boolean).forEach(function(t) { t.focus(); });
  });
}

// 2-D d-pad: left/right scroll within a rail; up/down change rail, keeping the
// column (clamped to the target rail's length). Same-id tiles can repeat across
// rails (a Continue-Watching item also lives in Films) — focus is positional.
export function railArrow(e) {
  e.preventDefault();
  var active = document.activeElement;
  var rows = allRows();
  var railIdx = rows.findIndex(function(r) { return r.contains(active); });
  var tiles = [rows[railIdx]].filter(Boolean).map(tilesIn).concat([[]])[0];
  var col = tiles.indexOf(active);
  var MOVE = {
    ArrowLeft:  function() { focusCol(rows[railIdx], col - 1); },
    ArrowRight: function() { focusCol(rows[railIdx], col + 1); },
    ArrowUp:    function() { focusCol(rows[railIdx - 1], col); },
    ArrowDown:  function() { focusCol(rows[railIdx + 1], col); }
  };
  [railIdx].filter(function() { return railIdx >= 0; }).forEach(function() {
    [MOVE[e.key]].filter(Boolean).forEach(function(fn) { fn(); });
  });
}

// rails: output of core/home-rails.buildRails — [{id, title, items:[card]}].
// progress: the id->entry map (also drives each tile's mid-watch bar).
// onSelect(card) — the page routes by card.kind.
export function renderRails(server, rails, progress, profile, onSelect) {
  document.getElementById('profile-label').textContent = PROFILE_LABEL[profile];
  var root = document.getElementById('rails');
  root.innerHTML = '';
  [rails].filter(function() { return rails.length === 0; }).forEach(function() {
    root.innerHTML = '<div class="home-empty">No films available</div>';
  });
  rails.forEach(function(rail) {
    var section = document.createElement('div');
    section.className = 'rail';
    var h = document.createElement('div');
    h.className = 'rail-title';
    h.textContent = rail.title;
    section.appendChild(h);
    var row = document.createElement('div');
    row.className = 'rail-row';
    row.setAttribute('data-rail', rail.id);
    rail.items.forEach(function(card) {
      row.appendChild(createTile(server, card, { progress: progress, onSelect: onSelect }));
    });
    section.appendChild(row);
    root.appendChild(section);
  });
  [document.querySelector('.rail-row .film-tile')].filter(Boolean).forEach(function(t) { t.focus(); });
}

export { PLAY_KEYS };

export function setup() {
  registerScreen('screen-browse', {
    onEnter: function() { [document.querySelector('.rail-row .film-tile')].filter(Boolean).forEach(function(t) { t.focus(); }); },
    keys: { ArrowLeft: railArrow, ArrowRight: railArrow, ArrowUp: railArrow, ArrowDown: railArrow },
    remote: {}
  });
}
