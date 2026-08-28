import { getParam, getProfile, getPerson, navTo, initCaptions } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-video-player.js';
import { setupQueueShell } from './screen-queue-shell.js';
import { transportState } from '../../core/queue-shell-view.js';
import { connectApp } from '../../core/app-ws.js';
import { loadProgress, loadPlaylist, loadBrowse, loadQueuePlayback, queuePlaybackAction, addToPlaylist } from '../../core/app-api.js';
import { isMidWatch } from '../../core/progress.js';
import { entryMode } from '../../core/music-video-playthrough.js';
// TASK-503/505: qRouter is the shared view-router for the TASK-498 unified
// queue engine's `queue_playback` snapshot — used by home movies (TASK-499,
// media_type 'home-movie'), films (TASK-503) and music videos (TASK-505), so
// it is no longer hm-specific despite the module's own file name.
import * as qRouter from '../../core/queue-playback-router.js';
// TASK-524: what this page knows about a video media type, as data.
import { VIDEO_PAGE_CONFIG, MODE_ENGINE, SOURCE_TYPE, sourceIdFor, videoContext, videoRecord } from '../../core/video-page-config.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { gridIndex } from '../../core/playlist-name.js';
import { buildCrumbs, playerCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// FEAT-037 (TASK-222) — the PERSISTENT video player document. Replaces the old
// per-episode video.html reload: the <video> element lives for the whole play
// session and media swaps in place.
//
// THREE server-authoritative rails share this page, picked once per load off
// `engineMode` (mutually exclusive, never a live switch) and never crossed —
// a rail's own actions, snapshot and Queue View stay entirely its own. All
// three run on the TASK-498 unified queue engine, one media_type apart:
//   'film'  — TASK-503/517: a SERIES/BOXSET/STANDALONE FILM, and (TASK-517)
//             the browse "Play Queue" entry too (/api/queue/film). A
//             standalone film has no source at all (play-standalone clears
//             it); a series/boxset always does.
//   'hm'    — TASK-499: home movies, its own media_type
//             (/api/queue/home-movie).
//   'mv'    — a MUSIC VIDEO (single pick, a music-video playlist, an
//             artist's music videos, or the whole-catalog Play All —
//             TASK-374/445): TASK-505 cut it over, its own media_type
//             (/api/queue/music-video), retiring the dedicated engine +
//             channel FEAT-418 gave it (TASK-419/420, BUG-485).
//
// TASK-524 — the three rails share ONE set of plumbing: one action sender, one
// snapshot apply, one swap, one entry path. Everything that genuinely differs
// between them is an entry in core/video-page-config.js, so a fix lands once
// instead of three times. Before this, each rail carried its own copy of all
// of it, and two of the copies had already drifted — see that module's own ⛔
// note for the two divergences this collapse found and preserved rather than
// silently normalised.
//
// TASK-525 removed a FOURTH rail, 'video' — the OLD video engine
// (/api/video-playback, TASK-221/251). TASK-517 had already moved its last
// mode onto the unified engine, leaving no `mode` that resolved to it; its
// Queue View (core/video-queue-view.js, ui/screens/screen-video-queue.js)
// went with it. The engine's own routes still serve the companion's legacy
// branch (ui/screens/companion-video.js).
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
function noop() {}
var VIDEO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
// BUG-439: an engine-fired action (play-source/-standalone/-queue) waits this long
// for its first queue_playback snapshot before giving up and surfacing error.html,
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
  // TASK-501 — `continueType` names the media type browse's Continue button was
  // pressed for, and resolves to that type's own continue mode, so the rail is
  // picked here exactly as every other entry picks it.
  // TASK-542 — `collectionType` rides beside `?series=` so a TV series and a
  // film boxset, which reach this page through the identical param, open under
  // their own media type rather than both under films.
  var mode = entryMode({ continueType: getParam('continueType'), playQueue: !!getParam('playQueue'), mvPlaylist: mvPlaylist, mvArtist: mvArtist, mvItem: mvItem, mvAll: mvAll, homeMoviesAll: homeMoviesAll, homeMoviesPerson: homeMoviesPerson, homeMoviesMonth: homeMoviesMonth, isSeries: isSeries, collectionType: getParam('collectionType') });
  // Which rail this page load drives — resolved once off `mode` (mutually
  // exclusive per page load, never a live switch), and `config` is everything
  // that rail does differently from the other two. Between them they key every
  // dispatch table below, so none of them need a musicVideo/homeMovie/film
  // branch of their own.
  var engineMode = MODE_ENGINE[mode];
  var config = VIDEO_PAGE_CONFIG[engineMode];
  // The source id lives in a different nav param per mode; the mapping is data
  // (core/video-page-config.js), so an entry reads it rather than each source
  // entry point keeping its own two-table pair.
  var sourceParams = { mvPlaylist: mvPlaylist, mvArtist: mvArtist, homeMoviesPerson: homeMoviesPerson, homeMoviesMonth: homeMoviesMonth, seriesId: seriesId };
  var wsApp = null;
  var player;
  var queue;
  var loadedId = null;     // which item id is currently loaded in <video>
  var currentTitle = '';   // current item's title (for the breadcrumb leaf)
  // The ACTIVE SOURCE's display name — a series/boxset title in film mode
  // (also the top crumb), a playlist/artist/Play-All label in mv mode
  // (TASK-505). Both feed the Queue shell hero's source line the same way;
  // sourceKey below says which source it was fetched for.
  var sourceTitle = null;
  var loadedSourceKey = null;
  // The latest queue_playback snapshot for THIS rail — one var where three sat
  // side by side, two of them permanently {} (TASK-524).
  var snapshot = {};
  // BUG-521/522: the item this page was opened for, until a snapshot confirms
  // it. Only read by a rail whose config sets `staleGuard`.
  var pendingId = null;
  var enginePending = null;  // ENGINE_TIMEOUT_MS watchdog, armed per engine action, cleared on first swap
  // TASK-422: the music-video playback source's own crumb — { label, page, params }
  // linking to its playlist/artist page, mirroring BUG-044's audio sourceCrumb.
  // Built once per entry (startMvPlaylist/startMvArtist, before the entry's own
  // send), never per-swap; stays null for a standalone mvItem pick (no source
  // page, story 4).
  var mvSourceCrumb = null;

  // TASK-524 — THE action sender, for whichever media type this page load is
  // driving (/api/queue/{media_type}), replacing sendMvAction/sendHmAction/
  // sendFmAction. A function EXPRESSION, not a declaration — same reason
  // screen-audio-page's own sendAction is one: it is an IO call (no DOM token,
  // returns a value), which the no-pure-fn-outside-core arch check would
  // otherwise flag as "move to core/", but it closes over SERVER/person and
  // only fans out a request, so it belongs here.
  var send = function(action, body) { return queuePlaybackAction(SERVER, config.mediaType, action, person, body).catch(noop); };

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
    mountBreadcrumb('breadcrumb', CRUMBS_FOR[config.sourceCrumbs + '']());
  }
  // TASK-503/505 — sourceTitle also feeds the Queue shell hero's source line;
  // a re-render past the overlay's first paint picks up a title that resolves
  // after that paint (screen-queue-shell.js's own getSourceTitle() reads this
  // same var live, but only on ITS next render — this nudges one the moment
  // the fetch lands). Only a rail whose source name arrives ASYNCHRONOUSLY
  // needs the nudge: home movies derive theirs from the snapshot's own slugs.
  var REFRESH_TITLE = { 'true': function() { queue.refreshSourceTitle(); }, 'false': noop };
  function refreshQueueSourceTitle() {
    REFRESH_TITLE[config.fetchesSourceTitle + '']();
  }
  function applySourceTitle(snap) {
    config.sourceTitle(SERVER, snap)
      .then(function(title) { sourceTitle = title; mountCrumbs(); refreshQueueSourceTitle(); })
      .catch(noop);
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
  // TASK-505 — qRouter.sourceKey is source_type AND source_id, not the id
  // alone: the whole-catalog Play All ('mv-all') is a real source carrying no
  // id, which an id-only key could not tell apart from having no source.
  function ensureSourceTitle(snap) {
    var key = qRouter.sourceKey(snap);
    [key !== loadedSourceKey].filter(Boolean).forEach(function() {
      loadedSourceKey = key;
      sourceTitle = null;
      [key].filter(Boolean).forEach(function() { applySourceTitle(snap); });
    });
  }
  // Home movies name their own source off the snapshot's slugs, so they never
  // fetch one (core/queue-shell-config.js's homeMovieSource).
  var ENSURE_TITLE = { 'true': ensureSourceTitle, 'false': noop };
  // An entry that has ALREADY fetched its source's name records it here rather
  // than letting the first snapshot fetch the same record again (a music-video
  // playlist reads its own title for the breadcrumb, TASK-422). The snapshot
  // still has the last word: if the engine resolves a DIFFERENT source than
  // this entry named, the key won't match and ensureSourceTitle refetches.
  function primeSourceTitle(sourceType, sourceId, title) {
    loadedSourceKey = qRouter.sourceKey({ source_type: sourceType, source_id: sourceId });
    sourceTitle = title;
  }

  // BUG-439: the watchdog for a fired engine action — armed right before the
  // action send that can silently no-op server-side, cleared the moment a real
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

  // ── the ONE queue rail (TASK-524), server-authoritative over the TASK-498
  // unified queue engine's own `queue_playback` snapshot
  // (core/queue-playback-router.js, aliased qRouter). Everything below runs
  // for whichever media type this page load drives; `config` says what that
  // type does differently.
  function renderUpNextLine() {
    [qRouter.upNextLine(snapshot)].filter(Boolean).forEach(function(l) { player.setUpNext(l.prefix, l.label); });
  }
  // A film or home movie resumes mid-watch from watch_progress; a music video
  // always starts at 0 and never asks (TASK-373 — the player "assumes resume",
  // and this deliberately never lets it).
  function playFromZero(np) {
    player.playVideo(videoRecord(np), from, 0);
    renderUpNextLine();
    mountCrumbs();
  }
  function resumeThenPlay(np) {
    var restartThis = [restart].filter(Boolean).filter(function() { return np.item_id === videoId; })[0];
    loadProgress(SERVER, np.item_id, person)
      .catch(zeroProgress)
      .then(function(prog) {
        player.playVideo(videoRecord(np), from, resumeStart(restartThis, prog));
        renderUpNextLine();
        mountCrumbs();
      });
  }
  var START_AT = { 'true': resumeThenPlay, 'false': playFromZero };
  function swapMedia(np) {
    clearEngineTimeout();
    loadedId = np.item_id;
    currentTitle = np.title;
    START_AT[config.resumes + ''](np);
  }
  // Auto-advance at true 100% end. A film runs the 5s "Up next" countdown it
  // has always had; a home movie or music video is a short clip where that
  // reads as a gap, so it advances directly, like a song
  // (TASK-487, docs/QUEUE.md rows 29/33). Nothing ahead -> stop back to origin.
  function advanceDirect() {
    ({ 'true': function() { send('next', {}); }, 'false': function() { player.stop(); } })[!!qRouter.upNextItem(snapshot) + '']();
  }
  function advanceWithCountdown() {
    var next = qRouter.upNextItem(snapshot);
    ({
      'true':  function() { player.startUpNext(next.title, function() { send('next', {}); }); },
      'false': function() { player.stop(); }
    })[!!next + '']();
  }
  var ON_ENDED = { 'true': advanceWithCountdown, 'false': advanceDirect };

  function toggleShuffle() { send('toggle-shuffle', {}); }
  function toggleRepeat() { send('toggle-repeat', {}); }

  // THE transport rule at the player screen's own control row — ONE rule with
  // the Queue hero (core/queue-shell-view.js transportState), which is the
  // whole of BUG-510/512: both sites gated on `source_type` alone, so ⏭ read
  // dead on a standalone film even with a film queued behind it, while the
  // engine's own advance() would happily have played it. Every control stays
  // VISIBLE and dims when it has nothing to act on, never hidden
  // (QUEUE-UX-SHELL.md's Hero section; TASK-493 row 21).
  function setControlOn(id, on, enabled) {
    var btn = document.getElementById(id);
    btn.classList.remove('hidden');
    btn.classList.toggle('on', on);
    btn.classList.toggle('is-disabled', !enabled);
    btn.disabled = !enabled;
  }
  //
  // TASK-524 — ALL THREE rails now, where home movies were the exception: they
  // un-hid Shuffle/Repeat and showed ⏮/⏭ live at all times, so nothing on their
  // player row ever dimmed even as their own Queue hero dimmed it, and ⏭ read
  // live at the end of a list with nothing behind it. One rule, one place, all
  // four surfaces (TV row, TV hero, companion row, companion hero) agreeing.
  function applyTransport(snap) {
    var t = transportState(snap);
    setControlOn(config.shuffleId, !!snap.shuffle, t.shuffle);
    setControlOn(config.repeatId, !!snap.repeat, t.repeat);
    setControlOn('btn-prev', false, t.previous);
    setControlOn('btn-next', false, t.next);
  }

  // The Queue shell AND the actual <video> element render off the SAME
  // snapshot — repaint the overlay, then swap media only when the now-playing
  // item actually changed (isSwap).
  var SWAP = { 'true': swapMedia, 'false': renderUpNextLine };
  function renderNowPlaying(np) { SWAP[qRouter.isSwap(loadedId, snapshot) + ''](np); }
  function applySnapshot(snap) {
    snapshot = snap;
    applyTransport(snap);
    ENSURE_TITLE[config.fetchesSourceTitle + ''](snap);
    queue.applySnapshot(snap);
    [snap.now_playing].filter(Boolean).forEach(renderNowPlaying);
    sendVideoContext();
  }
  // BUG-521/522 — the entry-time recovery GET is a fallback, never an
  // override: discard an answer that predates this page's own play POST, or
  // the player swaps back to the previously selected item. A WS push needs no
  // such guard — it is always the server's current state. armEngineTimeout
  // still covers a pick that never arrives at all, so discarding here can't
  // leave the page inert forever.
  //
  // TASK-524 — every rail, closing BUG-522-STALE-RESYNC-REMAINING-TYPES: films
  // (BUG-521) and music videos (BUG-505) each got this guard as their own copy
  // and home movies never did, so a tapped clip could still be dragged back to
  // whichever clip played last. One plumbing means one guard.
  function guardedResync(snap) {
    [!qRouter.isStaleResync(pendingId, loadedId, snap)].filter(Boolean).forEach(function() { applySnapshot(snap); });
  }
  // BUG-439: the play-source/-standalone/-queue POST can land before the WS
  // activate_person handshake finishes binding this device server-side, so its
  // snapshot broadcast is silently dropped (the server already applied the
  // action — only the push was lost). Once activate_person is confirmed, pull
  // the current snapshot directly and apply it — a no-op if the push already
  // landed (isSwap sees the same item_id), the fix if it didn't.
  function resyncOnActivate() {
    loadQueuePlayback(SERVER, config.mediaType, person)
      .then(guardedResync)
      .catch(noop);
  }

  // The companion context push (also fired on every new video load, below) —
  // reflects the live engine snapshot so the companion's title/up-next/pills
  // never lag behind what the Queue View or the TV's own buttons just did.
  // TASK-517/505 — the phone's controls read the SAME transportState the TV
  // row and the Queue hero do, pushed as resolved booleans rather than a raw
  // flag it re-derives a rule from (which is how BUG-512 left the two surfaces
  // disagreeing).
  function sendVideoContext() {
    [wsApp].filter(Boolean).forEach(function(ws) {
      ws.sendContext(videoContext(engineMode, snapshot, mvSourceCrumb, player.currentVideoDisplay()));
    });
  }

  // TASK-378 — "Add to playlist" for the CURRENTLY PLAYING music video (works from
  // any mv entry mode — a lone pick, inside a music-video playlist, or an artist's
  // videos — nowPlayingId() is always the one on screen). Music-video-only: the
  // button stays hidden (CSS) for a series/film, and only an mv entry reveals it
  // (config.addsToPlaylist). One sheet, no queue option (that is the
  // album-detail per-track sheet's own thing) — just the profile's music-video
  // playlists + New playlist, mirroring screen-album-detail-page's openAddSheet
  // almost verbatim so the two stay in lock-step.
  //
  // Add to playlist always targets the CURRENTLY PLAYING video, read off the
  // live snapshot rather than a locally-tracked id.
  function nowPlayingId() { return [qRouter.nowPlaying(snapshot)].filter(Boolean).concat([{}])[0].item_id; }
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
    addToPlaylist(SERVER, id, nowPlayingId())
      .then(function() { closeAddSheet(); showAddStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showAddStatus('Could not add to playlist.'); });
  }
  function createNewPlaylist() {
    navTo('playlist-create.html', { addTrack: nowPlayingId(), collectionType: 'music-video-playlist' });
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
  function revealAddPlaylist() { document.getElementById('btn-add-playlist').classList.remove('hidden'); }
  var REVEAL_ADD = { 'true': revealAddPlaylist, 'false': noop };

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
    onEnded: ON_ENDED[config.countdown + ''],
    onNext:  function() { send('next', {}); },
    onPrev:  function() { send('previous', {}); },
    // Full app_state snapshot to the companion (FEAT-017): static context here,
    // live position/playing/captions added by the player. The per-media-type
    // flags ride the CONTEXT push above, not this one.
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
  // both read this page's own lookup. TASK-525 took the unreachable 'video'
  // mode's own controller with the old engines, so the shell is now the ONLY
  // Queue View this page mounts — and TASK-524 the three-entry table that
  // pointed every rail at it.
  queue = setupQueueShell({
    root: document.getElementById('queue-overlay'),
    body: document.getElementById('queue-body'),
    crumb: document.getElementById('queue-crumb'),
    onAction: function(action, body) { send(action, body); },
    onToggle: function() { player.remote.toggle(); },
    onClose: function() { document.getElementById('btn-queue').focus(); },
    getSourceTitle: function() { return sourceTitle; },
    media: config.shell
  });
  document.getElementById('btn-queue').addEventListener('click', function() { queue.open(); });
  document.getElementById('btn-add-playlist').addEventListener('click', openAddSheet);
  document.getElementById('btn-add-create').addEventListener('click', createNewPlaylist);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);
  document.getElementById('btn-add-create').addEventListener('keydown', onAddKey);
  document.getElementById('btn-add-cancel').addEventListener('keydown', onAddKey);
  // video.html carries a Shuffle/Repeat pair per rail and unhides exactly one;
  // only the live rail's pair is wired, where all three pairs used to be.
  document.getElementById(config.shuffleId).addEventListener('click', toggleShuffle);
  document.getElementById(config.repeatId).addEventListener('click', toggleRepeat);

  var KEY_TARGET = {
    'true':  function(e) { queue.handleKey(e); },
    'false': function(e) { player.handleVideoKey(e); }
  };
  function onVideoKey(e) { KEY_TARGET[queue.isOpen() + ''](e); }
  var keys = {};
  VIDEO_KEYS.forEach(function(k) { keys[k] = onVideoKey; });
  initPage({ onEnter: function() { document.getElementById('btn-play-pause').focus(); }, keys: keys, remote: player.remote });

  // Breadcrumb crumbs on the companion send a `navigate` intent (FEAT-021);
  // everything else routes to the player's d-pad/transport remote. The two
  // toggles act on whichever rail this page drives — they were wired to the
  // music-video sender alone until TASK-524, which would have crossed engines
  // had anything ever sent the intent.
  function appIntent(intent, params) {
    var EXTRA = { navigate: function() { navTo(params.page, params.params); }, toggleShuffle: toggleShuffle, toggleRepeat: toggleRepeat };
    var fn = [EXTRA[intent]].filter(Boolean).concat([player.remote[intent]]).filter(Boolean)[0];
    [fn].filter(Boolean).forEach(function(f) { f(params); });
  }
  // TASK-499/503/505: a person may hold live queue state in more than one
  // media type at once (the WS relay tags every push with `media_type`) —
  // this page only ever drives ONE of them per load, so it filters to its own,
  // and a stray push from another type can't hijack the live player.
  function applyQueuePlayback(payload) {
    [payload.media_type === config.mediaType].filter(Boolean).forEach(function() { applySnapshot(payload); });
  }
  wsApp = connectApp(window.location.origin, appIntent, {
    onQueuePlayback: applyQueuePlayback,
    onPersonActive: resyncOnActivate
  });

  document.addEventListener('keydown', dispatchKey);

  // ── entry ────────────────────────────────────────────────────────────────
  // TASK-524 — every entry below fires through ONE begin: arm the BUG-439
  // watchdog, record the BUG-521/522 pending pick, seed the global captions
  // cache (FEAT-023 — it never rejects) and send. What differs per entry is
  // only WHICH action and body, which is the point of the collapse.
  //
  // A function EXPRESSION for the same reason `send` is one: it returns a
  // value (the chain each entry appends its own tail to) and touches no DOM.
  var beginPlayback = function(pendingItemId, action, body) {
    pendingId = pendingItemId;
    REVEAL_ADD[config.addsToPlaylist + '']();
    armEngineTimeout();
    return initCaptions(SERVER).then(function() { return send(action, body); });
  };
  // A SOURCE entry — a series/boxset, a music-video playlist/artist, a
  // home-movie person/month/Play All, the whole music-video catalog.
  //
  // ⛔ TWO actions whenever a tapped item is named, because the engine's
  // play-source ALWAYS starts a source at its own first entry:
  // api/queue_playback.py reads `source_type` and `source_id` off the body and
  // passes neither an item nor a follow-up to engine.play_source, which sets
  // current_item_id from current[0]. Landing on the tapped row therefore takes
  // a play-item behind it. Home movies always sent that pair; films and music
  // videos each sent ONE play-source carrying an `item_id` the server silently
  // dropped, so a mid-series tap played episode 1 and a tapped playlist track
  // played the playlist's first video (TASK-524 — the app's own e2e fixture
  // honoured that field and hid it). `startId` absent — an artist rail, a Play
  // All, an untapped list — stays one action: the source's own first entry is
  // exactly what should play.
  //
  // No shuffle/repeat flags either — the engine reads this person's remembered
  // per-source preference (TASK-498), which is what makes an artist or playlist
  // start in source order and remember a later Shuffle (story 5).
  function playTapped(startId) {
    [startId].filter(Boolean).forEach(function(id) { send('play-item', { item_id: id }); });
  }
  function startSource(startId) {
    beginPlayback(startId, 'play-source', { source_type: SOURCE_TYPE[mode], source_id: sourceIdFor(mode, sourceParams) })
      .then(function() { playTapped(startId); })
      .catch(noop);
  }
  // A STANDALONE entry — a single film, or a LONE music-video pick, which is
  // the one mv entry with no source at all: play-standalone, the same action a
  // standalone film uses, rather than a source of exactly one. That is what
  // leaves its ⏮/⏭/Shuffle/Repeat dimmed-but-visible (story 4) instead of
  // offering controls with nothing to act on, and why the engine's registered
  // 'mv-item' source goes unused from here. The snapshot's now_playing is the
  // item itself (no source); the swap loads it and, for a film, resumes from
  // watch_progress. The durable queue plays after it.
  function startStandalone(itemId) {
    beginPlayback(itemId, 'play-standalone', { item_id: itemId }).catch(noop);
  }
  // TASK-524 — a tapped SERIES EPISODE and a tapped HOME-MOVIE CLIP are the
  // same entry: open a scoped list, tap a row, play that row inside its source.
  // They were two functions that had drifted into two different entry shapes;
  // what actually separates them is one bit already in the config — a series
  // fetches its source's name (the top crumb needs it before any snapshot
  // lands), while home movies derive theirs from the snapshot's own slugs, so
  // ENSURE_TITLE is the same no-op here that it is on every snapshot.
  function startTappedSource() {
    mountCrumbs();
    ENSURE_TITLE[config.fetchesSourceTitle + '']({ source_type: SOURCE_TYPE[mode], source_id: sourceIdFor(mode, sourceParams) });
    startSource(videoId);
  }
  function startSingle() {
    mountCrumbs();
    startStandalone(videoId);
  }
  // FEAT-040 (Play Queue): entered with ?playQueue (no video/series) — fire
  // play-queue (the server makes the queue head current, without consuming
  // it) and render from the snapshot like the others. Lets you START the
  // queue without opening a random video first. TASK-517: on the UNIFIED
  // engine now (/api/queue/film), the same rail every other film route uses —
  // so the queue this plays is the one every ＋Queue press has been filling
  // since TASK-503, and the Queue it opens is the shell, not the pre-FEAT-497
  // screen this route showed until now. No pending pick of its own: the
  // engine picks the item, we did not.
  function startQueue() {
    mountCrumbs();
    beginPlayback(null, 'play-queue', {}).catch(noop);
  }
  // TASK-422: the mv source crumb's own { label, page, params } targets, one per
  // entry mode with a source page — mirrors companion-audio.js's SOURCE_CRUMB.
  // mvItem has no entry (a lone pick has no source page, story 4).
  var MV_SOURCE_CRUMB = {
    mvPlaylist: function(title) { return { label: title, page: 'playlist-detail.html', params: { playlist: mvPlaylist } }; },
    mvArtist:   function() { return { label: mvArtist, page: 'artist.html', params: { artist: mvArtist } }; }
  };
  function startMvPlaylist() {
    loadPlaylist(SERVER, mvPlaylist)
      .then(function(pl) {
        mvSourceCrumb = MV_SOURCE_CRUMB.mvPlaylist(pl.title);
        primeSourceTitle(SOURCE_TYPE.mvPlaylist, mvPlaylist, pl.title);
        // TASK-376/377: reached from the playlist's own detail screen, tapping
        // a specific track — the playthrough starts there, same as an audio
        // playlist starts from the tapped track, then carries on in order. No
        // tapped track ⇒ play-source with no item_id, and the playlist's own
        // first item plays.
        startSource(mvTrack);
      })
      .catch(function() { navTo('error.html'); });
  }
  function startMvArtist() {
    mvSourceCrumb = MV_SOURCE_CRUMB.mvArtist();
    startSource();
  }
  // TASK-445 — Play All: every music video in the catalog, no source page to
  // link back to (mvSourceCrumb stays null, degrading to Home > leaf like
  // mvItem — story 4 has no equivalent here since there is no single item).
  function startMvAll() {
    startSource();
  }
  function startMvItem() {
    startStandalone(mvItem);
  }
  // TASK-501 — Continue, from browse's play menu. The entry fires the engine's
  // own advance (`next`) and renders from the snapshot like every other route:
  // the queue's front if anything is queued, else the next item of the source
  // this person was last playing. That fallback is the ENGINE's, never
  // reproduced here — the same rule transportState's ⏭ already lights from, and
  // what browse's own button reads to decide whether it is live at all.
  //
  // ONE entry for all four video types, because TASK-524 already made every
  // per-rail difference a config field: which engine it advances is
  // config.mediaType, and the ＋Playlist reveal a music video needs is
  // config.addsToPlaylist inside beginPlayback.
  //
  // No source POST (the engine keeps the one it has — carrying on with it is
  // the point) and no item pick, so BUG-521's pending-id guard has nothing to
  // name, exactly like startQueue.
  function startContinue() {
    mountCrumbs();
    beginPlayback(null, 'next', {}).catch(noop);
  }
  var ENTRY = {
    continueSeries: startContinue,
    continueFilm: startContinue,
    continueHomeMovie: startContinue,
    continueMusicVideo: startContinue,
    queue: startQueue,
    mvPlaylist: startMvPlaylist,
    mvArtist: startMvArtist,
    mvItem: startMvItem,
    mvAll: startMvAll,
    homeMoviesAll: startTappedSource,
    homeMoviesPerson: startTappedSource,
    homeMoviesMonth: startTappedSource,
    series: startTappedSource,
    boxset: startTappedSource,
    single: startSingle
  };
  ENTRY[mode]();
}
