import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadBrowse, loadContinueWatching } from '../../core/app-api.js';
import { screenPage, tileHint } from '../../core/companion-utils.js';
import { progressMapFromCW } from '../../core/progress.js';
import { albumsByArtist } from '../../core/home-rails.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';

// Companion artist context (FEAT-029 follow-up): mirrors the TV's artist
// drill-down (L3 off the Music tab's Artists rail) — a grid of one artist's
// albums. The TV's screen-artist-page pushes `context_id:'artist'`; with no
// companion twin the companion navigated to /companion/artist.html and got a raw
// 404 error JSON. Catalog + progress are backend state (loadBrowse + Continue-
// Watching, filtered by core/home-rails albumsByArtist so the two surfaces never
// drift); only the live artist + profile arrive over WS. Tapping an album drives
// the TV to its album detail via the existing id-addressed `select` intent
// (BUG-008 — resolve against the catalog, not a rendered tile).
export function initPage() {
  var host = window.location.hostname;
  var server = 'http://' + host + ':8765';
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    ctxTitle: document.getElementById('ctx-title'),
    gridEl: document.getElementById('txtgrid'),
    backBtn: document.getElementById('btn-back')
  };
  var state = { artist: null, profile: null, person: null, albums: [], progress: {} };
  var api = {};
  var updateBar = null;
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }

  els.backBtn.addEventListener('click', function() { api.sendIntent('back'); });

  // Breadcrumb trail (FEAT-021): Home > Albums (the Music tab) > Artist. A crumb
  // tap sends the `navigate` intent so the app teleports the TV; the companion
  // follows on the app's echoed context.
  function navigate(page, params) { api.sendIntent('navigate', { page: page, params: params }); }
  function mountCrumbs(artistName) {
    mountCompanionBreadcrumb('breadcrumb', buildCrumbs('artist', { artistName: artistName }), navigate);
  }

  function openItem(card) { api.sendIntent('select', { id: card.id }); }

  // Bare text-label tile: album title + an optional resume-percent badge, no
  // poster (matches the companion browse grid — posters live on the TV).
  function albumTile(card) {
    var hint = tileHint(state.progress, card);
    var el = document.createElement('button');
    el.className = 'ph-txt';
    el.setAttribute('data-id', card.id);
    el.classList.toggle('prog', Boolean(hint));
    var nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = [card.title].filter(Boolean).concat([card.id])[0];
    el.appendChild(nm);
    [hint].filter(Boolean).forEach(function(h) {
      var b = document.createElement('span');
      b.className = 'pct';
      b.textContent = h;
      el.appendChild(b);
    });
    el.addEventListener('click', function() { openItem(card); });
    return el;
  }

  function renderAlbums() {
    state.albums.forEach(function(c) { els.gridEl.appendChild(albumTile(c)); });
  }

  function renderNoContent() {
    var p = document.createElement('div');
    p.className = 'no-actions';
    p.textContent = 'No albums';
    els.gridEl.appendChild(p);
  }

  var RENDER = { 'true': renderAlbums, 'false': renderNoContent };
  function render() { els.gridEl.innerHTML = ''; RENDER[(state.albums.length > 0) + ''](); }

  // Albums need BOTH the artist (context) and the profile (app_state, picks the
  // catalog) — they can arrive in either order, so load only once both are set
  // and re-load if the profile changes.
  function loadAlbums() {
    [state.artist].filter(Boolean).filter(function() { return Boolean(state.profile); }).forEach(function(artist) {
      loadBrowse(server, state.profile)
        .then(function(b) {
          state.albums = albumsByArtist([b.content].filter(Boolean).concat([[]])[0], artist);
          render();
        })
        .catch(function() { state.albums = []; render(); });
    });
  }

  function loadCW() {
    loadContinueWatching(server, state.profile, state.person)
      .then(function(c) { state.progress = progressMapFromCW([c.content].filter(Boolean).concat([[]])[0]); render(); })
      .catch(function() { state.progress = {}; render(); });
  }

  function captureArtist(payload) {
    els.ctxLabel.textContent = 'Artist';
    [payload.artist].filter(Boolean).filter(function(a) { return a !== state.artist; }).forEach(function(a) {
      state.artist = a;
      els.ctxTitle.textContent = a;
      mountCrumbs(a);
      loadAlbums();
    });
  }

  function onContext(payload) {
    var page = screenPage(payload.context_id);
    var ROUTE = {
      'true':  function() { window.location.href = page + '.html'; },
      'false': function() { captureArtist(payload); }
    };
    ROUTE[(page !== 'artist') + '']();
  }

  // Profile keys the catalog + the Continue-Watching set that tints album bars
  // (FEAT-026 TASK-158 — person rides the app_state; reloads when it changes).
  function onAppState(snap) {
    [snap.profile].filter(Boolean).filter(function(p) { return p !== state.profile; }).forEach(function(p) {
      state.profile = p;
      loadAlbums();
    });
    [snap.person].filter(Boolean).filter(function(p) { return p !== state.person; }).forEach(function(p) {
      state.person = p;
      loadCW();
    });
  }

  api = connect(wsUrl(host), onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices);
  updateBar = mountScreenBar(getApi, noop);
}
