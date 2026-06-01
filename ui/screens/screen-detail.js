import { registerScreen } from '../../core/screen-registry.js';

var DETAIL_ARROW_DELTA = { ArrowUp: -1, ArrowDown: 1 };

export function setup(show) {
  function detailBack(e) {
    e.preventDefault();
    show('screen-browse');
  }

  function detailArrow(e) {
    e.preventDefault();
    var delta = DETAIL_ARROW_DELTA[e.key];
    var rows = Array.from(document.querySelectorAll('.detail-row:not(.unavailable)'));
    var idx = rows.indexOf(document.activeElement);
    [rows[idx + delta]].filter(Boolean).filter(function() { return idx > -1; }).forEach(function(r) { r.focus(); });
  }

  registerScreen('screen-detail', {
    onEnter: function() {
      var list = document.getElementById('detail-list');
      var target = [list.querySelector('.detail-row.has-resume'), list.querySelector('.detail-row:not(.unavailable)')].filter(Boolean)[0];
      [target].filter(Boolean).forEach(function(r) { r.focus(); });
    },
    keys: { Escape: detailBack, Backspace: detailBack, ArrowUp: detailArrow, ArrowDown: detailArrow },
    remote: {}
  });
}
