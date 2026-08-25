import { getParam, getProfile, getPerson, navTo, initCaptions } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-video-player.js';
import { setupVideoQueue } from './screen-video-queue.js';
import { setupQueueShell } from './screen-queue-shell.js';
import { HOME_MOVIE, FILM, MUSIC_VIDEO } from '../../core/queue-shell-config.js';
import { transportState } from '../../core/queue-shell-view.js';
import { connectApp } from '../../core/app-ws.js';
import { loadSeriesTitle, loadProgress, loadPlaylist, loadBrowse, loadMusicVideoSourceTitle, loadVideoPlayback, loadQueuePlayback, videoPlaybackAction, queuePlaybackAction, addToPlaylist } from '../../core/app-api.js';
import { isMidWatch } from '../../core/progress.js';
import { isSwap, upNextItem, upNextLine, seriesMode } from '../../core/video-player-router.js';
import { entryMode } from '../../core/music-video-playthrough.js';
// TASK-503/505: qRouter is the shared view-router for the TASK-498 unified
// queue engine's `queue_playback` snapshot — used by home movies (TASK-499,
// media_type 'home-movie'), films (TASK-503) and music videos (TASK-505), so
// it is no longer hm-specific despite the module's own file name.
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
//             wholesale (TASK-525).
//   'hm'    — TASK-499: home movies, on the SAME TASK-498 unified queue
//             engine as 'film' but its own media_type (/api/queue/home-movie).
//   'mv'    — a MUSIC VIDEO (single pick, a music-video playlist, an
//             artist's music videos, or the whole-catalog Play All —
//             TASK-374/445): TASK-505 cut it over onto the SAME unified queue
//             engine as the other three, its own media_type
//             (/api/queue/music-video), retiring the dedicated engine +
//             channel FEAT-418 gave it (TASK-419/420, BUG-485). It is the
//             LAST of the four media types to move, so every rail below bar
//             'video' now fires the same qRouter-backed call — a per-type
//             difference from here on is a data entry, never a new branch.
//
// What still separates 'mv' from 'film' is deliberate and small: a music
// video never resumes (always starts at 0, TASK-373), it advances with no
// "Up next" countdown, and its breadcrumb names its playback SOURCE rather
// than a series (TASK-422).
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
  // The ACTIVE SOURCE's display name — a series/boxset title in film mode
  // (also the top crumb), a playlist/artist/Play-All label in mv mode
  // (TASK-505). Both feed the Queue shell hero's source line the same way;
  // sourceKey below says which source it was fetched for.
  var sourceTitle = null;
  var loadedSourceKey = null;
  var mvSnapshot = {};     // latest queue_playback snapshot (music-video mode only, TASK-505)
  var hmSnapshot = {};     // latest queue_playback snapshot (home-movie mode only, TASK-499)
  var fmSnapshot = {};     // latest queue_playback snapshot (film mode only, TASK-503)
  var fmPendingId = null;  // BUG-521: the item this page was opened for, until a snapshot confirms it
  var mvPendingId = null;  // BUG-522: the same guard for music videos, cut over onto the same racy entry chain
  var enginePending = null;  // ENGINE_TIMEOUT_MS watchdog, armed per engine action, cleared on first swap
  // TASK-422: the music-video playback source's own crumb — { label, page, params }
  // linking to its playlist/artist page, mirroring BUG-044's audio sourceCrumb.
  // Built once per entry (startMvPlaylist/startMvArtist, before mvBegin), never
  // per-swap; stays null for a standalone mvItem pick (no source page, story 4).
  var mvSourceCrumb = null;

  function sendAction(action, body) { videoPlaybackAction(SERVER, action, person, body).catch(function() {}); }
  // TASK-505 (FEAT-497) — the unified queue engine's own action sender for
  // MUSIC-VIDEO mode, now the exact twin of the hm/film senders below: POSTs
  // to /api/queue/music-video, never the retired /api/music-video-playback
  // engine. A function EXPRESSION, not a declaration — same reason
  // screen-audio-page's own sendAction is one: it is an IO call (no DOM token,
  // returns a value), which the no-pure-fn-outside-core arch check would
  // otherwise flag as "move to core/", but it closes over SERVER/person and
  // only fans out a request, so it belongs here.
  var sendMvAction = function(action, body) { return queuePlaybackAction(SERVER, 'music-video', action, person, body).catch(function() {}); };
  // source_type/source_id for the CURRENT mv playthrough, keyed off the same
  // `mode` entryMode() already resolved (mvPlaylist/mvArtist/mvAll are
  // mutually exclusive per page load) — mirrors the unified engine's own
  // "mv-artist"/"mv-playlist"/"mv-all" registered names (TASK-498,
  // media-manager/db/queue_engine.py). `mvItem` — a LONE pick — has no entry:
  // it plays as a standalone item with no source at all (startMvItem below),
  // the same shape a standalone film uses, which is what leaves its
  // ⏮/⏭/Shuffle/Repeat dimmed-but-visible rather than acting on a source of
  // one (story 4).
  var MV_SOURCE_TYPE = { mvPlaylist: 'mv-playlist', mvArtist: 'mv-artist', mvAll: 'mv-all' };
  var MV_SOURCE_ID = { mvPlaylist: function() { return mvPlaylist; }, mvArtist: function() { return mvArtist; }, mvAll: function() { return null; } };
  // ONE action per entry, like startSeries: the unified engine's play-source
  // takes the optional item_id of a tapped row itself (a playlist track), so
  // the old play-source-then-play-video pair collapses. No shuffle/repeat
  // flags either — the engine reads this person's remembered per-source
  // preference (TASK-498), which is what makes an artist or playlist start in
  // source order and remember a later Shuffle (story 5).
  function sendMvSource(startId) { return sendMvAction('play-source', { source_type: MV_SOURCE_TYPE[mode], source_id: MV_SOURCE_ID[mode](), item_id: startId }); }

  // TASK-499 (FEAT-497) — the unified queue engine's own action sender for
  // home movies, the hm twin of sendMvAction: POSTs to /api/queue/home-movie.
  // source_type/source_id mirror MV_SOURCE_TYPE/MV_SOURCE_ID's shape, keyed
  // off the same `mode` (homeMoviesAll/-Person/-Month are mutually exclusive
  // per page load) against the engine's own registered names
  // (media-manager/db/queue_engine.py).
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
        seriesTitle: [sourceTitle].filter(Boolean).concat(['Series'])[0],
        videoTitle: currentTitle
      });
    }
  };
  function mountCrumbs() {
    mountBreadcrumb('breadcrumb', CRUMBS_FOR[isMusicVideo + '']());
  }
  // TASK-503/505 — sourceTitle also feeds the Queue shell hero's source line;
  // a re-render past the overlay's first paint picks up a title that resolves
  // after that paint (screen-queue-shell.js's own getSourceTitle() reads this
  // same var live, but only on ITS next render — this nudges one the moment
  // the fetch lands). Only the two rails whose source name arrives
  // ASYNCHRONOUSLY need the nudge: home movies derive theirs from the
  // snapshot's own slugs, and 'video' mode's controller has no such call.
  var TITLE_IS_FETCHED = { film: true, mv: true };
  function refreshQueueSourceTitle() {
    [TITLE_IS_FETCHED[engineMode]].filter(Boolean).forEach(function() { queue.refreshSourceTitle(); });
  }
  // Which lookup names this rail's source. A film's is an opaque series/boxset
  // id; a music video's is one of three source kinds, so it dispatches on the
  // snapshot's own source_type (TASK-505) — the same split the companion Queue
  // page's `loadSourceName` already makes.
  var SOURCE_TITLE_FOR = {
    film: function(snap) { return loadSeriesTitle(SERVER, snap.source_id); },
    mv:   function(snap) { return loadMusicVideoSourceTitle(SERVER, snap.source_id, snap.source_type); }
  };
  function applySourceTitle(snap) {
    SOURCE_TITLE_FOR[engineMode](snap)
      .then(function(title) { sourceTitle = title; mountCrumbs(); refreshQueueSourceTitle(); })
      .catch(function() {});
  }
  // TASK-517 — keyed on the SOURCE the engine says is loaded, not on this
  // page's own `series` param, so the "Play Queue" entry (which has no param
  // at all, but can land on a person whose film source is still loaded) names
  // its source in the hero like every other route. Fetched once per distinct
  // source — series mode primes it eagerly at entry, and the snapshot's own
  // source confirms or replaces it. An item with no source at all (a
  // standalone film, a lone music-video pick) clears it rather than fetching,
  // mirroring the companion page's own resolution.
  //
  // TASK-505 — the key is source_type AND source_id, not the id alone: the
  // whole-catalog Play All ('mv-all') is a real source carrying no id, which
  // an id-only key could not tell apart from having no source.
  function sourceKey(snap) {
    return [snap.source_type].filter(Boolean).map(function(t) { return t + '/' + snap.source_id; }).concat([null])[0];
  }
  function ensureSourceTitle(snap) {
    var key = sourceKey(snap);
    [key !== loadedSourceKey].filter(Boolean).forEach(function() {
      loadedSourceKey = key;
      sourceTitle = null;
      [key].filter(Boolean).forEach(function() { applySourceTitle(snap); });
    });
  }
  // An entry that has ALREADY fetched its source's name records it here rather
  // than letting the first snapshot fetch the same record again (a music-video
  // playlist reads its own title for the breadcrumb, TASK-422). The snapshot
  // still has the last word: if the engine resolves a DIFFERENT source than
  // this entry named, the key won't match and ensureSourceTitle refetches.
  function primeSourceTitle(sourceType, sourceId, title) {
    loadedSourceKey = sourceKey({ source_type: sourceType, source_id: sourceId });
    sourceTitle = title;
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
  // same item_id), the fix if it didn't.
  //
  // TASK-505: music-video mode rides the unified engine's own GET now, and
  // goes through applyMvResync — the BUG-521 stale guard, which BUG-522 found
  // this rail needs too (its recovery answer can describe the PREVIOUSLY
  // selected video and override a fresh pick). Converging onto the shared
  // path is what closes that here, rather than shipping a known-racy new one.
  var RESYNC_ON_ACTIVATE = {
    mv:    function() { loadQueuePlayback(SERVER, 'music-video', person).then(applyMvResync).catch(function() {}); },
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

  // ── music-video queue (TASK-505, FEAT-497): server-authoritative over the
  // TASK-498 unified queue engine's own `queue_playback` snapshot
  // (core/queue-playback-router.js, aliased qRouter), the mv twin of the hm
  // and fm blocks — the same qRouter calls, the same shell, the same one
  // transportState rule. Two behaviours stay genuinely mv's own: it always
  // starts at 0 (no loadProgress, no resume — a music video never resumes,
  // TASK-373; the video player "assumes resume" and this deliberately never
  // asks it to), and it advances with no "Up next" countdown, directly, like a
  // song (screen-audio-page's onEnded) rather than a film's 5s overlay.
  function renderMvUpNextLine() {
    [qRouter.upNextLine(mvSnapshot)].filter(Boolean).forEach(function(l) { player.setUpNext(l.prefix, l.label); });
  }
  function mvSwap(np) {
    clearEngineTimeout();
    loadedId = np.item_id;
    currentTitle = np.title;
    player.playVideo({ id: np.item_id, title: np.title, subtitles: np.subtitles, ext: np.ext }, from, 0);
    renderMvUpNextLine();
    mountCrumbs();
  }
  function mvEnded() {
    ({ 'true': function() { sendMvAction('next', {}); }, 'false': function() { player.stop(); } })[!!qRouter.upNextItem(mvSnapshot) + '']();
  }
  // Add to playlist (below) always targets the CURRENTLY PLAYING video, read
  // off the live snapshot rather than a locally-tracked id.
  function mvNowPlayingId() { return [qRouter.nowPlaying(mvSnapshot)].filter(Boolean).concat([{}])[0].item_id; }
  // One entry point every mv* start function below chains through. TASK-505
  // collapsed the old play-source-then-play-video pair into ONE action, the
  // shape startSeries already used: the unified engine's play-source takes the
  // tapped item itself. `startId` is a tapped playlist track, absent for an
  // artist rail or Play All, where play-source's own first entry is what plays.
  function mvBegin(startId) {
    document.getElementById('btn-add-playlist').classList.remove('hidden');
    mvPendingId = startId;   // BUG-522 — null for an artist/Play All, which picks no item
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { return sendMvSource(startId); })
      .catch(function() {});
  }

  // Shuffle + Repeat and ⏮/⏭, TV side, at the player screen's own control row
  // — ONE rule with the Queue hero (core/queue-shell-view.js transportState),
  // exactly as TASK-517 made it for films. TASK-505 retired mvApplyMulti, the
  // pre-FEAT-497 gate that HID all four on a lone pick off BUG-485's
  // `item_count`: the unified snapshot carries no such field, and the shell's
  // model is disabled-but-visible everywhere (QUEUE-UX-SHELL.md's Hero
  // section, TASK-493 row 21). So a lone music video now dims its transport
  // instead of losing it (story 4), and ⏭ lights up whenever anything is
  // ahead — including a video queued behind a lone pick, which the old gate
  // could not express at all.
  function mvSetTransportOn(snap) {
    var t = transportState(snap);
    setControlOn('btn-mv-shuffle', !!snap.shuffle, t.shuffle);
    setControlOn('btn-mv-repeat', !!snap.repeat, t.repeat);
    setControlOn('btn-prev', false, t.previous);
    setControlOn('btn-next', false, t.next);
  }
  function mvToggleShuffle() { sendMvAction('toggle-shuffle', {}); }
  function mvToggleRepeat() { sendMvAction('toggle-repeat', {}); }

  // The Queue shell AND the actual <video> element render off the SAME
  // snapshot — repaint the overlay, then swap media only when the now-playing
  // item actually changed (isSwap), mirroring applyFmSnapshot above.
  var MV_SWAP = { 'true': function(np) { mvSwap(np); }, 'false': function() { renderMvUpNextLine(); } };
  function renderMvNowPlaying(np) { MV_SWAP[qRouter.isSwap(loadedId, mvSnapshot) + ''](np); }
  function applyMvSnapshot(snap) {
    [engineMode === 'mv'].filter(Boolean).forEach(function() {
      mvSnapshot = snap;
      // No setSeriesMode here (the fm block's own note applies): ⏮/⏭ are the
      // transport rule's now, dimmed rather than hidden.
      mvSetTransportOn(snap);
      ensureSourceTitle(snap);
      queue.applySnapshot(snap);
      [snap.now_playing].filter(Boolean).forEach(renderMvNowPlaying);
      sendVideoContext();
    });
  }
  // BUG-522 — the same guard applyFmResync applies for films (BUG-521): the
  // entry-time recovery GET is a fallback, never an override, or the player
  // swaps back to the previously selected music video.
  function applyMvResync(snap) {
    [!qRouter.isStaleResync(mvPendingId, loadedId, snap)].filter(Boolean).forEach(function() {
      applyMvSnapshot(snap);
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
  // snapshot (removing an absent class is a no-op, so repeating it every
  // snapshot is harmless); the ⏮/⏭ transport row stays visible too
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
  // TASK-493 row 21, the Films-hides-Shuffle finding). TASK-505: mv reads the
  // same helper, so the two rails cannot drift into two dimming rules.
  function setControlOn(id, on, enabled) {
    var btn = document.getElementById(id);
    btn.classList.remove('hidden');
    btn.classList.toggle('on', on);
    btn.classList.toggle('is-disabled', !enabled);
    btn.disabled = !enabled;
  }
  function fmSetTransportOn(snap) {
    var t = transportState(snap);
    setControlOn('btn-film-shuffle', !!snap.shuffle, t.shuffle);
    setControlOn('btn-film-repeat', !!snap.repeat, t.repeat);
    setControlOn('btn-prev', false, t.previous);
    setControlOn('btn-next', false, t.next);
  }
  var FM_SWAP = { 'true': function(np) { fmSwapVideo(np); }, 'false': function() { renderFmUpNextLine(); } };
  function renderFmNowPlaying(np) { FM_SWAP[qRouter.isSwap(loadedId, fmSnapshot) + ''](np); }
  function applyFmSnapshot(snap) {
    [engineMode === 'film'].filter(Boolean).forEach(function() {
      fmSnapshot = snap;
      // No setSeriesMode here (TASK-517): ⏮/⏭ are the transport rule's now,
      // dimmed rather than hidden — fmSetTransportOn owns both buttons.
      fmSetTransportOn(snap);
      ensureSourceTitle(snap);
      queue.applySnapshot(snap);
      [snap.now_playing].filter(Boolean).forEach(renderFmNowPlaying);
      sendVideoContext();
    });
  }
  // BUG-521 — the recovery GET is a fallback, never an override: discard an
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
        musicVideoShuffle: !!mvSnapshot.shuffle,
        musicVideoRepeat: !!mvSnapshot.repeat,
        musicVideoSource: mvSourceCrumb,
        // TASK-505 — the phone's music-video controls read the SAME
        // transportState the TV row and the Queue hero do, pushed as resolved
        // booleans, exactly as TASK-517 did for films. This replaces the
        // `musicVideoMulti` flag the companion used to re-derive a
        // show/hide rule from, which is what made a lone pick's controls
        // vanish on both surfaces (story 4).
        musicVideoTransport: transportState(mvSnapshot),
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
  // engine: all three resolve next/prev/end against the TASK-498 unified
  // queue engine, their own media_type apart (TASK-499 home movies, TASK-503
  // films, TASK-505 music videos). 'video' engineMode is unreachable — no
  // `mode` resolves to it since TASK-517 — and goes with the old engines.
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

  // FEAT-040 (TASK-250) / TASK-499/503/505: the Queue View overlay hangs off
  // the player, sharing the SAME #queue-overlay/#queue-body/#queue-crumb DOM
  // and #btn-queue trigger for every mode (engineMode is fixed for the whole
  // page load, so exactly one controller is ever live). While open it owns
  // the d-pad (its own grid nav + Back to close); closed, keys drive the
  // transport as before. Each row control fires an action against the unified
  // engine for this mode's media type — the server broadcasts the new
  // snapshot, which repaints the overlay (no local math). onToggle is the
  // hero's device-local Play/Pause (QUEUE-UX-SHELL.md) — it toggles the
  // already-mounted <video> directly, same as the companion Queue pages' own
  // WS `toggle` intent.
  //
  // TASK-516/517/505: hm, film AND mv all run on THE shared shell
  // (ui/screens/screen-queue-shell.js) — one controller, told which media
  // type it is by `config.media` rather than each keeping its own copy, so
  // they cannot drift apart. Home movies' hero source line derives from the
  // snapshot's own person/month slugs (getSourceTitle unread there); a film's
  // series/boxset id and a music video's playlist/artist source are opaque, so
  // both read this page's own lookup. Only the unreachable 'video' mode keeps
  // a controller of its own, retiring with the old engines (TASK-525).
  var SETUP_QUEUE = { mv: setupQueueShell, hm: setupQueueShell, film: setupQueueShell, video: setupVideoQueue };
  var QUEUE_MEDIA = { mv: MUSIC_VIDEO, hm: HOME_MOVIE, film: FILM };
  var SEND_QUEUE_ACTION = { mv: sendMvAction, hm: sendHmAction, film: sendFmAction, video: sendAction };
  queue = SETUP_QUEUE[engineMode]({
    root: document.getElementById('queue-overlay'),
    body: document.getElementById('queue-body'),
    crumb: document.getElementById('queue-crumb'),
    onAction: function(action, body) { SEND_QUEUE_ACTION[engineMode](action, body); },
    onToggle: function() { player.remote.toggle(); },
    onClose: function() { document.getElementById('btn-queue').focus(); },
    getSourceTitle: function() { return sourceTitle; },
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
  // TASK-499/503/505: a person may hold live queue state in more than one
  // media type at once (the WS relay tags every push with `media_type`) —
  // this page only ever drives ONE of them per load, so it filters to its own.
  var APPLY_QUEUE_SNAPSHOT = { 'home-movie': applyHmSnapshot, film: applyFmSnapshot, 'music-video': applyMvSnapshot };
  function applyQueuePlayback(payload) {
    [APPLY_QUEUE_SNAPSHOT[payload.media_type]].filter(Boolean).forEach(function(fn) { fn(payload); });
  }
  wsApp = connectApp(window.location.origin, appIntent, {
    onVideoPlayback: applySnapshot,
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
    ensureSourceTitle({ source_type: 'series', source_id: seriesId });
    fmPendingId = videoId;   // BUG-521 — null for Play All, which picks no item
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
    fmPendingId = videoId;   // BUG-521 — always set here; a single IS the pick
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
  // Music-video entries (TASK-374, TASK-505): each fires ONE unified-engine
  // action, mvBegin priming captions + the engine timeout + the BUG-522 stale
  // guard around it. The server resolves the source's own order (mv-artist/
  // mv-all need no client-side loadBrowse sort — the engine's catalog
  // resolution already matches it, TASK-445).
  //
  // A LONE pick is the one entry with no source at all: play-standalone, the
  // same action a standalone film uses, rather than a source of exactly one.
  // That is what leaves its ⏮/⏭/Shuffle/Repeat dimmed-but-visible (story 4)
  // instead of offering controls with nothing to act on, and it is why the
  // engine's registered 'mv-item' source goes unused from here.
  function startMvItem() {
    document.getElementById('btn-add-playlist').classList.remove('hidden');
    mvPendingId = mvItem;   // BUG-522 — a lone pick always IS the pick
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { sendMvAction('play-standalone', { item_id: mvItem }); })
      .catch(function() {});
  }
  function startMvPlaylist() {
    loadPlaylist(SERVER, mvPlaylist)
      .then(function(pl) {
        mvSourceCrumb = MV_SOURCE_CRUMB.mvPlaylist(pl.title);
        primeSourceTitle('mv-playlist', mvPlaylist, pl.title);
        // TASK-376/377: reached from the playlist's own detail screen, tapping
        // a specific track — the playthrough starts there, same as an audio
        // playlist starts from the tapped track, then carries on in order. No
        // tapped track ⇒ mvBegin(undefined), which sends play-source with no
        // item_id, and the playlist's own first item plays.
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
