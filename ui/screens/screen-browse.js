import { registerScreen } from '../../core/screen-registry.js';

var ARROW_DELTA   = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
var FILM_FILTER   = { kids: function(f) { return f.profile === 'kids'; }, adults: function() { return true; } };
var PROFILE_LABEL = { kids: 'Kids', adults: 'Adults' };
var PLAY_KEYS     = { Enter: true, ' ': true };

export function browseArrow(e) {
  var delta = ARROW_DELTA[e.key];
  var tiles = Array.from(document.querySelectorAll('.film-tile'));
  var idx = tiles.indexOf(document.activeElement);
  e.preventDefault();
  [tiles[idx + delta]].filter(Boolean).filter(function() { return idx > -1; }).forEach(function(t) { t.focus(); });
}

export function buildGrid(allFilms, contentBase, profile, onSelect) {
  var grid = document.getElementById('grid');
  grid.innerHTML = '';
  document.getElementById('profile-label').textContent = PROFILE_LABEL[profile];
  var filtered = allFilms.filter(FILM_FILTER[profile]).filter(function(f) { return f.available !== false; });
  [grid].filter(function() { return filtered.length === 0; }).forEach(function(g) {
    g.innerHTML = '<div style="font-size:32px;color:#666;grid-column:1/-1;text-align:center;padding:80px 0">No films available</div>';
  });
  filtered.forEach(function(film, i) {
    var tile = document.createElement('div');
    tile.className = 'film-tile';
    tile.tabIndex = 0;
    tile.setAttribute('data-index', i);
    tile.setAttribute('data-id', film.id);
    tile.innerHTML =
      '<div class="tile-title">' + film.title + '</div>' +
      '<img class="film-poster" src="' + contentBase + film.poster + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
      '<div class="film-poster-placeholder" style="display:none">\uD83C\uDFAC</div>';
    tile.addEventListener('click', function() { onSelect(film); });
    tile.addEventListener('keydown', function(e) {
      [film].filter(function() { return PLAY_KEYS[e.key]; }).forEach(function(f) { e.preventDefault(); onSelect(f); });
    });
    grid.appendChild(tile);
  });
  [grid.querySelector('.film-tile')].filter(Boolean).forEach(function(t) { t.focus(); });
}

export function setup() {
  registerScreen('screen-browse', {
    onEnter: function() { [document.querySelector('.film-tile')].filter(Boolean).forEach(function(t) { t.focus(); }); },
    keys: { ArrowLeft: browseArrow, ArrowRight: browseArrow, ArrowUp: browseArrow, ArrowDown: browseArrow },
    remote: {}
  });
}
