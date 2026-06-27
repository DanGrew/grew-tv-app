import { getParam, getProfile, getPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { buildDetailList, detailArrow, detailLeft, detailRight, focusFirstDetailRow } from './screen-detail.js';
import { connectApp } from '../../core/app-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadAlbum, loadContinueWatching, addToPlaylist, loadBrowse } from '../../core/app-api.js';
import { progressMapFromCW } from '../../core/progress.js';
import { playNextIndex } from '../../core/series-detail.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { gridIndex } from '../../core/playlist-name.js';

// FEAT-018 (TASK-130) album detail. An album is a series, so this reuses the
// FEAT-017 series-detail render + d-pad nav (buildDetailList + the detailArrow/
// Left/Right helpers) wholesale; only the wiring differs — tracks play in the
// <audio> player (audio.html) not the video player, and the header gains a
// Shuffle action that starts the album shuffled. Track rows reuse items[].episode
// as the track number via episodeLabel.
var SERVER = window.location.origin;

export function initAlbumDetailPage() {
  var albumId = getParam('album');
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var state = { album: { items: [] }, progress: {} };

  // resume = backend position (the row default); restart = from 0. Always carry
  // the album id so the player can build the queue.
  var PLAY_PARAMS = {
    resume:  function(id) { return { album: albumId, track: id, from: 'detail-album' }; },
    restart: function(id) { return { album: albumId, track: id, from: 'detail-album', restart: '1' }; }
  };
  function play(item, mode) { navTo('audio.html', PLAY_PARAMS[mode](item.video.id)); }
  function onPlayItem(item, i, mode) { play(item, mode); }

  // Header Play: the track after the most-recently-played one (wraps), resumed.
  function playFromResume() {
    var idx = playNextIndex(state.album.items, state.progress);
    [state.album.items[idx]].filter(Boolean).forEach(function(item) { play(item, 'resume'); });
  }

  // Header Shuffle: start the album shuffled from its first track (the player
  // builds + holds the shuffled order).
  function shufflePlay() {
    [state.album.items[0]].filter(Boolean).forEach(function(item) {
      navTo('audio.html', { album: albumId, track: item.video.id, shuffle: '1', from: 'detail-album' });
    });
  }

  function goBack(e) { [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); }); navTo('browse.html'); }

  // FEAT-036/TASK-206 — "Add to playlist" sheet. The per-row + Playlist control
  // (screen-detail.appendAdd) calls openAddSheet(item); the sheet lists the active
  // profile's playlists (loadBrowse already profile-filters, so every card is a
  // valid target — see core/playlist-pick) plus Create-new + Cancel. Picking POSTs
  // add-track; Create-new hands off to the create screen carrying the track id. The
  // sheet owns its keydown (stopPropagation) so the detail d-pad never fires beneath
  // it, mirroring the playlist-detail delete-confirm overlay.
  var addState = { trackId: null, cells: [], statusTimer: null };

  function focusAdd(i) { addState.cells[i].focus(); }
  function focusTrackRow() {
    [document.querySelector('.detail-row[data-id="' + addState.trackId + '"]')].filter(Boolean).forEach(function(r) { r.focus(); });
  }
  function closeAddSheet() {
    document.getElementById('add-sheet').style.display = 'none';
    focusTrackRow();
  }
  function hideStatus() { document.getElementById('add-status').style.display = 'none'; }
  // Transient confirmation — fades after 2.5s; a fresh add clears the prior timer
  // so a rapid second toast restarts the clock rather than vanishing early.
  function showStatus(text) {
    var el = document.getElementById('add-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(addState.statusTimer);
    addState.statusTimer = setTimeout(hideStatus, 2500);
  }
  function addExisting(id, title) {
    addToPlaylist(SERVER, id, addState.trackId)
      .then(function() { closeAddSheet(); showStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showStatus('Could not add to playlist.'); });
  }
  function createNew() { navTo('playlist-create.html', { addTrack: addState.trackId }); }

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
  function openAddSheet(item) {
    addState.trackId = item.video.id;
    loadBrowse(SERVER, profile)
      .then(function(res) { showAddSheet(playlistCards(res.content)); })
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
  wsApp.sendContext({ context_id: 'detail', series_id: albumId });
  wsApp.sendAppState({ screen: 'detail', itemId: albumId, profile: profile });

  document.getElementById('btn-back-detail').addEventListener('click', goBack);
  document.getElementById('btn-play-next').addEventListener('click', playFromResume);
  document.getElementById('btn-shuffle').addEventListener('click', shufflePlay);
  document.getElementById('btn-add-create').addEventListener('click', createNew);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);
  document.getElementById('btn-add-create').addEventListener('keydown', onAddKey);
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
    loadAlbum(SERVER, albumId),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      state.album = res[0];
      state.progress = progressMapFromCW(res[1].content);
      mountBreadcrumb('breadcrumb', buildCrumbs('detail', { seriesId: albumId, seriesTitle: state.album.title }));
      buildDetailList(SERVER, state.album, state.progress, onPlayItem, openAddSheet);
      focusFirstDetailRow();
    })
    .catch(function() { navTo('error.html'); });
}
