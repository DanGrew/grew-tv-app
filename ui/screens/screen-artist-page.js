import { getParam, getProfile, getPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { buildDetailList, detailArrow, detailLeft, detailRight } from './screen-detail.js';
import { connectApp } from '../../core/app-ws.js';
import { loadBrowse, loadContinueWatching, loadAlbum } from '../../core/app-api.js';
import { progressMapFromCW } from '../../core/progress.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';
import { albumsByArtist } from '../../core/home-rails.js';
import { artistTracks } from '../../core/artist-tracks.js';

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
          buildDetailList(SERVER, artistTracks(artist, details), progress, onPlayItem, null, null, null, null, { suppressResume: true, albumHeaders: true });
          focusFirstRow();
        });
    })
    .catch(function() { navTo('error.html'); });
}
