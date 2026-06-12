import { getParam, getProfile, getPerson, navTo, initCaptions } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-video-player.js';
import { connectApp } from '../../core/app-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadVideo, loadNext, loadSeries, loadProgress } from '../../core/app-api.js';
import { isMidWatch } from '../../core/progress.js';
import { upNextParts } from '../../core/series-detail.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// Derive the backend from the page origin, NOT a hardcoded host (BUG-009): the
// media-manager serves app + API + media from one origin, but binds 0.0.0.0, so
// the app can be opened at localhost OR 0.0.0.0 OR a LAN IP. A hardcoded
// 'http://localhost:8765' then mismatches the page origin and the browser blocks
// the cross-origin <track> .vtt (subs vanish) while the .mp4 still plays. Using
// location.origin keeps media same-origin on whatever host the app loads from.
var SERVER = window.location.origin;

// Resume start: explicit restart -> 0; otherwise the backend resume position
// when the video is still mid-watch (finished/unwatched -> 0). Backend is the
// source of truth — no localStorage read.
var RESUME_BY_RESTART = {
  'true':  function() { return 0; },
  'false': function(prog) { return [prog.position_secs].filter(function(p) { return isMidWatch(p, prog.duration_secs); }).concat([0])[0]; }
};
function resumeStart(restart, prog) { return RESUME_BY_RESTART[!!restart + ''](prog); }
var VIDEO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];

export function initVideoPage() {
  var videoId  = getParam('video');
  var seriesId = getParam('series');
  var from     = [getParam('from')].filter(Boolean).concat(['browse'])[0];
  var profile  = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var wsApp = null;
  var player;

  function goTo(id) { navTo('video.html', { video: id, series: seriesId, from: from }); }

  // Breadcrumb trail (FEAT-021): a film is Home > Title; a series episode is
  // Home > Series > Episode, so the series crumb needs the series title (fetched;
  // graceful fallback to 'Series' when /api/series is unavailable). The trail's
  // leaf carries the video title, so the player needs no separate big title.
  function mountCrumbs(videoTitle, seriesTitle) {
    mountBreadcrumb('breadcrumb', buildCrumbs('video', { seriesId: seriesId, seriesTitle: seriesTitle, videoTitle: videoTitle }));
  }
  var CRUMB_BUILD = {
    'true': function(videoTitle) {
      loadSeries(SERVER, seriesId)
        .then(function(s) { mountCrumbs(videoTitle, s.title); })
        .catch(function() { mountCrumbs(videoTitle, 'Series'); });
    },
    'false': function(videoTitle) { mountCrumbs(videoTitle, null); }
  };
  function buildVideoCrumbs(videoTitle) { CRUMB_BUILD[!!seriesId + ''](videoTitle); }

  // Resolve the next episode, then act on it; no next (end of series) -> stop.
  function loadNextThen(action) {
    loadNext(SERVER, seriesId, videoId)
      .then(function(d) {
        [d.next].filter(Boolean).forEach(function(n) { action(n); });
        [!d.next].filter(Boolean).forEach(function() { player.stop(); });
      })
      .catch(function() { player.stop(); });
  }

  // Autoplay at true 100% end: within a series, 5s "Up next" countdown then
  // advance (wraps); a standalone video (or end of series) returns to origin.
  function advanceAuto() {
    [seriesId].filter(Boolean).forEach(function() { loadNextThen(function(n) { player.startUpNext(n.video.title, function() { goTo(n.video.id); }); }); });
    [!seriesId].filter(Boolean).forEach(function() { player.stop(); });
  }

  // Manual ⏭ — immediate, no countdown. Standalone has no next: no-op.
  function nextNow() {
    [seriesId].filter(Boolean).forEach(function() { loadNextThen(function(n) { goTo(n.video.id); }); });
  }

  // Manual ⏮ — previous episode in series order (wraps). Standalone: no-op.
  function previous() {
    [seriesId].filter(Boolean).forEach(function() {
      loadSeries(SERVER, seriesId)
        .then(function(s) {
          var items = [s.items].filter(Array.isArray).concat([[]])[0];
          var idx = items.map(function(it) { return it.video.id; }).indexOf(videoId);
          [items[(idx - 1 + items.length) % items.length]].filter(Boolean).filter(function() { return idx >= 0; }).forEach(function(p) { goTo(p.video.id); });
        })
        .catch(function() {});
    });
  }

  // Prime the inline up-next line: the next episode's title, or "Start again" at
  // the wrapping end of a series (upNextParts handles both). Series only — a
  // standalone film has no up-next.
  function showUpNextLine() {
    [seriesId].filter(Boolean).forEach(function() {
      loadNext(SERVER, seriesId, videoId)
        .then(function(d) { var p = upNextParts(d.next); player.setUpNext(p.prefix, p.label); })
        .catch(function() {});
    });
  }

  player = setupPlayer({
    video: document.getElementById('video'),
    server: SERVER,
    onStop: function() {
      var STOP_NAV = {
        detail: function() { navTo('detail.html', { series: seriesId }); },
        browse: function() { navTo('browse.html'); }
      };
      [STOP_NAV[from]].filter(Boolean).forEach(function(fn) { fn(); });
      [!STOP_NAV[from]].filter(Boolean).forEach(function() { navTo('browse.html'); });
    },
    onEnded: advanceAuto,
    onNext: nextNow,
    onPrev: previous,
    // Full app_state snapshot to the companion (FEAT-017): static context here,
    // live position/playing/captions added by the player.
    emitState: function(snap) { [wsApp].filter(Boolean).forEach(function(ws) { ws.sendAppState(snap); }); },
    appContext: function() {
      return { screen: 'player', itemId: [seriesId].filter(Boolean).concat([videoId])[0], episodeId: videoId, profile: profile };
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

  var keys = {};
  VIDEO_KEYS.forEach(function(k) { keys[k] = player.handleVideoKey; });
  initPage({ onEnter: function() { document.getElementById('btn-play-pause').focus(); }, keys: keys, remote: player.remote });

  // Breadcrumb crumbs on the companion send a `navigate` intent (FEAT-021);
  // everything else routes to the player's d-pad/transport remote.
  function appIntent(intent, params) {
    var EXTRA = { navigate: function() { navTo(params.page, params.params); } };
    var fn = [EXTRA[intent]].filter(Boolean).concat([player.remote[intent]]).filter(Boolean)[0];
    [fn].filter(Boolean).forEach(function(f) { f(params); });
  }
  wsApp = connectApp(wsUrl(window.location.hostname), appIntent);

  document.addEventListener('keydown', dispatchKey);

  var restart = getParam('restart');
  // initCaptions seeds the global captions cache from the backend (FEAT-023)
  // before playVideo reads it via getCaptions(); it never rejects (offline keeps
  // the default), so it cannot fail the Promise.all.
  Promise.all([
    loadVideo(SERVER, videoId),
    loadProgress(SERVER, videoId, getPerson()).catch(function() { return { position_secs: 0, duration_secs: null }; }),
    initCaptions(SERVER)
  ])
    .then(function(res) { player.playVideo(res[0], from, resumeStart(restart, res[1])); player.setSeriesMode(!!seriesId); showUpNextLine(); buildVideoCrumbs(res[0].title); })
    .catch(function() { navTo('error.html'); });
}
