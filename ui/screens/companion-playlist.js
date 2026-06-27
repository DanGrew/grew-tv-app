import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadPlaylist, loadContinueWatching } from '../../core/app-api.js';
import { screenPage, tileHint } from '../../core/companion-utils.js';
import { progressMapFromCW } from '../../core/progress.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';

// FEAT-036 (TASK-205) — the companion playlist context: mirrors the TV's playlist
// detail (its flat track list). The TV's screen-playlist-detail-page pushes
// context_id:'playlist'; with no companion twin the companion would land on the
// series detail (loadSeries(playlistId) 404s) — exactly the gap the artist twin
// fixed for context_id:'artist'. Tracks + per-track progress are backend state
// (loadPlaylist + Continue-Watching, keyed by core/progress so the two surfaces
// never drift); only the live playlist id + profile arrive over WS. Tapping a
// track plays it on the TV (the id-addressed `play` intent the TV's playlist
// detail receives); the Play / Shuffle header drives the whole playlist
// (`play_next` / `shuffle`, the TV header's own actions). An EMPTY playlist still
// lists + opens. The TV teleports and echoes context — same per-person relay the
// browse / detail / artist companions ride.
export function initPage() {
  var host = window.location.hostname;
  var server = 'http://' + host + ':8765';
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    ctxTitle: document.getElementById('ctx-title'),
    gridEl: document.getElementById('txtgrid'),
    backBtn: document.getElementById('btn-back'),
    playBtn: document.getElementById('btn-play'),
    shuffleBtn: document.getElementById('btn-shuffle')
  };
  var state = { playlistId: null, profile: null, person: null, tracks: [], progress: {} };
  var api = {};
  var updateBar = null;
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }

  els.backBtn.addEventListener('click', function() { api.sendIntent('back'); });

  // Header Play / Shuffle: drive the TV's playlist detail. Play resumes the
  // playlist from its last-played track (`play_next`, the header's own action);
  // Shuffle starts it shuffled. Neither carries params — the TV owns the live id.
  els.playBtn.addEventListener('click', function() { api.sendIntent('play_next'); });
  els.shuffleBtn.addEventListener('click', function() { api.sendIntent('shuffle'); });

  // Breadcrumb trail (FEAT-021): Home > this playlist (current). A crumb tap sends
  // the `navigate` intent so the app teleports the TV; the companion follows on
  // the app's echoed context. Same `detail` trail the app's playlist detail mounts.
  function navigate(page, params) { api.sendIntent('navigate', { page: page, params: params }); }
  function mountCrumbs(title) {
    mountCompanionBreadcrumb('breadcrumb', buildCrumbs('detail', { seriesTitle: title }), navigate);
  }

  // A track plays on the TV via the id-addressed `play` intent the TV's playlist
  // detail receives (it clicks the matching row -> teleports to the player).
  function playTrack(card) { api.sendIntent('play', { id: card.id }); }

  // Bare text-label tile: track title + an optional resume-percent badge, no
  // poster (posters live on the TV — matches the companion browse / artist grids).
  function trackTile(card) {
    var hint = tileHint(state.progress, card);
    var el = document.createElement('button');
    el.className = 'ph-txt';
    el.setAttribute('data-id', card.id);
    el.classList.toggle('prog', Boolean(hint));
    var nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = card.title;
    el.appendChild(nm);
    [hint].filter(Boolean).forEach(function(h) {
      var b = document.createElement('span');
      b.className = 'pct';
      b.textContent = h;
      el.appendChild(b);
    });
    el.addEventListener('click', function() { playTrack(card); });
    return el;
  }

  // Playlist items -> tile cards (id/title/duration for the progress hint). Flat:
  // a playlist carries no season/episode, so the bare track title is the label.
  function trackCards() {
    return state.tracks.map(function(item) {
      return { id: item.video.id, title: item.video.title, durationSec: item.video.duration };
    });
  }

  function renderTracks() {
    trackCards().forEach(function(card) { els.gridEl.appendChild(trackTile(card)); });
  }

  function renderEmpty() {
    var p = document.createElement('div');
    p.className = 'no-actions';
    p.textContent = 'No tracks';
    els.gridEl.appendChild(p);
  }

  var RENDER = { 'true': renderTracks, 'false': renderEmpty };
  function render() { els.gridEl.innerHTML = ''; RENDER[(state.tracks.length > 0) + ''](); }

  function loadTracks() {
    loadPlaylist(server, state.playlistId)
      .then(function(p) {
        state.tracks = [p.items].filter(Boolean).concat([[]])[0];
        els.ctxTitle.textContent = p.title;
        mountCrumbs(p.title);
        render();
      })
      .catch(function() { state.tracks = []; render(); });
  }

  function loadCW() {
    loadContinueWatching(server, state.profile, state.person)
      .then(function(c) { state.progress = progressMapFromCW([c.content].filter(Boolean).concat([[]])[0]); render(); })
      .catch(function() { state.progress = {}; render(); });
  }

  function capturePlaylist(payload) {
    els.ctxLabel.textContent = 'Playlist';
    [payload.playlist].filter(Boolean).filter(function(id) { return id !== state.playlistId; }).forEach(function(id) {
      state.playlistId = id;
      loadTracks();
    });
  }

  function onContext(payload) {
    var page = screenPage(payload.context_id);
    var ROUTE = {
      'true':  function() { window.location.href = page + '.html'; },
      'false': function() { capturePlaylist(payload); }
    };
    ROUTE[(page !== 'playlist') + '']();
  }

  // Profile keys the Continue-Watching set that tints track bars (FEAT-026
  // TASK-158 — person rides the app_state; reloads when it changes). The track
  // list itself is id-addressed (loadPlaylist), so it does not depend on profile.
  function onAppState(snap) {
    [snap.profile].filter(Boolean).filter(function(p) { return p !== state.profile; }).forEach(function(p) { state.profile = p; });
    [snap.person].filter(Boolean).filter(function(p) { return p !== state.person; }).forEach(function(p) {
      state.person = p;
      loadCW();
    });
  }

  api = connect(wsUrl(host), onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices);
  updateBar = mountScreenBar(getApi, noop);
}
