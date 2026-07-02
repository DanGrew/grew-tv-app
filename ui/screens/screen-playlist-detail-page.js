import { getParam, getProfile, getPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { buildDetailList, detailArrow, detailLeft, detailRight, focusFirstDetailRow } from './screen-detail.js';
import { connectApp } from '../../core/app-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadPlaylist, loadContinueWatching, deletePlaylist, movePlaylistTrack, removeFromPlaylist, loadBrowse, addSourceToPlaylist, mediaUrl } from '../../core/app-api.js';
import { coverMosaicHtml } from '../../core/cover-mosaic.js';
import { progressMapFromCW } from '../../core/progress.js';
import { primaryAction } from '../../core/series-detail.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { gridIndex } from '../../core/playlist-name.js';

// FEAT-036 (TASK-204) playlist detail. A user playlist resolves into the same
// detail shape as an album (/api/playlist), so this reuses the FEAT-017
// series-detail render + d-pad nav (buildDetailList + the detailArrow/Left/Right
// helpers) wholesale — identical to album-detail, only the source differs: it
// loads /api/playlist and plays the FEAT-031 `playlist` source. An EMPTY playlist
// is valid: buildDetailList renders no rows and Play/Shuffle no-op.
var SERVER = window.location.origin;

export function initPlaylistDetailPage() {
  var playlistId = getParam('playlist');
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var state = { playlist: { items: [] }, progress: {} };

  // resume = backend position (the row default); restart = from 0. Always carry
  // the playlist id so the player builds the playlist-source queue.
  var PLAY_PARAMS = {
    resume:  function(id) { return { playlist: playlistId, track: id, from: 'detail-playlist' }; },
    restart: function(id) { return { playlist: playlistId, track: id, from: 'detail-playlist', restart: '1' }; }
  };
  function play(item, mode) { navTo('audio.html', PLAY_PARAMS[mode](item.video.id)); }
  function onPlayItem(item, i, mode) { play(item, mode); }

  // Header Play: continue the playlist at the right track (TASK-276). A track left
  // part-played resumes THAT track (from 0 — no mid-song resume); a finished track
  // advances to the next (wrapping last->first). primaryAction encodes that
  // continue/next/again choice; playNextIndex would always skip forward, dropping
  // a half-heard track.
  function playFromResume() {
    var idx = primaryAction(state.playlist.items, state.progress).index;
    [state.playlist.items[idx]].filter(Boolean).forEach(function(item) { play(item, 'resume'); });
  }

  // Header Shuffle: start the playlist shuffled from its first track (the player
  // builds + holds the shuffled order).
  function shufflePlay() {
    [state.playlist.items[0]].filter(Boolean).forEach(function(item) {
      navTo('audio.html', { playlist: playlistId, track: item.video.id, shuffle: '1', from: 'detail-playlist' });
    });
  }

  function goBack(e) { [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); }); navTo('browse.html'); }

  // FEAT-039/TASK-244: render the playlist's member album-art (TASK-233
  // coverArt[]) as a 2x2 mosaic in the header; an empty playlist / old backend
  // (no field) shows the existing music placeholder. Re-run after track edits
  // (membership can change which arts show). cyclomatic-1: count -> dispatch.
  var COVER = {
    true: function() {
      document.getElementById('detail-header-mosaic').style.display = 'block';
      document.getElementById('detail-header-placeholder').style.display = 'none';
    },
    false: function() {
      document.getElementById('detail-header-mosaic').style.display = 'none';
      document.getElementById('detail-header-placeholder').style.display = 'flex';
    }
  };
  function renderCover() {
    var refs = [state.playlist.coverArt].filter(Boolean).concat([[]])[0];
    var urls = refs.map(function(r) { return mediaUrl(SERVER, r); }).filter(Boolean);
    document.getElementById('detail-header-mosaic').innerHTML = coverMosaicHtml(urls);
    COVER[String(urls.length > 0)]();
  }

  // Reorder + remove (TASK-211): per-track ↑ ↓ ✕ wired through buildDetailList.
  // Each POSTs by POSITION (move-track / remove-track), then reloads the playlist
  // and rebuilds the list so the order/membership reflects the server truth, and
  // restores focus to a sensible row so repeated d-pad edits stay fluid.
  var DIR_DELTA = { up: -1, down: 1 };
  function reloadList(focusSel) {
    return loadPlaylist(SERVER, playlistId).then(function(pl) {
      state.playlist = pl;
      renderCover();
      buildDetailList(SERVER, state.playlist, state.progress, onPlayItem, null, null, onMove, onRemove);
      ([document.querySelector(focusSel)].filter(Boolean)
        .concat([document.querySelector('.detail-row')]).filter(Boolean)
        .concat([document.getElementById('btn-play-next')]))[0].focus();
    });
  }
  // Keep focus on the moved track's same-direction control at its NEW index, so a
  // run of Up/Up (or Down/Down) walks one track without re-targeting each press.
  function onMove(item, i, direction) {
    var newIdx = i + DIR_DELTA[direction];
    movePlaylistTrack(SERVER, playlistId, i, direction)
      .then(function() { return reloadList('.detail-row[data-index="' + newIdx + '"] .detail-move-' + direction); })
      .catch(function() {});
  }
  // After a remove the row that was at i+1 slides into i — focus it (the next
  // track), so the list keeps a live focus; falls back to the first row / header
  // when the removed track was last or the playlist is now empty.
  function onRemove(item, i) {
    removeFromPlaylist(SERVER, playlistId, i)
      .then(function() { return reloadList('.detail-row[data-index="' + i + '"]'); })
      .catch(function() {});
  }

  // Rename (TASK-210): hand off to the shared name screen in rename mode — it
  // prefills the current title on its on-screen keyboard and POSTs the rename, then
  // returns to this playlist (same id) showing the new name.
  function rename() { navTo('playlist-create.html', { rename: playlistId, name: state.playlist.title }); }

  // Delete (TASK-208): a confirm overlay gates the destructive action. The overlay
  // buttons own their keydown (stopPropagation) so the detail screen's d-pad +
  // Back never fire underneath while the dialog is open. Confirm POSTs delete and
  // returns to browse; Cancel / Escape close back to the still-listed playlist.
  function showConfirm() {
    document.getElementById('confirm-delete-name').textContent = state.playlist.title;
    document.getElementById('confirm-delete').style.display = 'flex';
    document.getElementById('btn-confirm-delete').focus();
  }
  function hideConfirm() {
    document.getElementById('confirm-delete').style.display = 'none';
    document.getElementById('btn-delete-playlist').focus();
  }
  function doDelete() {
    deletePlaylist(SERVER, playlistId)
      .then(function() { navTo('browse.html'); })
      .catch(function() { hideConfirm(); });
  }
  function focusConfirm() { document.getElementById('btn-confirm-delete').focus(); }
  function focusCancel() { document.getElementById('btn-cancel-delete').focus(); }
  function confirmKey(e) {
    e.stopPropagation();
    var H = { ArrowLeft: focusConfirm, ArrowRight: focusCancel, Escape: hideConfirm, Backspace: hideConfirm };
    [H[e.key]].filter(Boolean).forEach(function(fn) { e.preventDefault(); fn(); });
  }

  // Bulk-add (TASK-212): the header "Add all to playlist" button snapshots THIS
  // whole playlist into ANOTHER playlist (the add-source API, source_type
  // 'playlist'). The sheet mirrors the album-detail Add sheet — list the active
  // profile's playlists (this one EXCLUDED, since a playlist can't be added into
  // itself) + New playlist + Cancel, owning its own keydown so the d-pad never
  // fires beneath it. The target gets a snapshot, so this playlist is unchanged
  // and no reload is needed — just a transient toast.
  var addState = { cells: [], statusTimer: null };
  function focusAdd(i) { addState.cells[i].focus(); }
  function closeAddSheet() {
    document.getElementById('add-sheet').style.display = 'none';
    document.getElementById('btn-add-all').focus();
  }
  function hideStatus() { document.getElementById('add-status').style.display = 'none'; }
  function showStatus(text) {
    var el = document.getElementById('add-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(addState.statusTimer);
    addState.statusTimer = setTimeout(hideStatus, 2500);
  }
  function addExisting(id, title) {
    addSourceToPlaylist(SERVER, id, 'playlist', playlistId)
      .then(function() { closeAddSheet(); showStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showStatus('Could not add to playlist.'); });
  }
  function createNew() { navTo('playlist-create.html', { addSourceType: 'playlist', addSourceId: playlistId }); }
  function moveAdd(e) {
    var i = addState.cells.indexOf(document.activeElement);
    var ni = gridIndex(i, 1, addState.cells.length, e.key);
    [ni].filter(function(x) { return x !== i; }).filter(function() { return i > -1; }).forEach(function(x) { e.preventDefault(); focusAdd(x); });
  }
  var ADD_CLOSE = { Escape: true, Backspace: true };
  function closeKeys(e) {
    [ADD_CLOSE[e.key]].filter(Boolean).forEach(function() { e.preventDefault(); closeAddSheet(); });
  }
  function onAddKey(e) { e.stopPropagation(); moveAdd(e); closeKeys(e); }
  function buildPlaylistChoice(card) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'add-choice';
    b.textContent = card.title;
    b.setAttribute('data-id', card.id);
    b.addEventListener('click', function() { addExisting(card.id, card.title); });
    b.addEventListener('keydown', onAddKey);
    document.getElementById('add-sheet-list').appendChild(b);
    return b;
  }
  function showAddSheet(cards) {
    document.getElementById('add-sheet-list').innerHTML = '';
    addState.cells = cards.map(buildPlaylistChoice)
      .concat([document.getElementById('btn-add-create'), document.getElementById('btn-add-cancel')]);
    document.getElementById('add-sheet').style.display = 'flex';
    focusAdd(0);
  }
  function openAddSheet() {
    loadBrowse(SERVER, profile)
      .then(function(res) { showAddSheet(playlistCards(res.content, playlistId)); })
      .catch(function() { showStatus('Could not load playlists.'); });
  }

  var wsApp = connectApp(wsUrl(window.location.hostname), function(intent, params) {
    var INTENTS = {
      navigate_up:   function() { detailArrow({ key: 'ArrowUp',   preventDefault: function() {} }); },
      navigate_down: function() { detailArrow({ key: 'ArrowDown', preventDefault: function() {} }); },
      play_next:     function() { playFromResume(); },
      shuffle:       function() { shufflePlay(); },
      play:          function() {
        var id = [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)[0];
        var target = [id].filter(Boolean).map(function(i) { return document.querySelector('.detail-row[data-id="' + i + '"]'); }).filter(Boolean)[0];
        ([target].filter(Boolean).concat([document.activeElement]))[0].click();
      },
      back:          function() { goBack(null); },
      navigate:      function() { navTo(params.page, params.params); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  // A dedicated `playlist` context (not the album/series `detail`) so the
  // companion routes to its own playlist twin (companion-playlist.js), exactly as
  // the artist drill-down emits `artist` — `detail` would land on the series
  // companion and loadSeries(playlistId) 404s (TASK-205).
  wsApp.sendContext({ context_id: 'playlist', playlist: playlistId });
  wsApp.sendAppState({ screen: 'playlist', itemId: playlistId, profile: profile });
  document.getElementById('btn-play-next').addEventListener('click', playFromResume);
  document.getElementById('btn-shuffle').addEventListener('click', shufflePlay);
  document.getElementById('btn-add-all').addEventListener('click', openAddSheet);
  document.getElementById('btn-rename-playlist').addEventListener('click', rename);
  document.getElementById('btn-delete-playlist').addEventListener('click', showConfirm);
  document.getElementById('btn-confirm-delete').addEventListener('click', doDelete);
  document.getElementById('btn-cancel-delete').addEventListener('click', hideConfirm);
  document.getElementById('btn-add-create').addEventListener('click', createNew);
  document.getElementById('btn-add-create').addEventListener('keydown', onAddKey);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);
  document.getElementById('btn-add-cancel').addEventListener('keydown', onAddKey);
  document.addEventListener('keydown', dispatchKey);

  initPage({
    onEnter: focusFirstDetailRow,
    keys: {
      Escape:     function(e) { goBack(e); },
      Backspace:  function(e) { goBack(e); },
      ArrowUp:    detailArrow,
      ArrowDown:  detailArrow,
      ArrowLeft:  detailLeft,
      ArrowRight: detailRight
    },
    remote: {}
  });

  Promise.all([
    loadPlaylist(SERVER, playlistId),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      state.playlist = res[0];
      state.progress = progressMapFromCW(res[1].content);
      renderCover();
      mountBreadcrumb('breadcrumb', buildCrumbs('detail', { seriesId: playlistId, seriesTitle: state.playlist.title }));
      buildDetailList(SERVER, state.playlist, state.progress, onPlayItem, null, null, onMove, onRemove);
      focusFirstDetailRow();
    })
    .catch(function() { navTo('error.html'); });
}
