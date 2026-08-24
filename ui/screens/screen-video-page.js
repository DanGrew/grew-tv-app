import { getParam, getProfile, getPerson, navTo, initCaptions } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-video-player.js';
import { setupVideoQueue } from './screen-video-queue.js';
import { setupMusicVideoQueue } from './screen-music-video-queue.js';
import { setupQueueShell } from './screen-queue-shell.js';
import { HOME_MOVIE, FILM } from '../../core/queue-shell-config.js';
import { transportState } from '../../core/queue-shell-view.js';
import { connectApp } from '../../core/app-ws.js';
import { loadSeries, loadProgress, loadPlaylist, loadBrowse, loadVideoPlayback, loadMusicVideoPlayback, loadQueuePlayback, videoPlaybackAction, musicVideoPlaybackAction, queuePlaybackAction, addToPlaylist } from '../../core/app-api.js';
import { isMidWatch } from '../../core/progress.js';
import { isSwap, upNextItem, upNextLine, seriesMode } from '../../core/video-player-router.js';
import { entryMode } from '../../core/music-video-playthrough.js';
import * as mvRouter from '../../core/music-video-playback-router.js';
// TASK-503: qRouter is the shared view-router for the TASK-498 unified queue
// engine's `queue_playback` snapshot — used by BOTH home movies (TASK-499,
// media_type 'home-movie') and films (TASK-503, media_type 'film'), so it is
// no longer hm-specific despite the module's own file name.
import * as qRouter from '../../core/queue-playback-router.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { gridIndex } from '../../core/playlist-name.js';
import { buildCrumbs, playerCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// FEAT-037 (TASK-222) — the PERSISTENT video player document. Replaces the old
// per-episode video.html reload: the <video> element lives for the whole play
// session and media swaps in place.
//
// FOUR server-authoritative rails share this page, picked once per load off
// `engineMode` (mutually exclusive, never a live switch) and never crossed —
// a rail's own actions, snapshot and Queue View stay entirely its own:
//   'film'  — TASK-503/517: a SERIES/BOXSET/STANDALONE FILM, and (TASK-517)
//             the browse "Play Queue" entry too, on the TASK-498 unified
//             queue engine (/api/queue/film) — the fm* functions below fire
//             play-source/play-standalone/play-queue/next/previous and render
//             the `queue_playback` snapshot the backend pushes
//             (core/queue-playback-router.js, aliased qRouter, turns it into
//             the view-model). A standalone film has no source at all
//             (play-standalone clears it); a series/boxset always does.
//   'video' — the OLD video engine (/api/video-playback, TASK-221/251).
//             TASK-517 moved its LAST mode (the browse "Play Queue" entry)
//             onto the unified engine, so no `mode` resolves here any more:
//             this rail — applySnapshot/swapVideo/advanceAuto,
//             core/video-player-router.js, ui/screens/screen-video-queue.js —
//             is unread, kept only until the old engines are retired
//             wholesale (that waits on music + music videos, TASK-504/505).
//   'hm'    — TASK-499: home movies, on the SAME TASK-498 unified queue
//             engine as 'film' but its own media_type (/api/queue/home-movie).
//   'mv'    — a MUSIC VIDEO (single pick, a music-video playlist, an
//             artist's music videos, or the whole-catalog Play All —
//             TASK-374/445): SERVER-AUTHORITATIVE too, on its OWN engine +
//             channel (FEAT-418, TASK-419/420) — the owner explicitly ruled
//             out routing it through the film/video engine or the music
//             engine, so it got a dedicated one. BUG-485 retired the earlier
//             client-owned `seq` playthrough (core/music-video-playthrough.js,
//             TASK-374/407) that used to drive this directly: every mv*
//             function below instead fires a `/api/music-video-playback`
//             action and renders from the `music_video_playback` snapshot
//             the backend pushes (core/music-video-playback-router.js turns
//             it into the view-model).
//
// Every rail resumes from watch_progress (the single source of truth for
// per-item position; the player saves there as it plays) except a music
// video, which always starts at 0 (never resumes, by design). Whichever
// rail drives the page, the Queue View's own row controls, the TV's
// on-screen transport, and the companion's Plane-B POSTs all fire that
// rail's actions and render that rail's own snapshot, so none of them can
// ever disagree about what is actually playing.
var SERVER = window.location.origin;

var RESUME_BY_RESTART = {
  'true':  function() { return 0; },
  'false': function(prog) { return [prog.position_secs].filter(function(p) { return isMidWatch(p, prog.duration_secs); }).concat([0])[0]; }
};
function resumeStart(restart, prog) { return RESUME_BY_RESTART[!!restart + ''](prog); }
function zeroProgress() { return { position_secs: 0, duration_secs: null }; }
var VIDEO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
// BUG-439: an engine-fired action (play-video/-source/-queue) waits this long for
// its first video_playback snapshot before giving up and surfacing error.html,
// instead of leaving the player sitting inert with no feedback.
var ENGINE_TIMEOUT_MS = 8000;

export function initVideoPage() {
  var videoId  = getParam('video');
  var seriesId = getParam('series');
  var restart  = getParam('restart');
  var mvItem     = getParam('musicVideo');
  var mvPlaylist = getParam('musicVideoPlaylist');
  var mvArtist   = getParam('musicVideoArtist');
  var mvTrack    = getParam('musicVideoTrack');
  var mvAll      = getParam('musicVideoAll');
  var homeMoviesAll = getParam('homeMoviesAll');
  var homeMoviesPerson = getParam('homeMoviesPerson');
  var homeMoviesMonth = getParam('homeMoviesMonth');
  var from     = [getParam('from')].filter(Boolean).concat(['browse'])[0];
  var profile  = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var person   = getPerson();
  var isSeries = !!seriesId;
  var mode = entryMode({ playQueue: !!getParam('playQueue'), mvPlaylist: mvPlaylist, mvArtist: mvArtist, mvItem: mvItem, mvAll: mvAll, homeMoviesAll: homeMoviesAll, homeMoviesPerson: homeMoviesPerson, homeMoviesMonth: homeMoviesMonth, isSeries: isSeries });
  var MV_MODE = { mvItem: true, mvPlaylist: true, mvArtist: true, mvAll: true };
  var isMusicVideo = !!MV_MODE[mode];
  // TASK-499 (FEAT-497) — home movies are the first media type cut over onto
  // the TASK-498 unified queue engine (/api/queue/home-movie), a THIRD
  // server-authoritative rail alongside the video engine (series/film) and
  // the music-video engine above — never the video engine's own
  // home-movies-all/-by-person/-month sources, which stop being called from
  // here (TASK-503/504/505 do the same for the other three media types, one
  // at a time; nothing here changes their still-live engines).
  var HM_MODE = { homeMoviesAll: true, homeMoviesPerson: true, homeMoviesMonth: true };
  var isHomeMovie = !!HM_MODE[mode];
  // TASK-503 (FEAT-497) — series/single (a standalone film, boxset or TV
  // series) are the SECOND media type cut over onto the TASK-498 unified
  // queue engine (/api/queue/film) — the video engine's own play-video/
  // play-source stop being called for them.
  //
  // TASK-517 — `queue` mode (the browse "Play Queue" tile, `?playQueue`) is
  // the LAST film route to move: TASK-503 left it on the old video engine
  // because the unified engine had no "pop the queue and start playing"
  // action, so a film reached that way still showed the pre-FEAT-497 Queue.
  // The engine has one now (queue_engine.play_queue — the co-deployed
  // grew-tv half of this task), so `queue` resolves to engineMode 'film' like
  // every other film route, and the Queue it opens is the same shell.
  //
  // Which rail this page load drives — resolved once off `mode` (mutually
  // exclusive per page load, never a live switch) and used to key every
  // ENGINE/onEnded/onNext/…/queue-setup dispatch table below, so none of them
  // need their own musicVideo/homeMovie/… branch.
  var MODE_ENGINE = {
    mvPlaylist: 'mv', mvArtist: 'mv', mvItem: 'mv', mvAll: 'mv',
    homeMoviesAll: 'hm', homeMoviesPerson: 'hm', homeMoviesMonth: 'hm',
    series: 'film', single: 'film', queue: 'film'
  };
  var engineMode = MODE_ENGINE[mode];
  var wsApp = null;
  var player;
  var queue;
  var snapshot = null;     // latest video_playback snapshot ('video'/legacy queue mode only)
  var loadedId = null;     // which item id is currently loaded in <video>
  var currentTitle = '';   // current item's title (for the breadcrumb leaf)
  var seriesTitle = null;  // cached series/boxset title — the top crumb AND (TASK-503) the film Queue View hero subtitle
  var loadedSourceId = null;  // which source id seriesTitle was fetched for (TASK-517)
  var mvSnapshot = {};     // latest music_video_playback snapshot (music-video mode only)
  var hmSnapshot = {};     // latest queue_playback snapshot (home-movie mode only, TASK-499)
  var fmSnapshot = {};     // latest queue_playback snapshot (film mode only, TASK-503)
  var fmPendingId = null;  // BUG-518: the item this page was opened for, until a snapshot confirms it
  var enginePending = null;  // ENGINE_TIMEOUT_MS watchdog, armed per engine action, cleared on first swap
  // TASK-422: the music-video playback source's own crumb — { label, page, params }
  // linking to its playlist/artist page, mirroring BUG-044's audio sourceCrumb.
  // Built once per entry (startMvPlaylist/startMvArtist, before mvBegin), never
  // per-swap; stays null for a standalone mvItem pick (no source page, story 4).
  var mvSourceCrumb = null;

  function sendAction(action, body) { videoPlaybackAction(SERVER, action, person, body).catch(function() {}); }
  // FEAT-418 (TASK-419/420, BUG-485): the music-video engine's own action
  // sender — POSTs to the separate /api/music-video-playback engine, never the
  // video engine above. Returns the POST promise so mvBegin's entry chain can
  // fire play-video after play-source resolves. A function EXPRESSION, not a
  // declaration — same reason screen-audio-page's own sendAction is one: it is
  // an IO call (no DOM token, returns a value), which the no-pure-fn-outside-
  // core arch check would otherwise flag as "move to core/", but it closes
  // over SERVER/person and only fans out a request, so it belongs here.
  var sendMvAction = function(action, body) { return musicVideoPlaybackAction(SERVER, action, person, body).catch(function() {}); };
  // source_type/source_id for the CURRENT mv playthrough, keyed off the same
  // `mode` entryMode() already resolved (mvItem/mvPlaylist/mvArtist/mvAll are
  // mutually exclusive per page load) — mirrors the catalog's own
  // "mv-item"/"mv-artist"/"mv-playlist"/"mv-all" registered names
  // (media-manager/db/music_video_playback_engine.py).
  var MV_SOURCE_TYPE = { mvItem: 'mv-item', mvPlaylist: 'mv-playlist', mvArtist: 'mv-artist', mvAll: 'mv-all' };
  var MV_SOURCE_ID = { mvItem: function() { return mvItem; }, mvPlaylist: function() { return mvPlaylist; }, mvArtist: function() { return mvArtist; }, mvAll: function() { return null; } };
  // The two-action entry pattern (play-source then play-video), mirroring the
  // shipped music page's own fireEntry/jumpToTrack — sendMvVideo fires only
  // from mvBegin's own start id (a tapped mvItem/mvTrack); a plain next/
  // previous fires its own action directly (ON_NEXT/ON_PREV below), the
  // engine walks its own order. No shuffle/repeat on play-source — both
  // already default true server-side when omitted (TASK-420/421).
  function sendMvSource() { return sendMvAction('play-source', { source_type: MV_SOURCE_TYPE[mode], source_id: MV_SOURCE_ID[mode]() }); }
  function sendMvVideo(id) { sendMvAction('play-video', { video_id: id }); }

  // TASK-499 (FEAT-497) — the unified queue engine's own action sender, the
  // hm twin of sendMvAction: POSTs to /api/queue/home-movie, never the video
  // engine above. source_type/source_id mirror MV_SOURCE_TYPE/MV_SOURCE_ID's
  // shape, keyed off the same `mode` (homeMoviesAll/-Person/-Month are
  // mutually exclusive per page load) against the engine's own registered
  // names (media-manager/db/queue_engine.py).
  var sendHmAction = function(action, body) { return queuePlaybackAction(SERVER, 'home-movie', action, person, body).catch(function() {}); };
  var HM_SOURCE_TYPE = { homeMoviesAll: 'home-movies-all', homeMoviesPerson: 'home-movies-by-person', homeMoviesMonth: 'home-movie-month' };
  var HM_SOURCE_ID = { homeMoviesAll: function() { return null; }, homeMoviesPerson: function() { return homeMoviesPerson; }, homeMoviesMonth: function() { return homeMoviesMonth; } };
  function sendHmSource() { return sendHmAction('play-source', { source_type: HM_SOURCE_TYPE[mode], source_id: HM_SOURCE_ID[mode]() }); }

  // TASK-503 (FEAT-497) — the unified queue engine's own action sender for
  // FILM mode (series/single), the fm twin of sendHmAction: POSTs to
  // /api/queue/film, never the video engine above (that stays 'video'/legacy
  // queue-mode's own sendAction). A boxset resolves through the SAME
  // registered source_type as a TV series ('series' — queue_engine.py's own
  // series_items/boxset_items are identical catalog queries, mirroring the
  // OLD video_playback_engine's own unconditional 'series' tag for either) —
  // there is no separate 'boxset' source_id to send, only the collection id
  // already carried as `seriesId` for either kind.
  var sendFmAction = function(action, body) { return queuePlaybackAction(SERVER, 'film', action, person, body).catch(function() {}); };

  // Breadcrumb (FEAT-021): a film is Home > Title; a series episode is Home >
  // Series > Episode. The series title is fetched once (graceful 'Series'
  // fallback); the leaf carries the current item title and is rebuilt on each swap.
  // TASK-422: a music video instead names its playback source (playlist/artist),
  // mirroring BUG-044's audio playerCrumbs — no browse-rail entry (the TV player
  // has none, same as audio); mvSourceCrumb null degrades to Home > leaf (story 4).
  var CRUMBS_FOR = {
    'true':  function() { return playerCrumbs(null, mvSourceCrumb, currentTitle); },
    'false': function() {
      return buildCrumbs('video', {
        seriesId: seriesId,
        seriesTitle: [seriesTitle].filter(Boolean).concat(['Series'])[0],
        videoTitle: currentTitle
      });
    }
  };
  function mountCrumbs() {
    mountBreadcrumb('breadcrumb', CRUMBS_FOR[isMusicVideo + '']());
  }
  // TASK-503 — seriesTitle also feeds the Queue shell hero's source line; a
  // re-render past the overlay's first paint picks up a title that resolves
  // after that paint (screen-queue-shell.js's own getSourceTitle() reads this
  // same var live, but only on ITS next render — this nudges one the moment
  // the fetch lands).
  function refreshFilmQueueTitle() {
    [engineMode === 'film'].filter(Boolean).forEach(function() { queue.refreshSourceTitle(); });
  }
  function applySourceTitle(id) {
    loadSeries(SERVER, id)
      .then(function(s) { seriesTitle = s.title; mountCrumbs(); refreshFilmQueueTitle(); })
      .catch(function() {});
  }
  // TASK-517 — keyed on the SOURCE the engine says is loaded, not on this
  // page's own `series` param, so the "Play Queue" entry (which has no param
  // at all, but can land on a person whose film source is still loaded) names
  // its source in the hero like every other route. Fetched once per distinct
  // id — series mode primes it eagerly at entry, and the snapshot's own
  // source_id confirms or replaces it. A source-less standalone film clears
  // it rather than fetching, mirroring the companion page's own resolution.
  function ensureSourceTitle(id) {
    [id !== loadedSourceId].filter(Boolean).forEach(function() {
      loadedSourceId = id;
      seriesTitle = null;
      [id].filter(Boolean).forEach(applySourceTitle);
    });
  }

  // ── OLD server `video_playback` snapshot -> UI ('video'/legacy queue mode
  // ONLY, TASK-503 — series/single moved onto the fm* block below) ──────────
  // The inline up-next line is set AFTER playVideo (which clears it) so the async
  // swap can't wipe a freshly-set line.
  function renderUpNextLine() {
    [upNextLine(snapshot)].filter(Boolean).forEach(function(l) { player.setUpNext(l.prefix, l.label); });
  }

  // BUG-439: the watchdog for a fired engine action — armed right before the
  // sendAction that can silently no-op server-side, cleared the moment a real
  // snapshot swap proves the action landed. Timing out means the action was
  // dropped (or the WS never bound), so surface the existing "can't reach"
  // page rather than leaving a black screen with no feedback (Story 2).
  function armEngineTimeout() {
    clearTimeout(enginePending);
    enginePending = setTimeout(function() { navTo('error.html'); }, ENGINE_TIMEOUT_MS);
  }
  function clearEngineTimeout() {
    clearTimeout(enginePending);
    enginePending = null;
  }

  // BUG-439: the play-video/-source/-queue POST can land before the WS
  // activate_person handshake finishes binding this device server-side, so its
  // snapshot broadcast is silently dropped (the server already applied the
  // action — only the push was lost). Once activate_person is confirmed, pull
  // the current snapshot directly (the same GET FEAT-040's Play Queue already
  // reads) and apply it — a no-op if the push already landed (isSwap sees the
  // same item_id), the fix if it didn't. BUG-485: music-video mode now rides
  // its own engine the same way, so it gets the same resync off its own GET.
  var RESYNC_ON_ACTIVATE = {
    mv:    function() { loadMusicVideoPlayback(SERVER, person).then(applyMvSnapshot).catch(function() {}); },
    hm:    function() { loadQueuePlayback(SERVER, 'home-movie', person).then(applyHmSnapshot).catch(function() {}); },
    film:  function() { loadQueuePlayback(SERVER, 'film', person).then(applyFmResync).catch(function() {}); },
    video: function() { loadVideoPlayback(SERVER, person).then(applySnapshot).catch(function() {}); }
  };
  function resyncOnActivate() { RESYNC_ON_ACTIVATE[engineMode](); }

  function swapVideo(np) {
    clearEngineTimeout();
    loadedId = np.item_id;
    currentTitle = np.title;
    var restartThis = [restart].filter(Boolean).filter(function() { return np.item_id === videoId; })[0];
    loadProgress(SERVER, np.item_id, person)
      .catch(zeroProgress)
      .then(function(prog) {
        // BUG-489: itemType rides the engine snapshot (video_playback.py's
        // _resolve_video) so the player can gate CC off for a home movie
        // without a second fetch.
        player.playVideo({ id: np.item_id, title: np.title, subtitles: np.subtitles, itemType: np.itemType }, from, resumeStart(restartThis, prog));
        renderUpNextLine();
        mountCrumbs();
      });
  }

  // A changed now-playing swaps media in place; an unchanged one (a flag-only
  // snapshot) just refreshes the up-next line (repeat can flip what's "next").
  var SWAP = {
    'true':  function(np) { swapVideo(np); },
    'false': function()   { renderUpNextLine(); }
  };
  function renderNowPlaying(np) { SWAP[isSwap(loadedId, snapshot) + ''](np); }

  function applySnapshot(snap) {
    [engineMode === 'video'].filter(Boolean).forEach(function() {
      snapshot = snap;
      player.setSeriesMode(seriesMode(snap));
      queue.applySnapshot(snap);
      [snap.now_playing].filter(Boolean).forEach(renderNowPlaying);
    });
  }

  // Auto-advance at true 100% end ('video'/legacy queue mode ONLY — TASK-499
  // moved home movies off this path onto hmEnded below (direct advance, no
  // countdown, like mvEnded); TASK-503 moved series/single onto fmAdvanceAuto
  // below instead, which keeps this SAME countdown shape over the new
  // engine's snapshot): the next item -> a 5s "Up next" countdown then fire
  // `next`; no next -> stop back to origin. `next` is the override-queue
  // front when one is queued, else the source walk (wraps under repeat),
  // else nothing.
  function advanceAuto() {
    var next = upNextItem(snapshot);
    ({
      'true':  function() { player.startUpNext(next.title, function() { sendAction('next', {}); }); },
      'false': function() { player.stop(); }
    })[!!next + '']();
  }

  // ── music-video playthrough (BUG-485): server-authoritative, mirroring the
  // series/film block above but over the `music_video_playback` snapshot
  // (core/music-video-playback-router.js). Always starts at 0 — no
  // loadProgress, no resume (the video player "assumes resume"; this
  // deliberately never asks it to). No "Up next" countdown either — a music
  // video advances directly, like a song (screen-audio-page's onEnded), not
  // like a film's 5s overlay.
  function renderMvUpNextLine() {
    [mvRouter.upNextLine(mvSnapshot)].filter(Boolean).forEach(function(l) { player.setUpNext(l.prefix, l.label); });
  }
  function mvSwap(np) {
    clearEngineTimeout();
    loadedId = np.video_id;
    currentTitle = np.title;
    player.playVideo({ id: np.video_id, title: np.title, subtitles: np.subtitles, ext: np.ext }, from, 0);
    renderMvUpNextLine();
    mountCrumbs();
  }
  function mvEnded() {
    ({ 'true': function() { sendMvAction('next', {}); }, 'false': function() { player.stop(); } })[!!mvRouter.upNextItem(mvSnapshot) + '']();
  }
  // Add to playlist (below) always targets the CURRENTLY PLAYING video, read
  // off the live snapshot rather than a locally-tracked id.
  function mvNowPlayingId() { return [mvRouter.nowPlaying(mvSnapshot)].filter(Boolean).concat([{}])[0].video_id; }
  // One entry point every mv* start function below chains through: fire
  // play-source, then (only when a specific item was tapped — a lone pick, or
  // a playlist track) play-video to explicitly become current, mirroring the
  // shipped music page's own two-action fireEntry pattern. An artist rail or
  // Play All has no tapped item — play-source's own first entry is what plays,
  // same as startSeries needs no follow-up action either.
  function mvBegin(startId) {
    document.getElementById('btn-add-playlist').classList.remove('hidden');
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { return sendMvSource(); })
      .then(function() { [startId].filter(Boolean).forEach(sendMvVideo); })
      .catch(function() {});
  }

  // TASK-407 — Shuffle + Repeat, TV side. The pill's on/off state mirrors the
  // snapshot's own shuffle/repeat straight onto the buttons; the companion
  // mirror reads the same two flags off the context push below (mirror
  // invariant). BUG-485: both pills now POST straight to the engine — the
  // resulting snapshot (queue.applySnapshot + mvSetTransportOn below) is what
  // actually updates the on/off state, same as every other Queue View action.
  function mvSetTransportOn(snap) {
    document.getElementById('btn-mv-shuffle').classList.toggle('on', !!snap.shuffle);
    document.getElementById('btn-mv-repeat').classList.toggle('on', !!snap.repeat);
  }
  function mvApplyMulti(multi) {
    player.setSeriesMode(multi);
    document.getElementById('btn-mv-shuffle').classList.toggle('hidden', !multi);
    document.getElementById('btn-mv-repeat').classList.toggle('hidden', !multi);
  }
  function mvToggleShuffle() { sendMvAction('toggle-shuffle', {}); }
  function mvToggleRepeat() { sendMvAction('toggle-repeat', {}); }

  // BUG-485: the Queue View overlay AND the actual <video> element now render
  // off the SAME snapshot — repaint the overlay, then swap media only when the
  // now-playing item actually changed (isSwap), mirroring applySnapshot above.
  var MV_SWAP = { 'true': function(np) { mvSwap(np); }, 'false': function() { renderMvUpNextLine(); } };
  function renderMvNowPlaying(np) { MV_SWAP[mvRouter.isSwap(loadedId, mvSnapshot) + ''](np); }
  function applyMvSnapshot(snap) {
    [engineMode === 'mv'].filter(Boolean).forEach(function() {
      mvSnapshot = snap;
      mvApplyMulti(mvRouter.isMulti(snap));
      mvSetTransportOn(snap);
      queue.applySnapshot(snap);
      [snap.now_playing].filter(Boolean).forEach(renderMvNowPlaying);
      sendVideoContext();
    });
  }

  // ── home-movie queue (TASK-499, FEAT-497): server-authoritative over the
  // TASK-498 unified queue engine's own `queue_playback` snapshot
  // (core/queue-playback-router.js), the hm twin of the mv block above. A
  // home movie DOES resume mid-watch like a series/film (hmSwapVideo mirrors
  // swapVideo's own loadProgress/resumeStart, not mvSwap's always-0 start —
  // a short clip you stopped partway through still resumes where you left
  // off). No "Up next" countdown on end either (TASK-487, preserved
  // unchanged from the old engine): hmEnded advances directly, like mvEnded.
  function renderHmUpNextLine() {
    [qRouter.upNextLine(hmSnapshot)].filter(Boolean).forEach(function(l) { player.setUpNext(l.prefix, l.label); });
  }
  function hmSwapVideo(np) {
    clearEngineTimeout();
    loadedId = np.item_id;
    currentTitle = np.title;
    var restartThis = [restart].filter(Boolean).filter(function() { return np.item_id === videoId; })[0];
    loadProgress(SERVER, np.item_id, person)
      .catch(zeroProgress)
      .then(function(prog) {
        player.playVideo({ id: np.item_id, title: np.title, subtitles: np.subtitles, itemType: np.itemType }, from, resumeStart(restartThis, prog));
        renderHmUpNextLine();
        mountCrumbs();
      });
  }
  function hmEnded() {
    ({ 'true': function() { sendHmAction('next', {}); }, 'false': function() { player.stop(); } })[!!qRouter.upNextItem(hmSnapshot) + '']();
  }
  function hmToggleShuffle() { sendHmAction('toggle-shuffle', {}); }
  function hmToggleRepeat() { sendHmAction('toggle-repeat', {}); }
  // Shuffle/Repeat are ALWAYS shown for a home movie (QUEUE-UX-SHELL.md's
  // Hero section) — un-hidden unconditionally on the first (and every)
  // snapshot rather than gated on a multi-item check the way mvApplyMulti
  // toggles the mv pills (removing an absent class is a no-op, so repeating
  // it every snapshot is harmless); the ⏮/⏭ transport row stays visible too
  // (setSeriesMode(true) below), matching that same always-shown philosophy
  // rather than gating on a source item-count this engine's snapshot has no
  // field for.
  function hmSetTransportOn(snap) {
    document.getElementById('btn-hm-shuffle').classList.remove('hidden');
    document.getElementById('btn-hm-repeat').classList.remove('hidden');
    document.getElementById('btn-hm-shuffle').classList.toggle('on', !!snap.shuffle);
    document.getElementById('btn-hm-repeat').classList.toggle('on', !!snap.repeat);
  }
  var HM_SWAP = { 'true': function(np) { hmSwapVideo(np); }, 'false': function() { renderHmUpNextLine(); } };
  function renderHmNowPlaying(np) { HM_SWAP[qRouter.isSwap(loadedId, hmSnapshot) + ''](np); }
  function applyHmSnapshot(snap) {
    [engineMode === 'hm'].filter(Boolean).forEach(function() {
      hmSnapshot = snap;
      player.setSeriesMode(true);
      hmSetTransportOn(snap);
      queue.applySnapshot(snap);
      [snap.now_playing].filter(Boolean).forEach(renderHmNowPlaying);
      sendVideoContext();
    });
  }

  // ── film queue (TASK-503, FEAT-497): server-authoritative over the
  // TASK-498 unified queue engine's own `queue_playback` snapshot
  // (core/queue-playback-router.js, aliased qRouter above), the fm twin of
  // the hm block above — series/single (a standalone film, boxset or TV
  // series episode), never `queue` mode (that stays on the OLD video engine
  // below, `video` engineMode). A film DOES resume mid-watch (fmSwapVideo
  // mirrors swapVideo's own loadProgress/resumeStart) and DOES keep the 5s
  // "Up next" countdown on end (fmAdvanceAuto mirrors the old advanceAuto,
  // unlike hmEnded's direct advance) — both unchanged FILM behaviours
  // (docs/QUEUE.md rows 29/33), only the engine driving them moves.
  function renderFmUpNextLine() {
    [qRouter.upNextLine(fmSnapshot)].filter(Boolean).forEach(function(l) { player.setUpNext(l.prefix, l.label); });
  }
  function fmSwapVideo(np) {
    clearEngineTimeout();
    loadedId = np.item_id;
    currentTitle = np.title;
    var restartThis = [restart].filter(Boolean).filter(function() { return np.item_id === videoId; })[0];
    loadProgress(SERVER, np.item_id, person)
      .catch(zeroProgress)
      .then(function(prog) {
        player.playVideo({ id: np.item_id, title: np.title, subtitles: np.subtitles, itemType: np.itemType }, from, resumeStart(restartThis, prog));
        renderFmUpNextLine();
        mountCrumbs();
      });
  }
  // Auto-advance at true 100% end, mirroring the retired film advanceAuto:
  // the next item -> a 5s "Up next" countdown then fire `next`; no next ->
  // stop back to origin.
  function fmAdvanceAuto() {
    var next = qRouter.upNextItem(fmSnapshot);
    ({
      'true':  function() { player.startUpNext(next.title, function() { sendFmAction('next', {}); }); },
      'false': function() { player.stop(); }
    })[!!next + '']();
  }
  function fmToggleShuffle() { sendFmAction('toggle-shuffle', {}); }
  function fmToggleRepeat() { sendFmAction('toggle-repeat', {}); }
  // The film transport, at the player screen's own control row — ONE rule
  // with the Queue hero, which is the whole of BUG-510/512: both sites gated
  // on `source_type` alone, so ⏭ read dead on a standalone film even with a
  // film queued behind it, while the engine's own advance() would happily
  // have played it. core/queue-shell-view.js's transportState IS that rule
  // (⏭ live whenever anything is ahead, from the override queue or the
  // source; ⏮/Shuffle/Repeat need a source) and the Queue hero already
  // renders from it — reading it here too is what keeps the two surfaces from
  // disagreeing again. Every control stays VISIBLE and dims when it has
  // nothing to act on, never hidden (QUEUE-UX-SHELL.md's Hero section;
  // TASK-493 row 21, the Films-hides-Shuffle finding).
  function fmSetControlOn(id, on, enabled) {
    var btn = document.getElementById(id);
    btn.classList.remove('hidden');
    btn.classList.toggle('on', on);
    btn.classList.toggle('is-disabled', !enabled);
    btn.disabled = !enabled;
  }
  function fmSetTransportOn(snap) {
    var t = transportState(snap);
    fmSetControlOn('btn-film-shuffle', !!snap.shuffle, t.shuffle);
    fmSetControlOn('btn-film-repeat', !!snap.repeat, t.repeat);
    fmSetControlOn('btn-prev', false, t.previous);
    fmSetControlOn('btn-next', false, t.next);
  }
  var FM_SWAP = { 'true': function(np) { fmSwapVideo(np); }, 'false': function() { renderFmUpNextLine(); } };
  function renderFmNowPlaying(np) { FM_SWAP[qRouter.isSwap(loadedId, fmSnapshot) + ''](np); }
  function applyFmSnapshot(snap) {
    [engineMode === 'film'].filter(Boolean).forEach(function() {
      fmSnapshot = snap;
      // No setSeriesMode here (TASK-517): ⏮/⏭ are the transport rule's now,
      // dimmed rather than hidden — fmSetTransportOn owns both buttons.
      fmSetTransportOn(snap);
      ensureSourceTitle(qRouter.sourceId(snap));
      queue.applySnapshot(snap);
      [snap.now_playing].filter(Boolean).forEach(renderFmNowPlaying);
      sendVideoContext();
    });
  }
  // BUG-518 — the recovery GET is a fallback, never an override: discard an
  // answer that predates this page's own play POST, or the player swaps back to
  // the previously selected film. A WS push needs no such guard — it is always
  // the server's current state. armEngineTimeout still covers a pick that never
  // arrives at all, so discarding here can't leave the page inert forever.
  function applyFmResync(snap) {
    [!qRouter.isStaleResync(fmPendingId, loadedId, snap)].filter(Boolean).forEach(function() {
      applyFmSnapshot(snap);
    });
  }

  // The music-video/home-movie/film context push (also fired on every new
  // video load, below) — reflects the live engine snapshot so the
  // companion's title/up-next/pills never lag behind what the Queue View or
  // the TV's own buttons just did.
  function sendVideoContext() {
    [wsApp].filter(Boolean).forEach(function(ws) {
      ws.sendContext({
        context_id: 'video',
        display: player.currentVideoDisplay(),
        musicVideo: isMusicVideo,
        musicVideoMulti: mvRouter.isMulti(mvSnapshot),
        musicVideoShuffle: !!mvSnapshot.shuffle,
        musicVideoRepeat: !!mvSnapshot.repeat,
        musicVideoSource: mvSourceCrumb,
        homeMovie: isHomeMovie,
        homeMovieShuffle: !!hmSnapshot.shuffle,
        homeMovieRepeat: !!hmSnapshot.repeat,
        film: engineMode === 'film',
        filmShuffle: !!fmSnapshot.shuffle,
        filmRepeat: !!fmSnapshot.repeat,
        // TASK-517 — the phone's film controls read the SAME transportState
        // the TV row and the Queue hero do, pushed as resolved booleans
        // rather than the raw `filmHasSource` it used to re-derive the rule
        // from (which is how BUG-512 left the two surfaces disagreeing).
        filmTransport: transportState(fmSnapshot)
      });
    });
  }

  // TASK-378 — "Add to playlist" for the CURRENTLY PLAYING music video (works from
  // any mv entry mode — a lone pick, inside a music-video playlist, or an artist's
  // videos — mvNowPlayingId() is always the one on screen). Music-video-only: the
  // button stays hidden (CSS) for a series/film, and mvBegin is the only place that
  // reveals it. One sheet, no Play Next option (that is the album-detail per-track
  // sheet's own thing) — just the profile's music-video playlists + New playlist,
  // mirroring screen-album-detail-page's openAddSheet almost verbatim so the two
  // stay in lock-step.
  var addState = { cells: [] };
  function focusAdd(i) { addState.cells[i].focus(); }
  function closeAddSheet() {
    document.getElementById('add-sheet').style.display = 'none';
    document.getElementById('btn-add-playlist').focus();
  }
  var addStatusTimer = null;
  function hideAddStatus() { document.getElementById('add-status').style.display = 'none'; }
  function showAddStatus(text) {
    var el = document.getElementById('add-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(addStatusTimer);
    addStatusTimer = setTimeout(hideAddStatus, 2500);
  }
  function addExisting(id, title) {
    addToPlaylist(SERVER, id, mvNowPlayingId())
      .then(function() { closeAddSheet(); showAddStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showAddStatus('Could not add to playlist.'); });
  }
  function createNewPlaylist() {
    navTo('playlist-create.html', { addTrack: mvNowPlayingId(), collectionType: 'music-video-playlist' });
  }
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
    b.textContent = '♪ ' + card.title;
    b.setAttribute('data-id', card.id);
    b.addEventListener('click', function() { addExisting(card.id, card.title); });
    b.addEventListener('keydown', onAddKey);
    document.getElementById('add-sheet-list').appendChild(b);
    return b;
  }
  function showAddSheet(cards) {
    document.getElementById('add-sheet-list').innerHTML = '';
    addState.cells = cards.map(buildPlaylistChoice).concat([document.getElementById('btn-add-create'), document.getElementById('btn-add-cancel')]);
    document.getElementById('add-sheet').style.display = 'flex';
    focusAdd(0);
  }
  function openAddSheet() {
    loadBrowse(SERVER, profile)
      .then(function(res) { showAddSheet(playlistCards(res.content, null, 'music-video-playlist')); })
      .catch(function() { showAddStatus('Could not load playlists.'); });
  }

  // Music-video/home-movie/film mode never fires the OLD video-playback
  // engine (next/prev/end all resolve against their OWN engine instead,
  // above) — the owner ruled out routing a music video through this one
  // (TASK-374), TASK-499 cut home movies over to the unified queue engine
  // the same way, and TASK-503 does the same for series/single ('video'
  // engineMode — the browse "Play Queue" tile only — is the one mode still
  // on it).
  var ON_ENDED = { mv: mvEnded, hm: hmEnded, film: fmAdvanceAuto, video: advanceAuto };
  var ON_NEXT  = { mv: function() { sendMvAction('next', {}); }, hm: function() { sendHmAction('next', {}); }, film: function() { sendFmAction('next', {}); }, video: function() { sendAction('next', {}); } };
  var ON_PREV  = { mv: function() { sendMvAction('previous', {}); }, hm: function() { sendHmAction('previous', {}); }, film: function() { sendFmAction('previous', {}); }, video: function() { sendAction('previous', {}); } };

  player = setupPlayer({
    video: document.getElementById('video'),
    server: SERVER,
    onStop: function() {
      // TASK-486 (revision): Stop from a Play All list entry (the list's own
      // Play All button or a tapped row) returns to that SAME scoped list,
      // mirroring `detail` returning to its series — never a bare browse drop.
      var STOP_NAV = {
        detail: function() { navTo('detail.html', { series: seriesId }); },
        'home-movies-list': function() { navTo('home-movies-list.html', { homeMoviesAll: homeMoviesAll, homeMoviesPerson: homeMoviesPerson, homeMoviesMonth: homeMoviesMonth }); },
        browse: function() { navTo('browse.html'); }
      };
      [STOP_NAV[from]].filter(Boolean).concat([function() { navTo('browse.html'); }])[0]();
    },
    onEnded: ON_ENDED[engineMode],
    onNext:  ON_NEXT[engineMode],
    onPrev:  ON_PREV[engineMode],
    // Full app_state snapshot to the companion (FEAT-017): static context here,
    // live position/playing/captions added by the player. The music-video/
    // home-movie flags ride the CONTEXT push below, not this one — that is
    // what the companion mirror reads to stop trusting the video-playback
    // engine snapshot.
    emitState: function(snap) { [wsApp].filter(Boolean).forEach(function(ws) { ws.sendAppState(snap); }); },
    appContext: function() {
      return { screen: 'player', itemId: [seriesId].filter(Boolean).concat([loadedId, videoId]).filter(Boolean)[0], episodeId: [loadedId].filter(Boolean).concat([videoId])[0], profile: profile };
    },
    onIntent: function(intent) {
      var VIDEO_CTX = { play: true, video: true };
      [VIDEO_CTX[intent]].filter(Boolean).forEach(sendVideoContext);
    }
  });

  // FEAT-040 (TASK-250) / FEAT-418 (TASK-420) / TASK-499/503: the Queue View
  // overlay hangs off the player, sharing the SAME #queue-overlay/
  // #queue-body/#queue-crumb DOM and #btn-queue trigger for every mode
  // (engineMode is fixed for the whole page load, so exactly one controller
  // is ever live). While open it owns the d-pad (its own grid nav + Back to
  // close); closed, keys drive the transport as before. Each row control
  // fires an action against the mode's OWN engine — the server broadcasts the
  // new snapshot, which repaints the overlay (no local math). onToggle is the
  // hm/film hero's device-local Play/Pause (QUEUE-UX-SHELL.md) — it toggles
  // the already-mounted <video> directly, same as the companion Queue Views'
  // own WS `toggle` intent; the other two setup fns simply never read it.
  // getSourceTitle is film's own hero source line — the series/boxset title
  // this page already fetches for its breadcrumb; every other setup fn
  // ignores it the same way they already ignore onToggle.
  //
  // TASK-516/517: hm and film both run on THE shared shell
  // (ui/screens/screen-queue-shell.js) — one controller, told which media
  // type it is by `config.media` rather than each keeping its own copy, so
  // the two can no longer drift apart. Home movies' hero source line derives
  // from the snapshot's own person/month slugs (getSourceTitle unread there);
  // a film's is an opaque series/boxset id, so it reads this page's own
  // lookup. Music + music videos join them in TASK-504/505.
  var SETUP_QUEUE = { mv: setupMusicVideoQueue, hm: setupQueueShell, film: setupQueueShell, video: setupVideoQueue };
  var QUEUE_MEDIA = { hm: HOME_MOVIE, film: FILM };
  var SEND_QUEUE_ACTION = { mv: sendMvAction, hm: sendHmAction, film: sendFmAction, video: sendAction };
  queue = SETUP_QUEUE[engineMode]({
    root: document.getElementById('queue-overlay'),
    body: document.getElementById('queue-body'),
    crumb: document.getElementById('queue-crumb'),
    onAction: function(action, body) { SEND_QUEUE_ACTION[engineMode](action, body); },
    onToggle: function() { player.remote.toggle(); },
    onClose: function() { document.getElementById('btn-queue').focus(); },
    getSourceTitle: function() { return seriesTitle; },
    media: QUEUE_MEDIA[engineMode]
  });
  document.getElementById('btn-queue').addEventListener('click', function() { queue.open(); });
  document.getElementById('btn-add-playlist').addEventListener('click', openAddSheet);
  document.getElementById('btn-add-create').addEventListener('click', createNewPlaylist);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);
  document.getElementById('btn-add-create').addEventListener('keydown', onAddKey);
  document.getElementById('btn-add-cancel').addEventListener('keydown', onAddKey);
  document.getElementById('btn-mv-shuffle').addEventListener('click', mvToggleShuffle);
  document.getElementById('btn-mv-repeat').addEventListener('click', mvToggleRepeat);
  document.getElementById('btn-hm-shuffle').addEventListener('click', hmToggleShuffle);
  document.getElementById('btn-hm-repeat').addEventListener('click', hmToggleRepeat);
  document.getElementById('btn-film-shuffle').addEventListener('click', fmToggleShuffle);
  document.getElementById('btn-film-repeat').addEventListener('click', fmToggleRepeat);

  var KEY_TARGET = {
    'true':  function(e) { queue.handleKey(e); },
    'false': function(e) { player.handleVideoKey(e); }
  };
  function onVideoKey(e) { KEY_TARGET[queue.isOpen() + ''](e); }
  var keys = {};
  VIDEO_KEYS.forEach(function(k) { keys[k] = onVideoKey; });
  initPage({ onEnter: function() { document.getElementById('btn-play-pause').focus(); }, keys: keys, remote: player.remote });

  // Breadcrumb crumbs on the companion send a `navigate` intent (FEAT-021);
  // everything else routes to the player's d-pad/transport remote.
  function appIntent(intent, params) {
    var EXTRA = { navigate: function() { navTo(params.page, params.params); }, toggleShuffle: mvToggleShuffle, toggleRepeat: mvToggleRepeat };
    var fn = [EXTRA[intent]].filter(Boolean).concat([player.remote[intent]]).filter(Boolean)[0];
    [fn].filter(Boolean).forEach(function(f) { f(params); });
  }
  // TASK-499/503: a person may hold live queue state in more than one media
  // type at once (the WS relay tags every push with `media_type`) — this
  // page only ever drives ONE of them per load, so it filters to its own.
  var APPLY_QUEUE_SNAPSHOT = { 'home-movie': applyHmSnapshot, film: applyFmSnapshot };
  function applyQueuePlayback(payload) {
    [APPLY_QUEUE_SNAPSHOT[payload.media_type]].filter(Boolean).forEach(function(fn) { fn(payload); });
  }
  wsApp = connectApp(window.location.origin, appIntent, {
    onVideoPlayback: applySnapshot,
    onMusicVideoPlayback: applyMvSnapshot,
    onQueuePlayback: applyQueuePlayback,
    onPersonActive: resyncOnActivate
  });

  document.addEventListener('keydown', dispatchKey);

  // ── entry: series fires play-source (server then drives swaps); a standalone
  // film loads directly. initCaptions seeds the global captions cache before the
  // first playVideo reads it (FEAT-023); it never rejects.
  //
  // TASK-503 — series/single now fire the TASK-498 unified queue engine
  // (/api/queue/film), never the OLD video engine's own play-source/
  // play-video (those still exist, driving only `queue` mode below). A
  // boxset sends the SAME 'series' source_type as a TV series — queue_engine
  // registers 'series' and 'boxset' as two names for the identical catalog
  // query (queue_catalog_source.py both just call get_collection_item_ids),
  // and the OLD engine already sent 'series' unconditionally for either
  // (video_playback_engine.py, same catalog identity) — this cutover keeps
  // that exact behaviour rather than threading collectionType through the
  // nav params for a purely cosmetic tag.
  function startSeries() {
    mountCrumbs();
    ensureSourceTitle(seriesId);
    fmPendingId = videoId;   // BUG-518 — null for Play All, which picks no item
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { sendFmAction('play-source', { source_type: 'series', source_id: seriesId, item_id: videoId }); })
      .catch(function() {});
  }
  // A standalone film plays THROUGH the engine too (FEAT-040/TASK-251,
  // TASK-503: 'play-standalone' on the NEW engine — the twin of the OLD
  // engine's own 'play-video'), so the companion + Queue View always reflect
  // the real now-playing. The snapshot's now_playing is the film
  // (current_item_id, no source); fmSwapVideo loads it + resumes from
  // watch_progress. The durable queue plays after it.
  function startSingle() {
    mountCrumbs();
    fmPendingId = videoId;   // BUG-518 — always set here; a single IS the pick
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { sendFmAction('play-standalone', { item_id: videoId }); })
      .catch(function() {});
  }
  // TASK-499 (FEAT-497) — Home Movies Play All / by-person / by-month: cut
  // over from the video engine's own home-movies-* sources (TASK-446/486/
  // 491) onto the TASK-498 unified queue engine, mirroring mvBegin's own
  // two-action entry pattern (the new engine's play-source takes no item_id
  // of its own — a tapped row's `video` param plays via a follow-up
  // play-item once the source resolves, same as an mv entry's tapped pick).
  // ONE entry point for all three source shapes (HM_SOURCE_TYPE/HM_SOURCE_ID
  // already key on `mode`), always unshuffled — shuffle is a live Queue View
  // toggle (owner correction, unchanged by this cutover), not a param here.
  function hmBegin(itemId) {
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { return sendHmSource(); })
      .then(function() { [itemId].filter(Boolean).forEach(function(id) { sendHmAction('play-item', { item_id: id }); }); })
      .catch(function() {});
  }
  function startHomeMovies() {
    mountCrumbs();
    hmBegin(videoId);
  }
  // FEAT-040 (Play Queue): entered with ?playQueue (no video/series) — fire
  // play-queue (the server makes the queue head current, without consuming
  // it) and render from the snapshot like the others. Lets you START the
  // queue without opening a random video first. TASK-517: on the UNIFIED
  // engine now (/api/queue/film), the same rail every other film route uses —
  // so the queue this plays is the one every ＋Queue press has been filling
  // since TASK-503, and the Queue it opens is the shell, not the pre-FEAT-497
  // screen this route showed until now.
  function startQueue() {
    mountCrumbs();
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { sendFmAction('play-queue', {}); })
      .catch(function() {});
  }
  // TASK-422: the mv source crumb's own { label, page, params } targets, one per
  // entry mode with a source page — mirrors companion-audio.js's SOURCE_CRUMB.
  // mvItem has no entry (a lone pick has no source page, story 4).
  var MV_SOURCE_CRUMB = {
    mvPlaylist: function(title) { return { label: title, page: 'playlist-detail.html', params: { playlist: mvPlaylist } }; },
    mvArtist:   function() { return { label: mvArtist, page: 'artist.html', params: { artist: mvArtist } }; }
  };
  // Music-video entries (TASK-374, BUG-485): fire the engine's play-source for
  // this mode, then begin (mvBegin primes captions + the engine timeout + the
  // optional play-video jump). The server resolves the source's own order now
  // (mv-artist/mv-all no longer need a client-side loadBrowse fetch to sort —
  // the engine's catalog resolution already matches it, TASK-445).
  function startMvItem() {
    mvBegin(mvItem);
  }
  function startMvPlaylist() {
    loadPlaylist(SERVER, mvPlaylist)
      .then(function(pl) {
        mvSourceCrumb = MV_SOURCE_CRUMB.mvPlaylist(pl.title);
        // TASK-376/377: reached from the playlist's own detail screen, tapping
        // a specific track — the playthrough starts there, same as an audio
        // playlist starts from the tapped track, then carries on in order. No
        // tapped track ⇒ mvBegin(undefined), the playlist's own first item.
        mvBegin(mvTrack);
      })
      .catch(function() { navTo('error.html'); });
  }
  function startMvArtist() {
    mvSourceCrumb = MV_SOURCE_CRUMB.mvArtist();
    mvBegin();
  }
  // TASK-445 — Play All: every music video in the catalog, no source page to
  // link back to (mvSourceCrumb stays null, degrading to Home > leaf like
  // mvItem — story 4 has no equivalent here since there is no single item).
  function startMvAll() {
    mvBegin();
  }
  var ENTRY = {
    queue: startQueue,
    mvPlaylist: startMvPlaylist,
    mvArtist: startMvArtist,
    mvItem: startMvItem,
    mvAll: startMvAll,
    homeMoviesAll: startHomeMovies,
    homeMoviesPerson: startHomeMovies,
    homeMoviesMonth: startHomeMovies,
    series: startSeries,
    single: startSingle
  };
  ENTRY[mode]();
}
