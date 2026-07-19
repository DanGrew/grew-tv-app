// Shared tile/card (TASK-116). One focusable card — 16:9 poster + title, an
// optional mid-watch progress bar (0 < resume < 100%), an optional CC badge, a
// music tile's optional Lyrics badge —
// reused by Home rails, series-detail rows and the companion grid (117-120).
// All display logic lives in core/tile-model.js; this file only builds DOM.

import { mediaUrl } from '../core/app-api.js';
import { tileModel } from '../core/tile-model.js';
import { coverMosaicHtml } from '../core/cover-mosaic.js';

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
  // Music tiles get a flag the page CSS keys square art off (FEAT-018).
  ({ true: function() { tile.setAttribute('data-music', ''); }, false: function() {} })[String(!!m.music)]();

  var title = document.createElement('div');
  title.className = 'tile-title';
  title.textContent = m.title;

  // FEAT-039/TASK-244: a playlist tile renders a 2x2 cover mosaic of its member
  // album art (m.coverArt -> resolved urls). Any other card (album/video, or a
  // playlist whose backend sent no coverArt) takes the single-poster path, which
  // also handles the placeholder fallback — so an old backend (no field) and an
  // empty playlist both degrade to the existing placeholder.
  var coverUrls = m.coverArt.map(function(ref) { return mediaUrl(server, ref); }).filter(Boolean);
  function buildMosaic() {
    var box = document.createElement('div');
    box.className = 'film-poster';
    box.innerHTML = coverMosaicHtml(coverUrls);
    tile.appendChild(box);
  }
  function buildPoster() {
    var img = document.createElement('img');
    img.className = 'film-poster';
    img.alt = '';
    // TASK-359/360: a rail can hold far more tiles than fit on screen, and each
    // poster costs a download AND a main-thread JPEG decode. `lazy` defers the
    // ones nobody scrolls to; `async` keeps the decode of the ones on screen off
    // the critical rendering path. setAttribute (not the property) so a browser
    // that implements neither simply ignores them — the TV kiosk is old Chrome.
    // Safe against reflow: .film-poster carries an aspect-ratio, so the box is
    // already reserved before the image lands.
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
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
    placeholder.textContent = ({ true: '💿', false: '🎬' })[String(!!m.music)];
    tile.appendChild(img);
    tile.appendChild(placeholder);
  }
  ({ true: buildMosaic, false: buildPoster })[String(coverUrls.length > 0)]();
  tile.appendChild(title);

  [m.sub].filter(Boolean).forEach(function(text) {
    var sub = document.createElement('div');
    sub.className = 'tile-sub';
    sub.textContent = text;
    tile.appendChild(sub);
  });

  [m.showCC].filter(Boolean).forEach(function() {
    var cc = document.createElement('div');
    cc.className = 'tile-cc';
    cc.textContent = 'CC';
    tile.appendChild(cc);
  });

  [m.showLyrics].filter(Boolean).forEach(function() {
    var ly = document.createElement('div');
    ly.className = 'tile-lyrics';
    ly.textContent = 'Lyrics';
    tile.appendChild(ly);
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

  // FEAT-040: a standalone film/video tile gets a ＋ Queue action badge (top-right)
  // when the page supplies `onQueue` — tap to add the film to the video Play-Next
  // queue. stopPropagation so it never triggers the tile's play (onSelect).
  // Films have no Lyrics badge, so the right corner is free; only video kind.
  var QUEUEABLE = { video: true };
  function appendQueueBadge(fn) {
    var q = document.createElement('button');
    q.className = 'tile-queue';
    q.setAttribute('aria-label', 'Queue');
    q.setAttribute('data-queue', m.id);
    q.textContent = '＋';
    q.addEventListener('click', function(e) { e.stopPropagation(); fn(card); });
    tile.appendChild(q);
  }
  [o.onQueue].filter(Boolean).filter(function() { return QUEUEABLE[m.kind]; }).forEach(appendQueueBadge);

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
