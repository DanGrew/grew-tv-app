import { registerScreen } from '../../core/screen-registry.js';

var ARROW_DELTA = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function setup(getSourceTile, clearSourceTile) {
  function browseArrow(e) {
    var delta = ARROW_DELTA[e.key];
    var tiles = Array.from(document.querySelectorAll('.film-tile'));
    var idx = tiles.indexOf(document.activeElement);
    e.preventDefault();
    [tiles[idx + delta]].filter(Boolean).filter(function() { return idx > -1; }).forEach(function(t) { t.focus(); });
  }

  registerScreen('screen-browse', {
    onEnter: function() {
      var target = [getSourceTile(), document.querySelector('.film-tile')].filter(Boolean)[0];
      clearSourceTile();
      [target].filter(Boolean).forEach(function(t) { t.focus(); });
    },
    keys: { ArrowLeft: browseArrow, ArrowRight: browseArrow, ArrowUp: browseArrow, ArrowDown: browseArrow },
    remote: {}
  });
}
