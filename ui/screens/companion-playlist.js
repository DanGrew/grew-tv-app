import { connect } from '../../core/companion-ws.js';
import { loadPlaylist, loadContinueWatching, deletePlaylist, movePlaylistTrack, removeFromPlaylist, loadBrowse, addToPlaylist, addSourceToPlaylist, playbackAction, mediaUrl } from '../../core/app-api.js';
import { screenPage, tileHint, queryString } from '../../core/companion-utils.js';
import { progressMapFromCW } from '../../core/progress.js';
import { buildCrumbs, trailCrumbs } from '../../core/breadcrumb.js';
import { peek as peekTrail, trimOnCrumb } from '../../core/nav-trail.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { rowActions, popoverTop } from '../../core/playlist-row-menu.js';
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
// detail receives). TASK-321: there is no Play / Shuffle header — you tap a track
// to start the playlist (mirrors the TV playlist page, which dropped its header
// Play/Shuffle). An EMPTY playlist still lists + opens. The TV teleports and
// echoes context — same per-person relay the browse / detail / artist companions ride.
export function initPage() {
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxTitle: document.getElementById('ctx-title'),
    gridEl: document.getElementById('txtgrid')
  };
  var state = { playlistId: null, profile: null, person: null, tracks: [], progress: {}, title: '' };
  var pop = { overlay: document.getElementById('row-pop-overlay'), menu: document.getElementById('row-pop'), openTrigger: null };
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

  // TASK-321: no header Play / Shuffle — you tap a track to start the playlist
  // (playTrack sends the id-addressed `play` intent below).

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

  // FEAT-036/039 — the "Add to playlist" sheet, the companion mirror of the app
  // playlist detail's sheet (mirrors companion-detail.js too). ONE sheet, two entry
  // points: the per-track ＋ (openAddSheet — Play Next + add ONE track, TASK-262) and
  // the manage-row "Add all to playlist" (openAddAllSheet — bulk-snapshot THIS whole
  // playlist into ANOTHER, source_type 'playlist', this one EXCLUDED, TASK-212).
  // addState.add(id) is the POST for the chosen mode (add-track vs add-source); queue /
  // createHref / exclude differ per mode, so the rest of the sheet is mode-agnostic.
  // The target gets a snapshot / append, so a toast confirms — no reload.
  var addState = { add: null, queue: null, createHref: '', statusTimer: null, exclude: null };
  function activeProfile() { return [state.profile].filter(Boolean).concat(['adults'])[0]; }
  function hideStatus() { document.getElementById('add-status').style.display = 'none'; }
  function showStatus(text) {
    var el = document.getElementById('add-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(addState.statusTimer);
    addState.statusTimer = setTimeout(hideStatus, 2500);
  }
  function closeAddSheet() { document.getElementById('add-sheet').style.display = 'none'; }
  function addExisting(id, title) {
    addState.add(id)
      .then(function() { closeAddSheet(); showStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showStatus('Could not add to playlist.'); });
  }
  function createNew() { window.location.href = addState.createHref; }
  function choiceBtn(card) {
    var b = document.createElement('button');
    b.className = 'add-choice';
    b.setAttribute('data-id', card.id);
    b.textContent = '♪ ' + card.title;
    b.addEventListener('click', function() { addExisting(card.id, card.title); });
    return b;
  }
  // TASK-253 — the per-track sheet's top option "☰ Play Next" (queue the track), above
  // the playlist cards. Present only for the per-TRACK sheet (openAddSheet sets
  // addState.queue); the "Add all" sheet leaves it null. NOT `.add-choice`.
  function queueChoiceBtn() {
    var b = document.createElement('button');
    b.className = 'add-queue';
    b.textContent = '☰ Play Next';
    b.addEventListener('click', addState.queue);
    return b;
  }
  function showAddSheet(cards) {
    var list = document.getElementById('add-sheet-list');
    list.innerHTML = '';
    [addState.queue].filter(Boolean).forEach(function() { list.appendChild(queueChoiceBtn()); });
    cards.forEach(function(c) { list.appendChild(choiceBtn(c)); });
    document.getElementById('add-sheet').style.display = 'flex';
  }
  function loadAndShowSheet() {
    loadBrowse(server, activeProfile())
      .then(function(res) { showAddSheet(playlistCards([res.content].filter(Boolean).concat([[]])[0], addState.exclude)); })
      .catch(function() { showStatus('Could not load playlists.'); });
  }
  // FEAT-040/TASK-248 — queue a track to PLAY NEXT (queue-track, per person; durable
  // override queue TASK-246). Per-person POST ⇒ live in BOTH modes. The sheet's top
  // "☰ Play Next" action — closes the sheet first, then POSTs.
  function queueTrack(card) {
    playbackAction(server, 'queue-track', state.person, { track_id: card.id })
      .then(function() { showStatus('Queued to Play Next'); })
      .catch(function() { showStatus('Could not queue track.'); });
  }
  function queueThenClose(card) { closeAddSheet(); queueTrack(card); }
  // Per-track ＋ (TASK-262): add ONE track — Play Next on top, then the playlist cards.
  function openAddSheet(card) {
    addState.add = function(id) { return addToPlaylist(server, id, card.id); };
    addState.queue = function() { queueThenClose(card); };
    addState.createHref = 'playlist-create.html?addTrack=' + encodeURIComponent(card.id) +
      '&profile=' + encodeURIComponent(activeProfile());
    addState.exclude = null;
    loadAndShowSheet();
  }
  // Manage-row "Add all to playlist" (TASK-212): snapshot THIS whole playlist into
  // ANOTHER (add-source, source_type 'playlist'), this one EXCLUDED. No Play Next.
  function openAddAllSheet() {
    addState.add = function(id) { return addSourceToPlaylist(server, id, 'playlist', state.playlistId); };
    addState.queue = null;
    addState.createHref = 'playlist-create.html?addSourceType=playlist&addSourceId=' + encodeURIComponent(state.playlistId) +
      '&profile=' + encodeURIComponent(activeProfile());
    addState.exclude = state.playlistId;
    loadAndShowSheet();
  }
  document.getElementById('btn-add-all').addEventListener('click', openAddAllSheet);
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
  // TASK-328 — the per-track edit controls (＋ ↑ ↓ ✕) no longer sit inline in the
  // row (a "wall of buttons"); they live in a single ⋮-triggered popover. The spec
  // maps each action key to its icon-only chip (same editBtn as before, just
  // relocated into the popover column); rowActions (core) decides WHICH keys a row
  // offers, gating ↑ at the first track and ↓ at the last. Icons only — the words
  // survive as aria-labels for a11y.
  function fillPop(card, i, total) {
    var spec = {
      add:  function() { return editBtn('&#65291;', 'add', 'Add to playlist', function() { openAddSheet(card); }); },
      up:   function() { return editBtn('&#8593;', 'up', 'Move up', function() { moveTrack(i, 'up'); }); },
      down: function() { return editBtn('&#8595;', 'down', 'Move down', function() { moveTrack(i, 'down'); }); },
      x:    function() { return editBtn('&#10005;', 'x', 'Remove', function() { removeTrack(i); }); }
    };
    rowActions(i, total).forEach(function(k) { pop.menu.appendChild(spec[k]()); });
  }
  // Popover open/close. A full-screen transparent overlay under the menu catches a
  // tap-outside (and intercepts a second kebab tap) — closing it; z-index layers the
  // menu above. A click on any menu chip fires its action then bubbles to the menu's
  // own close listener, so the action fires AND the popover closes. Positioning is
  // fixed (never clipped by #grid-wrap's scroll): right-aligned to the kebab, top
  // computed by popoverTop (below by default, flips above near the viewport bottom).
  function closePop() {
    pop.overlay.style.display = 'none';
    pop.menu.style.display = 'none';
    pop.menu.innerHTML = '';
    pop.openTrigger = null;
  }
  function placePop(trigger) {
    var r = trigger.getBoundingClientRect();
    pop.menu.style.right = (window.innerWidth - r.right) + 'px';
    pop.menu.style.top = popoverTop(r, window.innerHeight, pop.menu.offsetHeight) + 'px';
  }
  function showPop(trigger, card, i, total) {
    fillPop(card, i, total);
    pop.overlay.style.display = 'block';
    pop.menu.style.display = 'flex';
    placePop(trigger);
    pop.openTrigger = trigger;
  }
  // Re-tapping the same kebab closes (toggle); tapping a new one opens after closing.
  function togglePop(trigger, card, i, total) {
    var wasOpen = trigger === pop.openTrigger;
    closePop();
    ({ true: noop, false: function() { showPop(trigger, card, i, total); } })[wasOpen]();
  }
  function kebabBtn(card, i, total) {
    var b = document.createElement('button');
    b.className = 'ph-kebab';
    b.setAttribute('aria-label', 'Track actions');
    b.setAttribute('title', 'Track actions');
    b.innerHTML = '&#8942;';
    b.addEventListener('click', function() { togglePop(b, card, i, total); });
    return b;
  }
  pop.overlay.addEventListener('click', closePop);
  pop.menu.addEventListener('click', closePop);

  // Playlist items -> tile cards (id/title/duration for the progress hint). Flat:
  // a playlist carries no season/episode, so the bare track title is the label.
  function trackCards() {
    return state.tracks.map(function(item) {
      return { id: item.video.id, title: item.video.title, durationSec: item.video.duration, poster: item.video.poster };
    });
  }

  // A full-width row styled as ONE rounded box (TASK-263, the album-companion
  // .detail-track-row model): a borderless play tile (tap = play on the TV) and, on
  // the right, a single ⋮ kebab (TASK-328). The four edit chips (＋ ↑ ↓ ✕) that used
  // to sit inline now live in the kebab's popover, so the row reads as a song, not a
  // wall of buttons. The kebab stays live in Browse mode (only the play tile greys)
  // — the popover's ＋ is a per-person add (TASK-262) and ↑ ↓ ✕ are edit actions.
  function trackRow(card, i, total) {
    var row = document.createElement('div');
    row.className = 'ph-row';
    row.appendChild(trackTile(card));
    row.appendChild(kebabBtn(card, i, total));
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
    loadTracks();
  });
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { mode: mode });
  updateBar = mountScreenBar(getApi, noop);
}
