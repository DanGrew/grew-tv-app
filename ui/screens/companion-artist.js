import { connect } from '../../core/companion-ws.js';
import { loadBrowse, loadContinueWatching } from '../../core/app-api.js';
import { screenPage, tileHint, queryString } from '../../core/companion-utils.js';
import { progressMapFromCW } from '../../core/progress.js';
import { albumsByArtist, artistFromId } from '../../core/home-rails.js';
import { buildCrumbs, trailCrumbs } from '../../core/breadcrumb.js';
import { pushUnique as pushTrail, trimOnCrumb, entries as entriesTrail } from '../../core/nav-trail.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';

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
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    ctxTitle: document.getElementById('ctx-title'),
    gridEl: document.getElementById('txtgrid'),
    playBtn: document.getElementById('btn-play'),
    shuffleBtn: document.getElementById('btn-shuffle')
  };
  var state = { artist: null, profile: null, person: null, albums: [], progress: {} };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }
  // FEAT-038 (DSYNC-2c): the switch only changes mode. BROWSE greys play/shuffle
  // (TV-driving); album tiles STAY openable (they navigate into album detail
  // locally). CONTROL reloads (reconnect).
  function reSync() { window.location.reload(); }
  function applyMode() { document.body.classList.toggle('browsing', mode.isDesynced()); }
  function onModeChange(browsing) { ({ true: applyMode, false: reSync })[browsing](); }

  // Play / Shuffle header (TASK-214): drive the TV's artist screen to the player
  // on this artist source. Play-all sends PLAY_ARTIST, Shuffle reuses SHUFFLE —
  // the artist screen owns the live artist id, so neither intent carries params.
  els.playBtn.addEventListener('click', function() { api.sendIntent('playArtist'); });
  els.shuffleBtn.addEventListener('click', function() { api.sendIntent('shuffle'); });

  // Breadcrumb trail (FEAT-021 / BUG-021): the artist page records its OWN
  // artist.html entry (so a child album/player returns here), so the rail it was
  // reached through is the browse.html entry sitting just BELOW that. Build the
  // middle crumb from that rail entry (Home › Artists › Artist) so it retraces to
  // the actual rail, not the generic Music tab. A deep-link / fresh session has no
  // browse entry, so fall back to the static Home › Music › Artist. Control: a crumb
  // tap sends the `navigate` intent (TV teleports, companion follows). Browse: a
  // local hop to the library.
  function railEntry() {
    return entriesTrail().filter(function(e) { return e.page === 'browse.html'; }).slice(-1)[0];
  }
  function localGo(page, params) { window.location.href = page + queryString(params); }
  function navigate(page, params) {
    // Trim the trail to the clicked ancestor (Home clears) so a later Back can't
    // retrace past this jump (FEAT-032 stale-Back fix).
    trimOnCrumb(page, params);
    ({ true: function() { localGo(page, params); }, false: function() { api.sendIntent('navigate', { page: page, params: params }); } })[mode.isDesynced()]();
  }
  function mountCrumbs(artistName) {
    mountCompanionBreadcrumb('breadcrumb', ({ true: trailCrumbs(railEntry(), artistName), false: buildCrumbs('artist', { artistName: artistName }) })[Boolean(railEntry())], navigate);
  }

  // Tapping an album: Control sends `select` (TV drives, companion follows);
  // Browse opens the album's detail locally (carrying ?id) — no TV interruption.
  function openItemLocal(card) { window.location.href = 'detail.html?id=' + encodeURIComponent(card.id); }
  function openItem(card) {
    ({ true: function() { openItemLocal(card); }, false: function() { api.sendIntent('select', { id: card.id }); } })[mode.isDesynced()]();
  }

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
      // FEAT-032 (TASK-218): record this artist's albums page as a trail level so a
      // child (album detail / player) can return here, not skip back to the artists
      // rail. pushUnique avoids stacking a duplicate when re-entered via a child's Back.
      pushTrail({ page: 'artist.html', params: { artist: a }, label: a });
      mountCrumbs(a);
      loadAlbums();
    });
  }

  function followContext(payload) {
    var page = screenPage(payload.context_id);
    var ROUTE = {
      'true':  function() { window.location.href = page + '.html'; },
      'false': function() { captureArtist(payload); }
    };
    ROUTE[(page !== 'artist') + '']();
  }
  // Status strip title always; nav-follow gated in Browse mode.
  function onContext(payload) {
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
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

  mountSyncBar(mode, onModeChange);
  applyMode();
  // Browse-mode entry: browse linked here with ?id=<artist>, so seed the artist
  // ourselves (captureArtist loads its albums once the profile arrives).
  [new URLSearchParams(window.location.search).get('id')].filter(Boolean).forEach(function(id) { captureArtist({ artist: artistFromId(id) }); });
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { mode: mode });
  updateBar = mountScreenBar(getApi, noop);
}
