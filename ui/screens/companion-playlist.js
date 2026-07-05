import { connect } from '../../core/companion-ws.js';
import { loadPlaylist, loadContinueWatching, deletePlaylist, movePlaylistTrack, removeFromPlaylist, loadBrowse, addSourceToPlaylist, mediaUrl } from '../../core/app-api.js';
import { screenPage, tileHint, queryString } from '../../core/companion-utils.js';
import { progressMapFromCW } from '../../core/progress.js';
import { buildCrumbs, trailCrumbs } from '../../core/breadcrumb.js';
import { peek as peekTrail, trimOnCrumb } from '../../core/nav-trail.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';

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
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    ctxTitle: document.getElementById('ctx-title'),
    gridEl: document.getElementById('txtgrid'),
    playBtn: document.getElementById('btn-play'),
    shuffleBtn: document.getElementById('btn-shuffle')
  };
  var state = { playlistId: null, profile: null, person: null, tracks: [], progress: {}, title: '' };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }
  // FEAT-038 (DSYNC-2c): the switch only changes mode. BROWSE greys the
  // TV-driving controls (play/shuffle/track-play) via body.browsing so editing
  // (rename/delete/add/reorder/remove — per-person POSTs) stays live; reach the
  // library via Back (local hop). CONTROL reloads to re-run reconnect.
  function reSync() { window.location.reload(); }
  function applyMode() { document.body.classList.toggle('browsing', mode.isDesynced()); }
  function onModeChange(browsing) { ({ true: applyMode, false: reSync })[browsing](); }

  // Back: Control drives the TV back; Browse is a local hop to the library.

  // Header Play / Shuffle: drive the TV's playlist detail. Play resumes the
  // playlist from its last-played track (`play_next`, the header's own action);
  // Shuffle starts it shuffled. Neither carries params — the TV owns the live id.
  els.playBtn.addEventListener('click', function() { api.sendIntent('play_next'); });
  els.shuffleBtn.addEventListener('click', function() { api.sendIntent('shuffle'); });

  // Delete (TASK-209) — the companion mirror of the TV's delete-with-confirm
  // (screen-playlist-detail-page). A confirm overlay gates the destructive write;
  // Confirm POSTs delete, drives the TV off the now-gone playlist (`back`), and
  // returns the companion to its playlists list. Cancel just closes the overlay.
  function showConfirm() {
    document.getElementById('confirm-delete-name').textContent = state.title;
    document.getElementById('confirm-delete').style.display = 'flex';
  }
  function hideConfirm() { document.getElementById('confirm-delete').style.display = 'none'; }
  function doDelete() {
    deletePlaylist(server, state.playlistId)
      .then(function() { api.sendIntent('back'); window.location.href = 'browse.html'; })
      .catch(function() { hideConfirm(); });
  }
  // Rename (TASK-210) — the companion mirror of the TV's rename. The phone has a
  // real keyboard, so this opens the shared companion create page in rename mode
  // (a text input prefilled with the current name) rather than an on-screen
  // keyboard. The new name POSTs there; both surfaces pick it up via the catalog.
  function rename() {
    window.location.href = 'playlist-create.html?rename=' + encodeURIComponent(state.playlistId) + '&name=' + encodeURIComponent(state.title);
  }
  document.getElementById('btn-rename-playlist').addEventListener('click', rename);
  document.getElementById('btn-delete-playlist').addEventListener('click', showConfirm);
  document.getElementById('btn-confirm-delete').addEventListener('click', doDelete);
  document.getElementById('btn-cancel-delete').addEventListener('click', hideConfirm);

  // Bulk-add (TASK-212) — the companion mirror of the TV playlist detail's "Add
  // all to playlist": snapshot THIS whole playlist into ANOTHER (the add-source
  // API, source_type 'playlist'). The sheet lists the active profile's playlists
  // with this one EXCLUDED (a playlist can't be added into itself) + New playlist
  // + Cancel. The target gets a snapshot, so this playlist is unchanged — a toast
  // confirms, no reload. New playlist hands off to the create page carrying the
  // bulk source so the playlist is created then this one's tracks added into it.
  var statusTimer = null;
  function hideStatus() { document.getElementById('add-status').style.display = 'none'; }
  function showStatus(text) {
    var el = document.getElementById('add-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(hideStatus, 2500);
  }
  function closeAddSheet() { document.getElementById('add-sheet').style.display = 'none'; }
  function addExisting(id, title) {
    addSourceToPlaylist(server, id, 'playlist', state.playlistId)
      .then(function() { closeAddSheet(); showStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showStatus('Could not add to playlist.'); });
  }
  function createNew() {
    window.location.href = 'playlist-create.html?addSourceType=playlist&addSourceId=' + encodeURIComponent(state.playlistId) +
      '&profile=' + encodeURIComponent([state.profile].filter(Boolean).concat(['adults'])[0]);
  }
  function choiceBtn(card) {
    var b = document.createElement('button');
    b.className = 'add-choice';
    b.setAttribute('data-id', card.id);
    b.textContent = card.title;
    b.addEventListener('click', function() { addExisting(card.id, card.title); });
    return b;
  }
  function showAddSheet(cards) {
    var list = document.getElementById('add-sheet-list');
    list.innerHTML = '';
    cards.forEach(function(c) { list.appendChild(choiceBtn(c)); });
    document.getElementById('add-sheet').style.display = 'flex';
  }
  function openAddSheet() {
    loadBrowse(server, [state.profile].filter(Boolean).concat(['adults'])[0])
      .then(function(res) { showAddSheet(playlistCards([res.content].filter(Boolean).concat([[]])[0], state.playlistId)); })
      .catch(function() { showStatus('Could not load playlists.'); });
  }
  document.getElementById('btn-add-all').addEventListener('click', openAddSheet);
  document.getElementById('btn-add-create').addEventListener('click', createNew);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);

  // Breadcrumb trail (FEAT-021 / BUG-021): build from the recorded nav-trail top so
  // a playlist reached through a rail shows that rail (Home › Playlists › playlist)
  // and the crumb retraces to it; an empty trail (deep-link / fresh session) falls
  // back to the static Home › playlist. A crumb tap sends the `navigate` intent so
  // the app teleports the TV; the companion follows on the app's echoed context.
  // Browse mode: crumb is a local hop (reach the library without driving the TV).
  function localGo(page, params) { window.location.href = page + queryString(params); }
  function navigate(page, params) {
    // Trim the trail to the clicked ancestor (Home clears) so a later Back can't
    // retrace past this jump (FEAT-032 stale-Back fix).
    trimOnCrumb(page, params);
    ({ true: function() { localGo(page, params); }, false: function() { api.sendIntent('navigate', { page: page, params: params }); } })[mode.isDesynced()]();
  }
  function mountCrumbs(title) {
    mountCompanionBreadcrumb('breadcrumb', ({ true: trailCrumbs(peekTrail(), title), false: buildCrumbs('detail', { seriesTitle: title }) })[Boolean(peekTrail())], navigate);
  }

  // A track plays on the TV via the id-addressed `play` intent the TV's playlist
  // detail receives (it clicks the matching row -> teleports to the player).
  function playTrack(card) { api.sendIntent('play', { id: card.id }); }

  // Cover thumbnail with a load-failure fallback (TASK-287): a missing/abortive
  // poster hides the image (no broken icon, no gap) — the companion-detail.js
  // posterImg pattern. loading="lazy" keeps one small image per visible row, so
  // the single-column list stays within the deliberate low-image-concurrency
  // budget that keeps the other companion lists text-only.
  function posterImg(posterName) {
    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    var src = mediaUrl(server, posterName);
    ({
      true: function() {
        img.src = src;
        img.addEventListener('error', function() { img.style.display = 'none'; });
      },
      false: function() { img.style.display = 'none'; }
    })[String(!!src)]();
    return img;
  }

  // Track tile: a cover thumbnail (TASK-287), the track title, and an optional
  // resume-percent badge. The thumbnail sits left of the title inside the same
  // single-column row (posters otherwise live on the TV).
  function trackTile(card) {
    var hint = tileHint(state.progress, card, true);
    var el = document.createElement('button');
    el.className = 'ph-txt';
    el.setAttribute('data-id', card.id);
    el.classList.toggle('prog', Boolean(hint));
    el.appendChild(posterImg(card.poster));
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

  // Reorder + remove (TASK-211) — the companion mirror of the TV playlist detail's
  // ↑ ↓ ✕. Each POSTs BY POSITION (move-track / remove-track) then reloads the
  // list (the phone is touch, so a plain re-render is enough — no focus to keep).
  function reloadOnEdit(promise) { promise.then(loadTracks).catch(noop); }
  function moveTrack(i, direction) { reloadOnEdit(movePlaylistTrack(server, state.playlistId, i, direction)); }
  function removeTrack(i) { reloadOnEdit(removeFromPlaylist(server, state.playlistId, i)); }

  function editBtn(glyph, cls, label, onTap) {
    var b = document.createElement('button');
    b.className = 'ph-edit ' + cls;
    b.setAttribute('aria-label', label);
    b.innerHTML = glyph;
    b.addEventListener('click', onTap);
    return b;
  }
  // ↑ is omitted on the first track and ↓ on the last (an edge has nothing to swap
  // with) — matches the TV detail's edge gating; ✕ is always present.
  function appendUp(row, i) {
    [i].filter(function(x) { return x > 0; }).forEach(function() {
      row.appendChild(editBtn('&#8593;', 'up', 'Move up', function() { moveTrack(i, 'up'); }));
    });
  }
  function appendDown(row, i, total) {
    [i].filter(function(x) { return x < total - 1; }).forEach(function() {
      row.appendChild(editBtn('&#8595;', 'down', 'Move down', function() { moveTrack(i, 'down'); }));
    });
  }

  // Playlist items -> tile cards (id/title/duration for the progress hint). Flat:
  // a playlist carries no season/episode, so the bare track title is the label.
  function trackCards() {
    return state.tracks.map(function(item) {
      return { id: item.video.id, title: item.video.title, durationSec: item.video.duration, poster: item.video.poster };
    });
  }

  // A full-width row styled as ONE rounded box (TASK-263, the album-companion
  // .detail-track-row model): a borderless play tile (tap = play on the TV) plus
  // the ↑ ↓ ✕ edit controls as inner chips. A <button> can't nest, so the tile
  // stays a button and the chips sit beside it inside the .ph-row box.
  function trackRow(card, i, total) {
    var row = document.createElement('div');
    row.className = 'ph-row';
    row.appendChild(trackTile(card));
    appendUp(row, i);
    appendDown(row, i, total);
    row.appendChild(editBtn('&#10005;', 'x', 'Remove', function() { removeTrack(i); }));
    return row;
  }

  function renderTracks() {
    var cards = trackCards();
    cards.forEach(function(card, i) { els.gridEl.appendChild(trackRow(card, i, cards.length)); });
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
        state.title = p.title;
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

  function followContext(payload) {
    var page = screenPage(payload.context_id);
    var ROUTE = {
      'true':  function() { window.location.href = page + '.html'; },
      'false': function() { capturePlaylist(payload); }
    };
    ROUTE[(page !== 'playlist') + '']();
  }
  // Status strip title always; nav-follow gated in Browse mode.
  function onContext(payload) {
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
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

  mountSyncBar(mode, onModeChange);
  applyMode();
  // Browse-mode entry: browse linked here with ?id=…, so load that playlist
  // ourselves (loadPlaylist / /api/playlist) instead of waiting for the TV echo.
  [new URLSearchParams(window.location.search).get('id')].filter(Boolean).forEach(function(id) {
    state.playlistId = id;
    els.ctxLabel.textContent = 'Playlist';
    loadTracks();
  });
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { mode: mode });
  updateBar = mountScreenBar(getApi, noop);
}
