import { getParam, getProfile, getPerson, navTo, getLyrics, setLyrics as saveLyricsPref, initLyrics } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-audio-player.js';
import { setupQueue } from './screen-queue.js';
import { connectApp } from '../../core/app-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadAlbum, loadVideo, loadLyrics, mediaUrl, playbackAction } from '../../core/app-api.js';
import { parseLrc, indexAt, windowAt } from '../../core/lrc.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// FEAT-031 (TASK-187) audio page — SERVER-AUTHORITATIVE playback. The album/artist
// queue + shuffle order + next/prev are owned by the backend (TASK-184/185/186);
// this page is a renderer + action sender. On entry it fires a `play-source`
// (album/artist) or `play-track` (single) action; thereafter it renders the
// incoming `playback` WS snapshot (now-playing track + position + shuffle flag)
// and the transport (next/prev/shuffle) fires TASK-186 actions and waits for the
// next snapshot to repaint. No `core/queue.js`, no local order math. The <audio>
// element + debounced position reporting stay local; reconnect restores the
// player from the replayed snapshot.
var SERVER = window.location.origin;

var AUDIO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
// Ambient transport auto-hides after this idle window; any d-pad key summons it.
var TRANSPORT_HIDE_MS = 4000;

export function initAudioPage() {
  var albumId  = getParam('album');
  var artistId = getParam('artist');
  var trackId  = getParam('track');
  var shuffleParam = !!getParam('shuffle');
  var from     = [getParam('from')].filter(Boolean).concat(['browse'])[0];
  var profile  = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var person   = getPerson();
  var wsApp = null;
  var player;
  var queue;
  // Which track id is currently loaded in <audio>; a snapshot for a different
  // track triggers a swap, the same track just updates the flag/position.
  var loadedTrackId = null;
  var title = '';

  // ── ambient lyrics (TASK-131) ──────────────────────────────────────────────
  // Lyrics are a page concern: the player stays playback-only. The current
  // track's parsed cues live here; the <audio> timeupdate drives the rolling
  // window. lastLyricIdx gates DOM writes/bumps to once per line change.
  var audioEl = document.getElementById('audio');
  var lyrics = [];
  var lastLyricIdx = -2;
  // The Lyrics pill lets the viewer hide the ambient layer even when the track
  // has an .lrc. The choice is sticky (server-backed, FEAT-023); seeded from the
  // backend at entry (initLyrics) before this is read. The layer shows only when
  // enabled AND cues are present.
  var lyricsEnabled = true;

  function setLyricMode(has) {
    document.body.classList.toggle('lyrics-on', [has, lyricsEnabled].filter(Boolean).length === 2);
  }

  function onLyrics(on) {
    lyricsEnabled = on;
    saveLyricsPref(on);
    setLyricMode(lyrics.length > 0);
  }

  function bumpCurrent() {
    var el = document.getElementById('amb-cur');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function renderLyrics() {
    var i = indexAt(lyrics, audioEl.currentTime);
    [i].filter(function(x) { return x !== lastLyricIdx; }).forEach(function() {
      lastLyricIdx = i;
      var w = windowAt(lyrics, audioEl.currentTime);
      document.getElementById('amb-prev').textContent = w.prev;
      document.getElementById('amb-cur').textContent = w.cur;
      document.getElementById('amb-next').textContent = w.next;
      bumpCurrent();
    });
  }

  function applyLyrics(text) {
    lyrics = parseLrc(text);
    lastLyricIdx = -2;
    setLyricMode(lyrics.length > 0);
    renderLyrics();
  }

  function clearLyrics() {
    lyrics = [];
    lastLyricIdx = -2;
    setLyricMode(false);
  }

  var LYRIC_SOURCE = {
    'true':  function(rec) { loadLyrics(SERVER, rec.lyrics).then(applyLyrics).catch(clearLyrics); },
    'false': function() { clearLyrics(); }
  };
  function loadTrackLyrics(rec) { LYRIC_SOURCE[(!!rec.lyrics) + ''](rec); }

  // Blurred backdrop + (no-lyrics) big cover both draw the track poster.
  function setArt(poster) {
    [mediaUrl(SERVER, poster)].filter(Boolean).forEach(function(u) {
      document.getElementById('amb-bg').style.backgroundImage = 'url("' + u + '")';
      document.getElementById('audio-art').style.backgroundImage = 'url("' + u + '")';
      document.getElementById('audio-art').textContent = '';
    });
  }

  // ── transport auto-hide ────────────────────────────────────────────────────
  var hideTimer = null;
  function hideTransport() { document.getElementById('controls').classList.add('controls-hidden'); }
  function armHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hideTransport, TRANSPORT_HIDE_MS); }
  function summonTransport() {
    document.getElementById('controls').classList.remove('controls-hidden');
    armHide();
  }

  audioEl.addEventListener('timeupdate', renderLyrics);

  // ── server `playback` snapshot -> UI (the single source of truth) ───────────
  // A new now-playing track loads into <audio> at the server's position + pulls
  // its lyrics; the same track just keeps playing (position lives client-side).
  function swapTrack(np) {
    loadedTrackId = np.track_id;
    setArt(np.poster);
    loadVideo(SERVER, np.track_id).then(loadTrackLyrics).catch(clearLyrics);
    player.playTrack({ id: np.track_id, title: np.title, artist: np.artist, ext: np.ext, poster: np.poster }, from, np.position);
  }

  var TRACK_CHANGED = {
    'true':  function(np) { swapTrack(np); },
    'false': function() {}
  };
  function renderNowPlaying(np) {
    TRACK_CHANGED[(np.track_id !== loadedTrackId) + ''](np);
  }

  function applySnapshot(snap) {
    player.setShuffle(snap.shuffle);
    player.setRepeat(snap.repeat);
    queue.applySnapshot(snap);
    [snap.now_playing].filter(Boolean).forEach(renderNowPlaying);
  }

  // ── action sender (transport + autoadvance + position) ──────────────────────
  function sendAction(action, body) {
    playbackAction(SERVER, action, person, body).catch(function() {});
  }

  function goBackNav() {
    clearTimeout(hideTimer);
    var STOP_NAV = {
      'detail-album': function() { navTo('album-detail.html', { album: albumId }); },
      'artist':       function() { navTo('artist.html', { artist: artistId }); },
      'browse':       function() { navTo('browse.html'); }
    };
    [STOP_NAV[from]].filter(Boolean).concat([function() { navTo('browse.html'); }])[0]();
  }

  player = setupPlayer({
    audio: document.getElementById('audio'),
    server: SERVER,
    onStop: goBackNav,
    onEnded: function() { sendAction('next', {}); },
    onNext: function() { sendAction('next', {}); },
    onPrev: function() { sendAction('previous', {}); },
    onShuffle: function() { sendAction('toggle-shuffle', {}); },
    onRepeat: function() { sendAction('toggle-repeat', {}); },
    onQueue: function() { queue.open(); },
    onLyrics: onLyrics,
    reportPosition: function(sec) { sendAction('position', { current_position: sec }); },
    emitState: function(snap) { [wsApp].filter(Boolean).forEach(function(ws) { ws.sendAppState(snap); }); },
    appContext: function() {
      return { screen: 'player', itemId: [albumId].filter(Boolean).concat([artistId, loadedTrackId]).filter(Boolean)[0], episodeId: loadedTrackId, profile: profile };
    },
    onIntent: function(intent) {
      var AUDIO_CTX = { play: true, audio: true };
      [wsApp].filter(Boolean).forEach(function(ws) {
        [AUDIO_CTX[intent]].filter(Boolean).forEach(function() {
          ws.sendContext({ context_id: 'audio', display: player.currentTrackDisplay() });
        });
      });
    }
  });

  // FEAT-031 (TASK-188): the Queue View overlay hangs off the player. While open
  // it owns the d-pad (its own grid nav + Back to close); closed, keys drive the
  // transport as before.
  queue = setupQueue({
    root: document.getElementById('queue-overlay'),
    body: document.getElementById('queue-body'),
    crumb: document.getElementById('queue-crumb'),
    onAction: function(action, body) { sendAction(action, body); },
    onClose: function() { document.getElementById('btn-queue').focus(); }
  });

  var KEY_TARGET = {
    'true':  function(e) { queue.handleKey(e); },
    'false': function(e) { summonTransport(); player.handleAudioKey(e); }
  };
  function onAudioKey(e) { KEY_TARGET[queue.isOpen() + ''](e); }
  var keys = {};
  AUDIO_KEYS.forEach(function(k) { keys[k] = onAudioKey; });
  initPage({ onEnter: function() { document.getElementById('btn-play-pause').focus(); armHide(); }, keys: keys, remote: player.remote });

  // Companion `play` carries a track id -> teleport via the server play-track
  // action (no id -> resume local <audio>). `playAlbum`/`playArtist` jump the TV
  // to a different source. `shuffle`/`toggle`/`next`/`prev`/`skip` fall through to
  // player.remote (which now fire server actions).
  var PLAY_BY_ID = {
    'true':  function(id) { sendAction('play-track', { track_id: id }); },
    'false': function() { player.remote.play(); }
  };
  function playIntent(p) {
    var id = [p].filter(Boolean).map(function(x) { return x.id; }).filter(Boolean).concat([null])[0];
    PLAY_BY_ID[(id !== null) + ''](id);
  }
  function appIntent(intent, params) {
    var EXTRA = {
      navigate: function() { navTo(params.page, params.params); },
      play: function() { playIntent(params); },
      playAlbum: function() { navTo('audio.html', { album: params.id, from: 'browse' }); },
      playArtist: function() { navTo('audio.html', { artist: params.id, from: 'browse' }); }
    };
    var fn = [EXTRA[intent]].filter(Boolean).concat([player.remote[intent]]).filter(Boolean)[0];
    [fn].filter(Boolean).forEach(function(f) { f(params); });
  }
  wsApp = connectApp(wsUrl(window.location.hostname), appIntent, { onPlayback: applySnapshot });
  wsApp.sendContext({ context_id: 'audio' });
  wsApp.sendAppState({ screen: 'player', itemId: [albumId].filter(Boolean).concat([artistId, trackId]).filter(Boolean)[0], profile: profile });

  document.addEventListener('keydown', dispatchKey);

  // ── entry: establish the source, then jump to the tapped track ──────────────
  // album/artist -> play-source (shuffle flag from the param); `play_track` leaves
  // the source intact (engine: resumes the source on next advance), so a tapped
  // row starts there and the album/artist queue still follows. A bare track id (no
  // source) is a single — play-track only. The player is queue-mode (⏮/⏭) for a
  // source, single for a lone track.
  var SOURCE_BASE = {
    album:  function() { sendAction('play-source', { source_type: 'album', source_id: albumId, shuffle: shuffleParam }); },
    artist: function() { sendAction('play-source', { source_type: 'artist', source_id: artistId, shuffle: shuffleParam }); },
    track:  function() {}
  };
  function fireEntry() {
    SOURCE_BASE[kind]();
    [trackId].filter(Boolean).forEach(function(t) { sendAction('play-track', { track_id: t }); });
  }
  function sourceKind() {
    return [['album'].filter(function() { return !!albumId; })[0], ['artist'].filter(function() { return !!artistId; })[0]]
      .filter(Boolean).concat(['track'])[0];
  }
  var kind = sourceKind();
  var QUEUE_MODE = { album: true, artist: true, track: false };
  // Breadcrumb title is collection-level: the album title (fetched), the artist
  // name (already the param), or the single track's title.
  var TITLE_FOR = {
    album:  function() { return loadAlbum(SERVER, albumId).then(function(a) { return a.title; }); },
    artist: function() { return Promise.resolve(artistId); },
    track:  function() { return loadVideo(SERVER, trackId).then(function(v) { return v.title; }); }
  };

  // initLyrics seeds the sticky lyrics preference from the backend before it is
  // read below; like initCaptions it never rejects, so it can't fail the all().
  Promise.all([initLyrics(SERVER), TITLE_FOR[kind]()])
    .then(function(res) {
      title = res[1];
      lyricsEnabled = getLyrics();
      player.setQueueMode(QUEUE_MODE[kind]);
      player.setShuffle(shuffleParam);
      player.setLyrics(lyricsEnabled);
      mountBreadcrumb('breadcrumb', buildCrumbs('video', { videoTitle: title }));
      fireEntry();
    })
    .catch(function() { navTo('error.html'); });
}
