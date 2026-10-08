// FEAT-526/TASK-643 — the remote's − (`-`) on Browse clears the focused tile's
// watch progress, with a two-press confirm: the first press arms the tile (it
// reads "Clear progress?"), the second clears it, and moving off disarms it.
// What a press does is core's (core/minus-clear.js); this file only draws the
// armed state and sends the clear.
//
// Browse only: − is "previous" on the players and the Queue, and no other
// browsing screen claims it. It clears the ACTIVE person's progress only, via
// the player's own `resetProgress` (TASK-142). The phone has no counterpart by
// owner call — its browse reads Continue Watching afresh on its next load.
import { resetProgress } from '../../core/app-api.js';
import { CLEAR_PROMPT, minusAction } from '../../core/minus-clear.js';
import { tileHasProgress, dropProgress } from './screen-browse.js';

function noop() {}

function disarm(tile) {
  tile.classList.remove('armed');
  [tile.querySelector('.tile-armed')].filter(Boolean).forEach(function(el) { el.remove(); });
}

function arm(tile) {
  var label = document.createElement('div');
  label.className = 'tile-armed';
  label.textContent = CLEAR_PROMPT;
  tile.appendChild(label);
  tile.classList.add('armed');
  tile.addEventListener('blur', function() { disarm(tile); }, { once: true });
}

// mountMinusClear({ server, getPerson, onFail }) -> the `-` key handler.
// A clear the backend refused leaves the progress where it was: the tile
// disarms and the page says so, rather than drawing a clear that did not happen.
export function mountMinusClear(opts) {
  function failed(tile) {
    disarm(tile);
    opts.onFail();
  }
  var CLEARED = { 'true': dropProgress, 'false': failed };
  function clear(tile) {
    resetProgress(opts.server, tile.getAttribute('data-id'), opts.getPerson())
      .then(function(res) { CLEARED[!!res.ok + ''](tile); })
      .catch(function() { failed(tile); });
  }
  var ACTIONS = { none: noop, arm: arm, clear: clear };
  return function pressMinus(e) {
    [document.activeElement.closest('.film-tile')].filter(Boolean).forEach(function(tile) {
      e.preventDefault();
      ACTIONS[minusAction(tile.classList.contains('armed'), tileHasProgress(tile))](tile);
    });
  };
}
