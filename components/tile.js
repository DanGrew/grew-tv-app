// Shared tile/card (TASK-116). One focusable card — 16:9 poster + title, an
// optional mid-watch progress bar (0 < resume < 100%), an optional CC badge, a
// music tile's optional Lyrics badge —
// reused by Home rails, series-detail rows and the companion grid (117-120).
// All display logic lives in core/tile-model.js; this file only builds DOM.

import { mediaUrl } from '../core/app-api.js';
import { tileModel } from '../core/tile-model.js';
import { coverMosaicHtml } from '../core/cover-mosaic.js';
import { channelCardView } from '../core/channels.js';

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

  // FEAT-040/TASK-421: a standalone film/video (or music-video) tile gets a ＋
  // Queue action badge (top-right) when the page supplies `onQueue` — tap to
  // append the item to its own Queue (the page's onQueue decides which).
  // stopPropagation so it never triggers the tile's play (onSelect).
  // Films/music videos have no Lyrics badge, so the right corner is free.
  function appendQueueBadge(fn) {
    var q = document.createElement('button');
    q.className = 'tile-queue';
    q.setAttribute('aria-label', 'Queue');
    q.setAttribute('data-queue', m.id);
    q.textContent = '＋';
    q.addEventListener('click', function(e) { e.stopPropagation(); fn(card); });
    tile.appendChild(q);
  }
  [o.onQueue].filter(Boolean).filter(function() { return m.queueable; }).forEach(appendQueueBadge);

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

// FEAT-560/TASK-563 — the Channels strip's card. A separate builder from
// createTile above, deliberately: that one derives its bar from core/progress.js
// (how far the VIEWER got), and this one's bar is how far the CHANNEL has got.
// Same shape, opposite meaning (decision 14) — keeping them apart is what stops
// the two ever being wired to each other's source.
//
// It still carries `.film-tile`, because that class is what the browse screen's
// d-pad model treats as a focus stop (screen-browse.js tilesIn) — a channel card
// is a normal left/right stop on its rail, it just draws differently.

// The three text lines and the bar, applied to an already-built tile. Split out
// because the card TICKS: the strip is fetched once and re-applied on a timer,
// and rebuilding the element every second would throw away focus mid-browse.
export function applyChannelView(tile, view) {
  tile.classList.toggle('off-air', !view.onAir);
  tile.querySelector('.channel-name').textContent = view.name;
  tile.querySelector('.tile-title').textContent = view.title;
  tile.querySelector('.channel-time').textContent = view.time || '';
  tile.querySelector('.channel-progress-fill').style.width = view.percent + '%';
  return tile;
}

function channelArt(server, view) {
  var art = document.createElement('div');
  art.className = 'channel-art';
  var img = document.createElement('img');
  img.className = 'film-poster';
  img.alt = '';
  var placeholder = document.createElement('div');
  placeholder.className = 'film-poster-placeholder';
  placeholder.textContent = '📺';
  var src = mediaUrl(server, view.poster);
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
  art.appendChild(img);
  art.appendChild(placeholder);
  var bar = document.createElement('div');
  bar.className = 'channel-progress';
  var fill = document.createElement('div');
  fill.className = 'channel-progress-fill';
  bar.appendChild(fill);
  art.appendChild(bar);
  return art;
}

function channelLine(className) {
  var el = document.createElement('div');
  el.className = className;
  return el;
}

// createChannelTile(server, card, opts) -> focusable element.
// card is core/channels.js's channel tile (kind:'channel', carrying its own
// on-now `line`); opts: { elapsedSeconds, onSelect }.
export function createChannelTile(server, card, opts) {
  var o = opts || {};
  var view = channelCardView(card.line, o.elapsedSeconds);

  var tile = document.createElement('div');
  tile.className = 'film-tile channel-tile';
  tile.tabIndex = 0;
  tile.setAttribute('data-id', card.id);
  tile.setAttribute('data-kind', card.kind);
  tile.setAttribute('data-channel', card.channelId);

  tile.appendChild(channelArt(server, view));
  var meta = document.createElement('div');
  meta.className = 'channel-meta';
  meta.appendChild(channelLine('channel-name'));
  meta.appendChild(channelLine('tile-title'));
  meta.appendChild(channelLine('channel-time'));
  tile.appendChild(meta);
  applyChannelView(tile, view);

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
