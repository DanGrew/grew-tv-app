import { getParam, getProfile, getPerson, navTo, initCaptions } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-video-player.js';
import { setupVideoQueue } from './screen-video-queue.js';
import { connectApp } from '../../core/app-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadVideo, loadSeries, loadProgress, videoPlaybackAction } from '../../core/app-api.js';
import { isMidWatch } from '../../core/progress.js';
import { isSwap, upNextItem, upNextLine, seriesMode } from '../../core/video-player-router.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
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
var SERVER = window.location.origin;

var RESUME_BY_RESTART = {
  'true':  function() { return 0; },
  'false': function(prog) { return [prog.position_secs].filter(function(p) { return isMidWatch(p, prog.duration_secs); }).concat([0])[0]; }
};
function resumeStart(restart, prog) { return RESUME_BY_RESTART[!!restart + ''](prog); }
function zeroProgress() { return { position_secs: 0, duration_secs: null }; }
var VIDEO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export function initVideoPage() {
  var videoId  = getParam('video');
  var seriesId = getParam('series');
  var restart  = getParam('restart');
  var from     = [getParam('from')].filter(Boolean).concat(['browse'])[0];
  var profile  = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var person   = getPerson();
  var isSeries = !!seriesId;
  var wsApp = null;
  var player;
  var queue;
  var snapshot = null;     // latest video_playback snapshot (series mode only)
  var loadedId = null;     // which item id is currently loaded in <video>
  var currentTitle = '';   // current item's title (for the breadcrumb leaf)
  var seriesTitle = null;  // cached series title for the middle crumb

  function sendAction(action, body) { videoPlaybackAction(SERVER, action, person, body).catch(function() {}); }

  // Breadcrumb (FEAT-021): a film is Home > Title; a series episode is Home >
  // Series > Episode. The series title is fetched once (graceful 'Series'
  // fallback); the leaf carries the current item title and is rebuilt on each swap.
  function mountCrumbs() {
    mountBreadcrumb('breadcrumb', buildCrumbs('video', {
      seriesId: seriesId,
      seriesTitle: [seriesTitle].filter(Boolean).concat(['Series'])[0],
      videoTitle: currentTitle
    }));
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

  function swapVideo(np) {
    loadedId = np.item_id;
    currentTitle = np.title;
    var restartThis = [restart].filter(Boolean).filter(function() { return np.item_id === videoId; })[0];
    loadProgress(SERVER, np.item_id, person)
      .catch(zeroProgress)
      .then(function(prog) {
        player.playVideo({ id: np.item_id, title: np.title, subtitles: np.subtitles }, from, resumeStart(restartThis, prog));
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

  // Auto-advance at true 100% end (series): the next item -> a 5s "Up next"
  // countdown then fire `next` (the snapshot wraps last->first when repeat is on);
  // no next (no-repeat series end) -> stop back to origin.
  function advanceAuto() {
    var next = upNextItem(snapshot);
    ({
      'true':  function() { player.startUpNext(next.title, function() { sendAction('next', {}); }); },
      'false': function() { player.stop(); }
    })[!!next + '']();
  }

  var ON_ENDED = { 'true': advanceAuto, 'false': function() { player.stop(); } };
  var ON_NEXT  = { 'true': function() { sendAction('next', {}); },     'false': function() {} };
  var ON_PREV  = { 'true': function() { sendAction('previous', {}); }, 'false': function() {} };

  player = setupPlayer({
    video: document.getElementById('video'),
    server: SERVER,
    onStop: function() {
      var STOP_NAV = {
        detail: function() { navTo('detail.html', { series: seriesId }); },
        browse: function() { navTo('browse.html'); }
      };
      [STOP_NAV[from]].filter(Boolean).concat([function() { navTo('browse.html'); }])[0]();
    },
    onEnded: function() { ON_ENDED[isSeries + ''](); },
    onNext:  function() { ON_NEXT[isSeries + '']();  },
    onPrev:  function() { ON_PREV[isSeries + '']();  },
    // Full app_state snapshot to the companion (FEAT-017): static context here,
    // live position/playing/captions added by the player.
    emitState: function(snap) { [wsApp].filter(Boolean).forEach(function(ws) { ws.sendAppState(snap); }); },
    appContext: function() {
      return { screen: 'player', itemId: [seriesId].filter(Boolean).concat([loadedId, videoId]).filter(Boolean)[0], episodeId: [loadedId].filter(Boolean).concat([videoId])[0], profile: profile };
    },
    onIntent: function(intent) {
      var VIDEO_CTX = { play: true, video: true };
      [wsApp].filter(Boolean).forEach(function(ws) {
        [VIDEO_CTX[intent]].filter(Boolean).forEach(function() {
          ws.sendContext({ context_id: 'video', display: player.currentVideoDisplay() });
        });
      });
    }
  });

  // FEAT-040 (TASK-250): the Video Queue View overlay hangs off the player. While
  // open it owns the d-pad (its own grid nav + Back to close); closed, keys drive
  // the transport as before. Each row control fires a video-playback action — the
  // server broadcasts the new snapshot, which repaints the overlay (no local math).
  queue = setupVideoQueue({
    root: document.getElementById('queue-overlay'),
    body: document.getElementById('queue-body'),
    crumb: document.getElementById('queue-crumb'),
    onAction: function(action, body) { sendAction(action, body); },
    onClose: function() { document.getElementById('btn-queue').focus(); }
  });
  document.getElementById('btn-queue').addEventListener('click', function() { queue.open(); });

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
    var EXTRA = { navigate: function() { navTo(params.page, params.params); } };
    var fn = [EXTRA[intent]].filter(Boolean).concat([player.remote[intent]]).filter(Boolean)[0];
    [fn].filter(Boolean).forEach(function(f) { f(params); });
  }
  wsApp = connectApp(wsUrl(window.location.hostname), appIntent, { onVideoPlayback: applySnapshot });

  document.addEventListener('keydown', dispatchKey);

  // ── entry: series fires play-source (server then drives swaps); a standalone
  // film loads directly. initCaptions seeds the global captions cache before the
  // first playVideo reads it (FEAT-023); it never rejects.
  function startSeries() {
    mountCrumbs();
    ensureSeriesTitle();
    initCaptions(SERVER)
      .then(function() { sendAction('play-source', { source_type: 'series', source_id: seriesId, item_id: videoId }); })
      .catch(function() {});
  }
  function startSingle() {
    player.setSeriesMode(false);
    document.getElementById('btn-queue').classList.add('hidden');
    Promise.all([
      loadVideo(SERVER, videoId),
      loadProgress(SERVER, videoId, person).catch(zeroProgress),
      initCaptions(SERVER)
    ])
      .then(function(res) {
        loadedId = res[0].id;
        currentTitle = res[0].title;
        player.playVideo(res[0], from, resumeStart(restart, res[1]));
        mountCrumbs();
      })
      .catch(function() { navTo('error.html'); });
  }
  ({ 'true': startSeries, 'false': startSingle })[isSeries + '']();
}
