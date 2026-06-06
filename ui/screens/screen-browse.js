import { registerScreen } from '../../core/screen-registry.js';
import { mediaUrl } from '../../core/app-api.js';

var ARROW_DELTA   = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
var PROFILE_LABEL = { kids: 'Kids', adults: 'Adults' };
var PLAY_KEYS     = { Enter: true, ' ': true };

export function browseArrow(e) {
  var delta = ARROW_DELTA[e.key];
  var tiles = Array.from(document.querySelectorAll('.film-tile'));
  var idx = tiles.indexOf(document.activeElement);
  e.preventDefault();
  [tiles[idx + delta]].filter(Boolean).filter(function() { return idx > -1; }).forEach(function(t) { t.focus(); });
}

// cards: v3 browse entries {kind:'video'|'series', id, title, poster, ...}.
// Already profile-scoped + availability-filtered by the backend, so the grid
// renders them as-is. onSelect(card) — the page routes by card.kind.
export function buildGrid(server, cards, profile, onSelect) {
  var grid = document.getElementById('grid');
  grid.innerHTML = '';
  document.getElementById('profile-label').textContent = PROFILE_LABEL[profile];
  [grid].filter(function() { return cards.length === 0; }).forEach(function(g) {
    g.innerHTML = '<div style="font-size:32px;color:#666;grid-column:1/-1;text-align:center;padding:80px 0">No films available</div>';
  });
  cards.forEach(function(card, i) {
    var tile = document.createElement('div');
    tile.className = 'film-tile';
    tile.tabIndex = 0;
    tile.setAttribute('data-index', i);
    tile.setAttribute('data-id', card.id);
    tile.setAttribute('data-kind', card.kind);
    var poster = mediaUrl(server, card.poster);
    var posterHtml = [poster].filter(Boolean).map(function(src) {
      return '<img class="film-poster" src="' + src + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
        '<div class="film-poster-placeholder" style="display:none">🎬</div>';
    }).concat(['<div class="film-poster-placeholder" style="display:flex">🎬</div>'])[0];
    tile.innerHTML = '<div class="tile-title">' + card.title + '</div>' + posterHtml;
    tile.addEventListener('click', function() { onSelect(card); });
    tile.addEventListener('keydown', function(e) {
      [card].filter(function() { return PLAY_KEYS[e.key]; }).forEach(function(c) { e.preventDefault(); onSelect(c); });
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
