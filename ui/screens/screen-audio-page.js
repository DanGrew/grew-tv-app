import { getParam, getProfile, getPerson, navTo, getLyrics, setLyrics as saveLyricsPref, initLyrics } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-audio-player.js';
import { setupQueueShell } from './screen-queue-shell.js';
import { MUSIC } from '../../core/queue-shell-config.js';
import { transportState } from '../../core/queue-shell-view.js';
import { connectApp } from '../../core/app-ws.js';
import { loadAlbum, loadPlaylist, loadVideo, loadLyrics, mediaUrl, queuePlaybackAction, loadQueuePlayback } from '../../core/app-api.js';
import * as qRouter from '../../core/queue-playback-router.js';
import { parseLrc, indexAt, windowAt } from '../../core/lrc.js';
import { buildCrumbs, playerCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// FEAT-031 (TASK-187) audio page — SERVER-AUTHORITATIVE playback. The album/artist
// queue + shuffle order + next/prev are owned by the backend; this page is a
// renderer + action sender. On entry it fires a `play-source` (album/artist/
// playlist) or `play-standalone` (lone track) action; thereafter it renders the
// incoming snapshot and the transport (next/prev) fires actions and waits for the
// next snapshot to repaint. No `core/queue.js`, no local order math. The <audio>
// element stays local; reconnect restores the player from the replayed snapshot.
//
// TASK-504 (FEAT-497) — music runs on the TASK-498 UNIFIED queue engine now
// (/api/queue/music), the same rail films and home movies moved to, and its
// Queue is THE shared shell (ui/screens/screen-queue-shell.js) rather than a
// copy of its own. Music was the last type on playback_engine.py's queue, so
// nothing here posts to /api/playback any more. Three consequences worth
// naming, all of them "the same as the other types" rather than music-specific
// behaviour: now_playing keys off `item_id` (not `track_id`), the WS pushes
// arrive on the `queue_playback` channel tagged with a media_type this page
// filters to its own, and there is no `position` action — FEAT-497's model has
// no per-item scrub position, which costs music nothing since TASK-276 already
// removed mid-song resume (a track restarts from 0 either way).
var SERVER = window.location.origin;

var AUDIO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
// Ambient transport auto-hides after this idle window; any d-pad key summons it.
var TRANSPORT_HIDE_MS = 4000;

export function initAudioPage() {
  var albumId    = getParam('album');
  var artistId   = getParam('artist');
  var playlistId = getParam('playlist');
  var trackId    = getParam('track');
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
  // BUG-044 breadcrumb state: the playback source crumb (album/playlist/artist,
  // built once the source title resolves) and the now-playing track title (the
  // leaf, updated as the snapshot advances). Together they build
  // Home › [Source] › Now Playing (the TV player has no browse-rail nav-trail).
  var sourceCrumb = null;
  var nowTitle = '';

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
  // BUG-016: the bar sets `pointer-events:none` when hidden, so it must wake on
  // pointer activity too — not only the d-pad. A move re-enables clicks (and
  // re-arms the idle timer) before the press lands, so a real click reaches it.
  document.addEventListener('pointermove', summonTransport);
  document.addEventListener('pointerdown', summonTransport);

  audioEl.addEventListener('timeupdate', renderLyrics);

  // ── server `playback` snapshot -> UI (the single source of truth) ───────────
  // A new now-playing track loads into <audio>, pulls its lyrics, and honours the
  // per-track trim fields off the /api/video record (TASK-283): startAt seeds the
  // load seek (default 0 — TASK-276 removed mid-song resume, so an untrimmed track
  // still restarts from 0 on return, never np.position); endAt is handed to the
  // player as the early-advance boundary (null = play to the natural end). The
  // record fetch feeds BOTH lyrics and the trim, so playback now starts from inside
  // the `.then`; a fetch failure falls back to an untrimmed play (start 0, natural
  // end) so a missing record never strands the player.
  function beginPlayback(np, track) {
    player.playTrack(
      { id: np.item_id, title: np.title, artist: np.artist, ext: np.ext, poster: np.poster },
      from,
      [track.startAt].filter(Boolean).concat([0])[0],
      [track.endAt].filter(Boolean).concat([null])[0]
    );
  }
  function swapTrack(np) {
    loadedTrackId = np.item_id;
    setArt(np.poster);
    loadVideo(SERVER, np.item_id)
      .then(function(track) { loadTrackLyrics(track); beginPlayback(np, track); })
      .catch(function() { clearLyrics(); beginPlayback(np, {}); });
  }

  var TRACK_CHANGED = {
    'true':  function(np) { swapTrack(np); },
    'false': function() {}
  };
  // BUG-044: once a track is playing, upgrade the player breadcrumb to
  // Home › [Source] › Now Playing — the source becomes a CLICKABLE crumb back to
  // its own page and the now-playing track is the leaf. Re-mount only when the leaf
  // title actually changes so a snapshot doesn't blur a focused crumb needlessly.
  function mountAudioBreadcrumb() {
    mountBreadcrumb('breadcrumb', playerCrumbs(null, sourceCrumb, nowTitle));
  }
  function setNowTitle(t) {
    [t].filter(function(x) { return x !== nowTitle; }).forEach(function(x) { nowTitle = x; mountAudioBreadcrumb(); });
  }
  function renderNowPlaying(np) {
    setNowTitle(np.title);
    TRACK_CHANGED[(np.item_id !== loadedTrackId) + ''](np);
  }

  // TASK-504 — ⏮/⏭ at the player's own control row read the SHELL's transport
  // rule, the same one the Queue hero renders from, so the two sites can't
  // disagree (TASK-517 established this for films; BUG-510/512 were the two
  // disagreeing). Music's own rule until now was setQueueMode, which HID the
  // pair for a lone track — a control with nothing to act on stays visible and
  // dims (docs/QUEUE-UX-SHELL.md's Hero section).
  function setControlOn(id, enabled) {
    var btn = document.getElementById(id);
    btn.classList.remove('hidden');
    btn.classList.toggle('is-disabled', !enabled);
    btn.disabled = !enabled;
  }
  function setTransportOn(snap) {
    var t = transportState(snap);
    setControlOn('btn-prev', t.previous);
    setControlOn('btn-next', t.next);
  }

  function applySnapshot(snap) {
    // Shuffle/repeat live on the Queue hero, not the player's row (TASK-237);
    // the queue, the transport and now-playing are what repaint here.
    setTransportOn(snap);
    queue.applySnapshot(snap);
    [snap.now_playing].filter(Boolean).forEach(renderNowPlaying);
  }
  // A person may hold live queue state in more than one media type at once —
  // the relay tags every push with `media_type` and this page drives only music.
  function applyQueuePlayback(payload) {
    [payload.media_type === MUSIC.mediaType].filter(Boolean).forEach(applySnapshot);
  }

  // BUG-439's fix, which music is the last type to get (films TASK-503, home
  // movies TASK-499, music videos BUG-485 all have it): the entry POST can land
  // before the WS activate_person handshake finishes binding this device
  // server-side, and the resulting snapshot broadcast is then silently dropped
  // — the server applied the action, only the push was lost, and the player
  // sits on an empty screen. Once activate_person is confirmed, pull the
  // snapshot directly and apply it: a no-op when the push did land, the fix
  // when it didn't.
  //
  // BUG-521/522 guard it the same way films are guarded: that GET is a
  // FALLBACK, never an override. Issued before the server applied our own POST,
  // its answer describes the PREVIOUS track, and applying it on top of the
  // right one swaps the player back to whatever played last time. isStaleResync
  // covers both orderings — anything already loaded means a push did land, and
  // an answer naming a track other than the one this page was opened for
  // predates our POST.
  function applyResync(snap) {
    [!qRouter.isStaleResync(trackId, loadedTrackId, snap)].filter(Boolean).forEach(applySnapshot);
  }
  function resyncOnActivate() {
    loadQueuePlayback(SERVER, MUSIC.mediaType, person).then(applyResync).catch(function() {});
  }

  // ── action sender (transport + autoadvance + position) ──────────────────────
  // Returns the POST promise so fireEntry can serialise the track jump after the
  // source POST resolves (see fireEntry). A function EXPRESSION, not a declaration:
  // it is an IO call (no DOM token, returns a value), which the no-pure-fn arch
  // check would otherwise flag as "move to core/" — but it closes over SERVER/
  // person and only fans out a request, so it belongs here.
  var sendAction = function(action, body) {
    return queuePlaybackAction(SERVER, MUSIC.mediaType, action, person, body).catch(function() {});
  };

  function goBackNav() {
    clearTimeout(hideTimer);
    var STOP_NAV = {
      'detail-album':    function() { navTo('album-detail.html', { album: albumId }); },
      'detail-playlist': function() { navTo('playlist-detail.html', { playlist: playlistId }); },
      'artist':          function() { navTo('artist.html', { artist: artistId }); },
      'browse':          function() { navTo('browse.html'); }
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
    onQueue: function() { queue.open(); },
    onLyrics: onLyrics,
    // No reportPosition (TASK-504): FEAT-497's model has no per-item scrub
    // position, and music never read the reported one back — TASK-276 removed
    // mid-song resume, so a track restarts from 0 with or without it. The
    // player's own callback is optional and defaults to a no-op.
    emitState: function(snap) { [wsApp].filter(Boolean).forEach(function(ws) { ws.sendAppState(snap); }); },
    appContext: function() {
      return { screen: 'player', itemId: [albumId].filter(Boolean).concat([artistId, playlistId, loadedTrackId]).filter(Boolean)[0], episodeId: loadedTrackId, profile: profile, sourceType: kind, sourceId: [albumId].filter(Boolean).concat([artistId, playlistId]).filter(Boolean).concat([null])[0] };
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
  //
  // TASK-504 — THE shared shell now (ui/screens/screen-queue-shell.js), told it
  // is music by `config.media`; music's own overlay + view module are gone.
  // The hero's source line is an opaque album/playlist id, so it reads this
  // page's own title lookup — the one the breadcrumb already fetches — the way
  // a film's series/boxset title does. onToggle is the hero's device-local
  // Play/Pause: it toggles the already-mounted <audio>, never a server action.
  queue = setupQueueShell({
    root: document.getElementById('queue-overlay'),
    body: document.getElementById('queue-body'),
    crumb: document.getElementById('queue-crumb'),
    onAction: function(action, body) { sendAction(action, body); },
    onToggle: function() { player.remote.toggle(); },
    onClose: function() { document.getElementById('btn-queue').focus(); },
    getSourceTitle: function() { return sourceTitle(); },
    media: MUSIC
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
  // to a different source. `lyrics`/`toggle`/`next`/`prev`/`skip` fall through to
  // player.remote — `lyrics` (TASK-239) hits player.remote.lyrics -> toggleLyrics,
  // flipping the ambient layer + server pref exactly like the on-screen pill.
  var PLAY_BY_ID = {
    'true':  function(id) { sendAction('play-item', { item_id: id }); },
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
      playArtist: function() { navTo('audio.html', { artist: params.id, from: 'artist' }); },
      playPlaylist: function() { navTo('audio.html', { playlist: params.id, from: 'detail-playlist' }); }
    };
    var fn = [EXTRA[intent]].filter(Boolean).concat([player.remote[intent]]).filter(Boolean)[0];
    [fn].filter(Boolean).forEach(function(f) { f(params); });
  }
  wsApp = connectApp(window.location.origin, appIntent, { onQueuePlayback: applyQueuePlayback, onPersonActive: resyncOnActivate });
  wsApp.sendContext({ context_id: 'audio' });
  wsApp.sendAppState({ screen: 'player', itemId: [albumId].filter(Boolean).concat([artistId, playlistId, trackId]).filter(Boolean)[0], profile: profile });

  document.addEventListener('keydown', dispatchKey);

  // ── entry: establish the source, THEN jump to the tapped track ──────────────
  // album/artist -> play-source (shuffle is server-owned now, per the source's
  // stored pref — TASK-320/321, no URL param); `play_track` leaves the source
  // intact (engine: resumes the source on next advance), so a tapped row starts
  // there and the album/artist queue still follows. A bare track id (no
  // source) is a single — play-track only. The player is queue-mode (⏮/⏭) for a
  // source, single for a lone track.
  //
  // The jump POST MUST land AFTER play-source has persisted: each action is
  // an independent get→modify→upsert on the ThreadingHTTPServer (own thread + DB
  // conn, no lock), so firing both un-awaited races last-writer-wins — play-source
  // (heavier: resolve + build permutations) usually writes last and clobbers the
  // jump back to track 0, "starting at the beginning". `then`-chaining the jump
  // on the resolved source POST serialises the two so the tapped track wins. The
  // `track` (no-source) kind returns undefined ⇒ Promise.resolve fires the jump
  // immediately. This is the same two-action entry home movies use (TASK-499) —
  // the unified engine's play-source takes no item_id of its own.
  // FEAT-040/TASK-255 (music Play Queue): entered with ?playQueue (no album/artist/
  // playlist/track) — fire play-queue (the server pops+plays the override-queue head)
  // and render from the broadcast snapshot like the others, so the TV starts the
  // music queue without opening a track first (the audio twin of the video page's
  // startQueue). No jumpToTrack (no trackId), no source title.
  var SOURCE_BASE = {
    album:    function() { return sendAction('play-source', { source_type: 'album', source_id: albumId }); },
    artist:   function() { return sendAction('play-source', { source_type: 'artist', source_id: artistId }); },
    playlist: function() { return sendAction('play-source', { source_type: 'playlist', source_id: playlistId }); },
    queue:    function() { return sendAction('play-queue', {}); },
    track:    function() {}
  };
  // With a source, the tapped track is a play-item INSIDE it — the source stays
  // intact and keeps feeding Next. A lone track has no source to sit in, so it
  // is a play-standalone, the same action a standalone film fires (TASK-503).
  var JUMP_ACTION = {
    'true':  function(t) { sendAction('play-item', { item_id: t }); },
    'false': function(t) { sendAction('play-standalone', { item_id: t }); }
  };
  function jumpToTrack() {
    [trackId].filter(Boolean).forEach(function(t) { JUMP_ACTION[(kind !== 'track') + ''](t); });
  }
  // …then pull the resulting snapshot once the entry has fully landed. The
  // push that would have carried it is routinely lost here (BUG-439: the POSTs
  // beat the WS handshake, since the socket waits on its own /api/config
  // fetch), and music cannot rely on the person_active resync alone the way
  // films can: films enter with ONE action, while music's entry is two, so a
  // recovery GET can resolve in the window between them, describe the source
  // head rather than the tapped track, and be discarded as stale — correctly,
  // but with nothing left to retry. Chaining it here means the GET always
  // reads the settled state. It stays subject to the same staleness guard, so
  // a push that did land still wins.
  function fireEntry() {
    Promise.resolve(SOURCE_BASE[kind]()).then(jumpToTrack).then(resyncOnActivate);
  }
  function sourceKind() {
    return [['queue'].filter(function() { return !!getParam('playQueue'); })[0], ['album'].filter(function() { return !!albumId; })[0], ['artist'].filter(function() { return !!artistId; })[0], ['playlist'].filter(function() { return !!playlistId; })[0]]
      .filter(Boolean).concat(['track'])[0];
  }
  var kind = sourceKind();
  // The Queue hero's source line names the album/playlist/artist being played —
  // the title this page already fetches for its breadcrumb. A lone track and
  // the Play Queue entry have no source, so they name none (the shell then
  // renders an empty source line, exactly as a standalone film does).
  var HAS_SOURCE = { album: true, artist: true, playlist: true };
  function sourceTitle() {
    return [title].filter(function() { return !!HAS_SOURCE[kind]; }).concat([''])[0];
  }
  // BUG-044: the playback source's own crumb — { label, page, params } linking to
  // its detail page (the SAME target Back uses, see goBackNav). A queue / lone
  // single has no source page (absent from the map) → no source crumb.
  var SOURCE_CRUMB = {
    album:    function() { return { label: title, page: 'album-detail.html', params: { album: albumId } }; },
    artist:   function() { return { label: title, page: 'artist.html', params: { artist: artistId } }; },
    playlist: function() { return { label: title, page: 'playlist-detail.html', params: { playlist: playlistId } }; }
  };
  function buildSourceCrumb() {
    return [SOURCE_CRUMB[kind]].filter(Boolean).map(function(fn) { return fn(); }).concat([null])[0];
  }
  // Breadcrumb title is collection-level: the album title (fetched), the artist
  // name (already the param), or the single track's title.
  var TITLE_FOR = {
    album:    function() { return loadAlbum(SERVER, albumId).then(function(a) { return a.title; }); },
    artist:   function() { return Promise.resolve(artistId); },
    playlist: function() { return loadPlaylist(SERVER, playlistId).then(function(p) { return p.title; }); },
    queue:    function() { return Promise.resolve('Play Queue'); },
    track:    function() { return loadVideo(SERVER, trackId).then(function(v) { return v.title; }); }
  };

  // initLyrics seeds the sticky lyrics preference from the backend before it is
  // read below; like initCaptions it never rejects, so it can't fail the all().
  Promise.all([initLyrics(SERVER), TITLE_FOR[kind]()])
    .then(function(res) {
      title = res[1];
      lyricsEnabled = getLyrics();
      // No setQueueMode (TASK-504): ⏮/⏭ are the shell's transport rule's now,
      // dimmed rather than hidden — setTransportOn owns both buttons.
      player.setLyrics(lyricsEnabled);
      // Initial crumb is Home › <source title> (leaf) — the pre-playback view;
      // once the first now-playing snapshot lands, setNowTitle upgrades it to
      // Home › <source link> › <track> via the built sourceCrumb (BUG-044).
      sourceCrumb = buildSourceCrumb();
      mountBreadcrumb('breadcrumb', buildCrumbs('video', { videoTitle: title }));
      fireEntry();
    })
    .catch(function() { navTo('error.html'); });
}
