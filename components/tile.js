// Shared tile/card (TASK-116). One focusable card — 16:9 poster + title, an
// optional mid-watch progress bar (0 < resume < 100%), an optional CC badge —
// reused by Home rails, series-detail rows and the companion grid (117-120).
// All display logic lives in core/tile-model.js; this file only builds DOM.

import { mediaUrl } from '../core/app-api.js';
import { tileModel } from '../core/tile-model.js';

var PLAY_KEYS = { Enter: true, ' ': true };

// createTile(server, card, opts) -> focusable element.
// opts: { progress, hasCC, onSelect }.
export function createTile(server, card, opts) {
  var o = opts || {};
  var m = tileModel(card, { progress: o.progress, hasCC: o.hasCC });

  var tile = document.createElement('div');
  tile.className = 'film-tile';
  tile.tabIndex = 0;
  tile.setAttribute('data-id', m.id);
  tile.setAttribute('data-kind', m.kind);

  var title = document.createElement('div');
  title.className = 'tile-title';
  title.textContent = m.title;
  tile.appendChild(title);

  var img = document.createElement('img');
  img.className = 'film-poster';
  img.alt = '';
  var placeholder = document.createElement('div');
  placeholder.className = 'film-poster-placeholder';
  var src = mediaUrl(server, m.poster);
  ({
    true: function() {
      img.src = src;
      placeholder.style.display = 'none';
      img.addEventListener('error', function() {
        img.style.display = 'none';
        placeholder.style.display = 'flex';
      });
    },
    false: function() {
      img.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  })[String(!!src)]();
  placeholder.textContent = '🎬';
  tile.appendChild(img);
  tile.appendChild(placeholder);

  [m.showCC].filter(Boolean).forEach(function() {
    var cc = document.createElement('div');
    cc.className = 'tile-cc';
    cc.textContent = 'CC';
    tile.appendChild(cc);
  });

  [m.showBar].filter(Boolean).forEach(function() {
    var bar = document.createElement('div');
    bar.className = 'tile-progress';
    var fill = document.createElement('div');
    fill.className = 'tile-progress-fill';
    fill.style.width = m.percent + '%';
    bar.appendChild(fill);
    tile.appendChild(bar);
  });

  [o.onSelect].filter(Boolean).forEach(function(fn) {
    tile.addEventListener('click', function() { fn(card); });
    tile.addEventListener('keydown', function(e) {
      [card].filter(function() { return PLAY_KEYS[e.key]; }).forEach(function(c) {
        e.preventDefault();
        fn(c);
      });
    });
  });

  return tile;
}
