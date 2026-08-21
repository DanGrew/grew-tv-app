import { getParam, getProfile, getPerson, navTo, initCaptions } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-video-player.js';
import { setupVideoQueue } from './screen-video-queue.js';
import { setupMusicVideoQueue } from './screen-music-video-queue.js';
import { connectApp } from '../../core/app-ws.js';
import { loadSeries, loadProgress, loadPlaylist, loadBrowse, loadVideoPlayback, loadMusicVideoPlayback, videoPlaybackAction, musicVideoPlaybackAction, addToPlaylist } from '../../core/app-api.js';
import { isMidWatch } from '../../core/progress.js';
import { isSwap, upNextItem, upNextLine, seriesMode } from '../../core/video-player-router.js';
import { entryMode } from '../../core/music-video-playthrough.js';
import * as mvRouter from '../../core/music-video-playback-router.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { gridIndex } from '../../core/playlist-name.js';
import { buildCrumbs, playerCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// FEAT-037 (TASK-222) — the PERSISTENT video player document. Replaces the old
// per-episode video.html reload: the <video> element lives for the whole play
// session and media swaps in place.
//
// A SERIES/BOXSET is SERVER-AUTHORITATIVE (mirrors the music page, FEAT-031): on
// entry the page fires a `play-source` action and thereafter renders the
// `video_playback` snapshot the backend pushes (TASK-221) — next/previous and the
// auto-advance fire actions and wait for the next snapshot, which swaps media in
// place (no page reload). core/video-player-router turns each snapshot into the
// view-model applied below.
//
// A STANDALONE FILM has no engine source type, so it stays a direct load — there
// is nothing to advance to. Both paths resume from watch_progress (the single
// source of truth for per-item position; the player saves there as it plays).
//
// A MUSIC VIDEO (single pick, a music-video playlist, an artist's music
// videos, or the whole-catalog Play All — TASK-374/445) is NEITHER of the
// above: it is SERVER-AUTHORITATIVE too, on its OWN engine + channel
// (FEAT-418, TASK-419/420) — the owner explicitly ruled out routing it
// through the video engine above or the music engine, so it got a third,
// dedicated one rather than reusing either. BUG-485 retired the earlier
// client-owned `seq` playthrough (core/music-video-playthrough.js,
// TASK-374/407) that used to drive this directly: every mv* function below
// instead fires a `/api/music-video-playback` action and renders from the
// `music_video_playback` snapshot the backend pushes (core/
// music-video-playback-router.js turns it into the view-model), the exact
// same play-source/next/previous/toggle-* shape the series/film engine above
// already uses — so the Queue View's own row controls, the TV's on-screen
// transport, and the companion's Plane-B POSTs all drive the SAME state and
// can never disagree about what is actually playing.
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
  var from     = [getParam('from')].filter(Boolean).concat(['browse'])[0];
  var profile  = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var person   = getPerson();
  var isSeries = !!seriesId;
  var mode = entryMode({ playQueue: !!getParam('playQueue'), mvPlaylist: mvPlaylist, mvArtist: mvArtist, mvItem: mvItem, mvAll: mvAll, homeMoviesAll: homeMoviesAll, homeMoviesPerson: homeMoviesPerson, isSeries: isSeries });
  var MV_MODE = { mvItem: true, mvPlaylist: true, mvArtist: true, mvAll: true };
  var isMusicVideo = !!MV_MODE[mode];
  var wsApp = null;
  var player;
  var queue;
  var snapshot = null;     // latest video_playback snapshot (series mode only)
  var loadedId = null;     // which item id is currently loaded in <video>
  var currentTitle = '';   // current item's title (for the breadcrumb leaf)
  var seriesTitle = null;  // cached series title for the middle crumb
  var mvSnapshot = {};     // latest music_video_playback snapshot (music-video mode only)
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
  function ensureSeriesTitle() {
    loadSeries(SERVER, seriesId)
      .then(function(s) { seriesTitle = s.title; mountCrumbs(); })
      .catch(function() {});
  }

  // ── server `video_playback` snapshot -> UI (series, the source of truth) ─────
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
    'true':  function() { loadMusicVideoPlayback(SERVER, person).then(applyMvSnapshot).catch(function() {}); },
    'false': function() { loadVideoPlayback(SERVER, person).then(applySnapshot).catch(function() {}); }
  };
  function resyncOnActivate() { RESYNC_ON_ACTIVATE[isMusicVideo + ''](); }

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
    snapshot = snap;
    player.setSeriesMode(seriesMode(snap));
    queue.applySnapshot(snap);
    [snap.now_playing].filter(Boolean).forEach(renderNowPlaying);
  }

  // Auto-advance at true 100% end: the next item -> a 5s "Up next" countdown then
  // fire `next`; no next -> stop back to origin. ALL video is engine-driven now
  // (FEAT-040/TASK-251 — a standalone film plays via play-video), so `next` is the
  // override-queue front when one is queued (a film queued after a film plays
  // next), else the source walk (series wrap under repeat), else nothing.
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
  // same as startSeries/startHomeMoviesAll need no follow-up action either.
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
    mvSnapshot = snap;
    mvApplyMulti(mvRouter.isMulti(snap));
    mvSetTransportOn(snap);
    queue.applySnapshot(snap);
    [snap.now_playing].filter(Boolean).forEach(renderMvNowPlaying);
    sendVideoContext();
  }

  // The music-video context push (also fired on every new video load, below) —
  // reflects the live engine snapshot so the companion's title/up-next/pills
  // never lag behind what the Queue View or the TV's own buttons just did.
  function sendVideoContext() {
    [wsApp].filter(Boolean).forEach(function(ws) {
      ws.sendContext({
        context_id: 'video',
        display: player.currentVideoDisplay(),
        musicVideo: isMusicVideo,
        musicVideoMulti: mvRouter.isMulti(mvSnapshot),
        musicVideoShuffle: !!mvSnapshot.shuffle,
        musicVideoRepeat: !!mvSnapshot.repeat,
        musicVideoSource: mvSourceCrumb
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

  // Music-video mode never fires the video-playback engine (next/prev/end all
  // resolve against its OWN engine instead, above) — the owner ruled out
  // routing a music video through this one (TASK-374).
  var ON_ENDED = { 'true': mvEnded, 'false': advanceAuto };
  var ON_NEXT  = { 'true': function() { sendMvAction('next', {}); }, 'false': function() { sendAction('next', {}); } };
  var ON_PREV  = { 'true': function() { sendMvAction('previous', {}); }, 'false': function() { sendAction('previous', {}); } };

  player = setupPlayer({
    video: document.getElementById('video'),
    server: SERVER,
    onStop: function() {
      // TASK-486 (revision): Stop from a Play All list entry (the list's own
      // Play All button or a tapped row) returns to that SAME scoped list,
      // mirroring `detail` returning to its series — never a bare browse drop.
      var STOP_NAV = {
        detail: function() { navTo('detail.html', { series: seriesId }); },
        'home-movies-list': function() { navTo('home-movies-list.html', { homeMoviesAll: homeMoviesAll, homeMoviesPerson: homeMoviesPerson }); },
        browse: function() { navTo('browse.html'); }
      };
      [STOP_NAV[from]].filter(Boolean).concat([function() { navTo('browse.html'); }])[0]();
    },
    onEnded: ON_ENDED[isMusicVideo + ''],
    onNext:  ON_NEXT[isMusicVideo + ''],
    onPrev:  ON_PREV[isMusicVideo + ''],
    // Full app_state snapshot to the companion (FEAT-017): static context here,
    // live position/playing/captions added by the player. The music-video flag
    // rides the CONTEXT push below, not this one — that is what the companion
    // mirror reads to stop trusting the video-playback engine snapshot.
    emitState: function(snap) { [wsApp].filter(Boolean).forEach(function(ws) { ws.sendAppState(snap); }); },
    appContext: function() {
      return { screen: 'player', itemId: [seriesId].filter(Boolean).concat([loadedId, videoId]).filter(Boolean)[0], episodeId: [loadedId].filter(Boolean).concat([videoId])[0], profile: profile };
    },
    onIntent: function(intent) {
      var VIDEO_CTX = { play: true, video: true };
      [VIDEO_CTX[intent]].filter(Boolean).forEach(sendVideoContext);
    }
  });

  // FEAT-040 (TASK-250) / FEAT-418 (TASK-420): the Queue View overlay hangs off
  // the player, sharing the SAME #queue-overlay/#queue-body/#queue-crumb DOM and
  // #btn-queue trigger for both modes (isMusicVideo is fixed for the whole page
  // load, so exactly one controller is ever live). While open it owns the d-pad
  // (its own grid nav + Back to close); closed, keys drive the transport as
  // before. Each row control fires an action against the mode's OWN engine — the
  // server broadcasts the new snapshot, which repaints the overlay (no local math).
  var SETUP_QUEUE = { 'true': setupMusicVideoQueue, 'false': setupVideoQueue };
  var SEND_QUEUE_ACTION = { 'true': sendMvAction, 'false': sendAction };
  queue = SETUP_QUEUE[isMusicVideo + '']({
    root: document.getElementById('queue-overlay'),
    body: document.getElementById('queue-body'),
    crumb: document.getElementById('queue-crumb'),
    onAction: function(action, body) { SEND_QUEUE_ACTION[isMusicVideo + ''](action, body); },
    onClose: function() { document.getElementById('btn-queue').focus(); }
  });
  document.getElementById('btn-queue').addEventListener('click', function() { queue.open(); });
  document.getElementById('btn-add-playlist').addEventListener('click', openAddSheet);
  document.getElementById('btn-add-create').addEventListener('click', createNewPlaylist);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);
  document.getElementById('btn-add-create').addEventListener('keydown', onAddKey);
  document.getElementById('btn-add-cancel').addEventListener('keydown', onAddKey);
  document.getElementById('btn-mv-shuffle').addEventListener('click', mvToggleShuffle);
  document.getElementById('btn-mv-repeat').addEventListener('click', mvToggleRepeat);

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
  wsApp = connectApp(window.location.origin, appIntent, {
    onVideoPlayback: applySnapshot,
    onMusicVideoPlayback: applyMvSnapshot,
    onPersonActive: resyncOnActivate
  });

  document.addEventListener('keydown', dispatchKey);

  // ── entry: series fires play-source (server then drives swaps); a standalone
  // film loads directly. initCaptions seeds the global captions cache before the
  // first playVideo reads it (FEAT-023); it never rejects.
  function startSeries() {
    mountCrumbs();
    ensureSeriesTitle();
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { sendAction('play-source', { source_type: 'series', source_id: seriesId, item_id: videoId }); })
      .catch(function() {});
  }
  // A standalone film now plays THROUGH the engine too (FEAT-040/TASK-251): fire
  // play-video and render from the `video_playback` snapshot exactly like a series,
  // so the companion + Queue View always reflect the real now-playing (previously a
  // film loaded direct/off-engine and the companion showed the stale source). The
  // snapshot's now_playing is the film (resolved current_video_id); swapVideo loads
  // it + resumes from watch_progress. The durable queue plays after it.
  function startSingle() {
    mountCrumbs();
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { sendAction('play-video', { video_id: videoId }); })
      .catch(function() {});
  }
  // TASK-446 — Home Movies Play All: SERVER-authoritative like startSeries
  // above (the video engine's own `home-movies-all` source), not the
  // client-owned mv* path below — isMusicVideo is false for this mode, so
  // breadcrumbs/resync/snapshot-render/series-transport all fall through to
  // the exact same code series already exercises, for free. No series id to
  // fetch a title for (mirrors startSingle, not startSeries). ONE entry point,
  // always unshuffled — shuffle is a live Queue View toggle (owner
  // correction), not a param here, matching every other media source.
  // `item_id: videoId` mirrors startSeries above (a row tapped in the list
  // screen carries `video`, same as an episode row); no tapped row (the
  // list's own header Play All button) leaves videoId falsy, so play-source
  // starts at its own fresh index 0 — the engine already no-ops a falsy
  // item_id (play-source's `if item_id:` guard), same as startSeries relies on.
  function startHomeMoviesAll() {
    mountCrumbs();
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { sendAction('play-source', { source_type: 'home-movies-all', item_id: videoId }); })
      .catch(function() {});
  }
  // TASK-486 (revision) — a Play All rail kid tile: SERVER-authoritative
  // exactly like startHomeMoviesAll above, the video engine's own
  // `home-movies-by-person` source, source_id the tapped tile's `people` tag
  // value, item_id the tapped list row (see startHomeMoviesAll above).
  function startHomeMoviesByPerson() {
    mountCrumbs();
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { sendAction('play-source', { source_type: 'home-movies-by-person', source_id: homeMoviesPerson, item_id: videoId }); })
      .catch(function() {});
  }
  // FEAT-040 (Play Queue): entered with ?playQueue (no video/series) — fire
  // play-queue (the server pops + plays the queue head) and render from the
  // snapshot like the others. Lets you START the queue without opening a random
  // video first.
  function startQueue() {
    mountCrumbs();
    armEngineTimeout();
    initCaptions(SERVER)
      .then(function() { sendAction('play-queue', {}); })
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
    homeMoviesAll: startHomeMoviesAll,
    homeMoviesPerson: startHomeMoviesByPerson,
    series: startSeries,
    single: startSingle
  };
  ENTRY[mode]();
}
