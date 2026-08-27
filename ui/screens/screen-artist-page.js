import { getParam, getProfile, getPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { buildDetailList, detailArrow, detailLeft, detailRight } from './screen-detail.js';
import { connectApp } from '../../core/app-ws.js';
import { loadBrowse, loadContinueWatching, loadAlbum, addToPlaylist } from '../../core/app-api.js';
import { itemMediaType, queueAdd, queueAddStatus } from '../../core/queue-shell-config.js';
import { progressMapFromCW } from '../../core/progress.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';
import { albumsByArtist } from '../../core/home-rails.js';
import { artistTracks } from '../../core/artist-tracks.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { gridIndex } from '../../core/playlist-name.js';

// TASK-322 (FEAT-046) — the artist page is a SONG LIST of all the artist's tracks,
// grouped by album (newest album first, track order within), reusing the album/
// playlist detail row markup (screen-detail buildDetailList + its d-pad helpers).
// Tapping a song plays the ARTIST source from there: navTo('audio.html',
// {artist, track}) → the audio page fires play-source {artist} then play-track, so
// playback continues through the artist's songs (shuffle is server-owned, per the
// artist's stored pref — TASK-320). No header Play/Shuffle — consistent with album/
// playlist (TASK-321); you start by tapping a song.
//
// Data (impl choice: option (b), client-assembly — no backend endpoint, so no
// co-deploy): the album grid already available via albumsByArtist (browse cards,
// newest-first by year) + one /api/album fetch per album, flattened in that order
// (core/artist-tracks) to reproduce the artist source order. N = the artist's album
// count (2–10 for the family rips — see the PR perf note). Perf: the .detail-row is
// FLAT (no per-row backdrop-filter — artist.html) so the longest list stays cheap.
// Backend = page origin, not a hardcoded host (BUG-009).
var SERVER = window.location.origin;

export function initArtistPage() {
  var artist = getParam('artist');
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];

  // Tapping a song → the artist player, jumping to this track (the audio page fires
  // play-source {artist} then play-track). from:'artist' so Back returns here.
  function onPlayItem(item) { navTo('audio.html', { artist: artist, track: item.video.id, from: 'artist' }); }

  // Entry focus lands on the first track row; tapping it starts the artist from the
  // top (mirrors the album/playlist detail focus — TASK-321).
  function focusFirstRow() {
    [document.querySelector('.detail-row')].filter(Boolean).forEach(function(r) { r.focus(); });
  }

  // Back collapses one level — to the Music tab on the browse page (?tab=music).
  function goBack(e) {
    [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); });
    navTo('browse.html', { tab: 'music' });
  }

  // TASK-440 — the artist song list's "Add to playlist" sheet, ported from
  // screen-album-detail-page's per-track openAddSheet (album tracks and artist
  // tracks are both music-only, so this is the same machinery minus the album
  // header's bulk "Add all" — the artist page has no equivalent action).
  var addState = { add: null, queue: null, createParams: {}, returnFocus: function() {}, cells: [], statusTimer: null };

  function focusAdd(i) { addState.cells[i].focus(); }
  function focusRow(id) {
    [document.querySelector('.detail-row[data-id="' + id + '"]')].filter(Boolean).forEach(function(r) { r.focus(); });
  }
  function closeAddSheet() {
    document.getElementById('add-sheet').style.display = 'none';
    addState.returnFocus();
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
    addState.add(id)
      .then(function() { closeAddSheet(); showStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showStatus('Could not add to playlist.'); });
  }
  function createNew() { navTo('playlist-create.html', addState.createParams); }

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

  function buildQueueChoice() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'add-queue';
    b.textContent = '☰ Play Next';
    b.addEventListener('click', addState.queue);
    b.addEventListener('keydown', onAddKey);
    document.getElementById('add-sheet-list').appendChild(b);
    return b;
  }
  function queueCells() { return [addState.queue].filter(Boolean).map(buildQueueChoice); }

  function buildPlaylistChoice(card) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'add-choice';
    b.textContent = '♪ ' + card.title;
    b.setAttribute('data-id', card.id);
    b.addEventListener('click', function() { addExisting(card.id, card.title); });
    b.addEventListener('keydown', onAddKey);
    document.getElementById('add-sheet-list').appendChild(b);
    return b;
  }
  function showAddSheet(cards) {
    document.getElementById('add-sheet-list').innerHTML = '';
    addState.cells = queueCells()
      .concat(cards.map(buildPlaylistChoice))
      .concat([document.getElementById('btn-add-create'), document.getElementById('btn-add-cancel')]);
    document.getElementById('add-sheet').style.display = 'flex';
    focusAdd(0);
  }
  function loadAndShowSheet() {
    loadBrowse(SERVER, profile)
      .then(function(res) { showAddSheet(playlistCards(res.content)); })
      .catch(function() { showStatus('Could not load playlists.'); });
  }
  // TASK-504 — through queueAdd, THE ＋Queue producer: appends to the end of the
  // unified queue, same as every other ＋ on either surface.
  // BUG-531 — the ROW's own itemType names the Queue, not this screen.
  function queueTrack(item) {
    var mediaType = itemMediaType(item.video.itemType);
    queueAdd(SERVER, mediaType, getPerson(), item.video.id)
      .then(function() { showStatus(queueAddStatus(mediaType)); })
      .catch(function() { showStatus('Could not queue track.'); });
  }
  function queueThenClose(item) { closeAddSheet(); queueTrack(item); }

  // Per-row: the single ＋ opens the sheet for ONE track — Play Next on top,
  // playlist cards below (mirrors the album page). Return focus to the track row.
  function openAddSheet(item) {
    addState.add = function(id) { return addToPlaylist(SERVER, id, item.video.id); };
    addState.queue = function() { queueThenClose(item); };
    addState.createParams = { addTrack: item.video.id };
    addState.returnFocus = function() { focusRow(item.video.id); };
    loadAndShowSheet();
  }

  var wsApp = connectApp(window.location.origin, function(intent, params) {
    var INTENTS = {
      navigate_up:   function() { detailArrow({ key: 'ArrowUp',   preventDefault: function() {} }); },
      navigate_down: function() { detailArrow({ key: 'ArrowDown', preventDefault: function() {} }); },
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
  wsApp.sendContext({ context_id: 'artist', artist: artist });
  // Live snapshot so the companion mirrors this artist state.
  wsApp.sendAppState({ screen: 'artist', artist: artist, profile: profile });

  document.getElementById('btn-add-create').addEventListener('click', createNew);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);
  document.getElementById('btn-add-create').addEventListener('keydown', onAddKey);
  document.getElementById('btn-add-cancel').addEventListener('keydown', onAddKey);
  document.addEventListener('keydown', dispatchKey);

  initPage({
    onEnter: focusFirstRow,
    keys: {
      Escape:     goBack,
      Backspace:  goBack,
      ArrowUp:    detailArrow,
      ArrowDown:  detailArrow,
      ArrowLeft:  detailLeft,
      ArrowRight: detailRight
    },
    remote: {}
  });

  Promise.all([
    loadBrowse(SERVER, profile),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      var cw = [res[1].content].filter(Boolean).concat([[]])[0];
      var cards = [res[0].content].filter(Boolean).concat([[]])[0];
      var albums = albumsByArtist(cards, artist);
      var progress = progressMapFromCW(cw);
      mountBreadcrumb('breadcrumb', buildCrumbs('artist', { artistName: artist }));
      return Promise.all(albums.map(function(a) { return loadAlbum(SERVER, a.id).catch(function() { return null; }); }))
        .then(function(details) {
          buildDetailList(SERVER, artistTracks(artist, details), progress, onPlayItem, openAddSheet, null, null, null, { suppressResume: true, albumHeaders: true });
          focusFirstRow();
        });
    })
    .catch(function() { navTo('error.html'); });
}
