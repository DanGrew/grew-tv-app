import { fmt } from '../../core/time.js';
import { EVENTS, SOURCES, createEvent } from '../../core/telemetry-schema.js';
import { mediaUrl, saveProgress } from '../../core/app-api.js';
import { createHeartbeat } from '../../core/ws-protocol.js';
import { getCaptions, setCaptions, getPerson } from '../../core/state.js';

// Graduated relative skips (FEAT-017): ±10s / 30s / 2m / 10m / 30m. The Jump
// popup is a 5-column grid: back row then forward row. No absolute seek / scrub.
var JUMP_DELTAS  = [-10, -30, -120, -600, -1800, 10, 30, 120, 600, 1800];
var JUMP_LABELS  = ['-10s', '-30s', '-2m', '-10m', '-30m', '+10s', '+30s', '+2m', '+10m', '+30m'];
var JUMP_COLS    = 5;
var JUMP_DEFAULT = 5;            // +10s, the most common forward skip
var QUICK_SKIP   = 10;           // TV d-pad left/right one-press skip
var UPNEXT_SECS  = 5;            // autoplay "Up next" countdown
var BACKEND_SAVE_MS = 5000;

// Transport focus order; CC is skipped while hidden (no .vtt for this video).
var FOCUS_ORDER  = ['btn-prev', 'btn-play-pause', 'btn-next', 'btn-jump', 'btn-cc'];
var TOGGLE_INTENT = { 'true': 'play', 'false': 'pause' };
var CC_MODE       = { 'true': 'showing', 'false': 'hidden' };

export function setup(config) {
  var video    = config.video;
  var server   = config.server;
  var onStop   = config.onStop;
  var onEnded  = [config.onEnded ].filter(Boolean).concat([function() { stopPlayback(); }])[0];
  var onNext   = [config.onNext  ].filter(Boolean).concat([function() {}])[0];
  var onPrev   = [config.onPrev  ].filter(Boolean).concat([function() {}])[0];
  var onIntent = [config.onIntent].filter(Boolean).concat([function() {}])[0];
  var emitSnapshot = [config.emitState ].filter(Boolean).concat([function() {}])[0];
  var appContext   = [config.appContext].filter(Boolean).concat([function() { return {}; }])[0];

  var wakeLock          = null;
  var controlsTimer     = null;
  var currentBlobUrl    = null;
  var currentVideo      = null;
  var returnPage        = null;
  var lastBackendSave   = 0;
  var lastDroppedFrames = 0;
  var jumpPopup         = null;
  var upnextTimer       = null;
  var upnextRemaining   = 0;
  var captionsOn        = false;
  var _currentDisplay   = {};

  var VIDEO_TOGGLE = {
    'true':  function() { video.play().catch(function() {}); },
    'false': function() { video.pause(); }
  };

  function sendTelemetry(event, source, opts) {
    fetch('/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createEvent(event, source, opts))
    }).catch(function() {});
  }

  function checkQuality() {
    var q = video.getVideoPlaybackQuality();
    var dropped = q.droppedVideoFrames - lastDroppedFrames;
    lastDroppedFrames = q.droppedVideoFrames;
    [dropped].filter(Boolean).forEach(function() {
      sendTelemetry(EVENTS.FRAME_DROPPED, SOURCES.TV, { meta: { droppedFrames: dropped, perf: performance.now() } });
    });
  }

  function sampleFrameDrops() {
    [video.getVideoPlaybackQuality].filter(Boolean).forEach(checkQuality);
  }

  function acquireWakeLock() {
    [navigator.wakeLock].filter(Boolean).forEach(function(wl) {
      wl.request('screen').then(function(l) { wakeLock = l; }).catch(function() {});
    });
  }

  function releaseWakeLock() {
    [wakeLock].filter(Boolean).forEach(function(wl) { wl.release(); wakeLock = null; });
  }

  function showControls() {
    var c = document.getElementById('controls');
    c.classList.remove('hidden');
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(function() { c.classList.add('hidden'); }, 3000);
  }

  function updateProgress() {
    var pct = (video.currentTime / video.duration) * 100;
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('time-display').textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
  }

  // app -> companion state snapshot (FEAT-017): full picture, last-wins. The page
  // supplies the static context (screen/ids/profile); the player adds live fields.
  function buildSnapshot() {
    var ctx = appContext();
    return {
      screen: ctx.screen, itemId: ctx.itemId, episodeId: ctx.episodeId, profile: ctx.profile,
      positionSec: video.currentTime,
      durationSec: [video.duration].filter(function(d) { return !isNaN(d); }).concat([null])[0],
      playing: !video.paused,
      captionsOn: captionsOn
    };
  }
  function emitState() { emitSnapshot(buildSnapshot()); }

  // ~1 Hz heartbeat while playing; play/pause/seek emit immediately (below).
  var heartbeat = createHeartbeat(emitState);

  function togglePlayPause() {
    onIntent(TOGGLE_INTENT[video.paused + '']);
    VIDEO_TOGGLE[video.paused]();
  }

  var executeSkip = function(delta) {
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
    showControls();
  };

  // ── transport d-pad nav (model: L/R = quick ±10s; U/D cycles buttons) ──────
  // Clickable breadcrumb crumbs (FEAT-021) join the Up/Down cycle ahead of the
  // transport so the trail is d-pad reachable; Enter on one navigates via click.
  function crumbStops() {
    return Array.prototype.slice.call(document.querySelectorAll('#breadcrumb .crumb-link'));
  }

  function focusList() {
    return crumbStops()
      .concat(FOCUS_ORDER.map(function(id) { return document.getElementById(id); }))
      .filter(function(el) { return !el.classList.contains('hidden'); });
  }

  function moveFocus(delta) {
    var list = focusList();
    var ids = list.map(function(el) { return el.id; });
    var cur = [ids.indexOf(document.activeElement.id)].filter(function(i) { return i >= 0; }).concat([0])[0];
    list[(cur + delta + list.length) % list.length].focus();
  }

  function activate() { document.activeElement.click(); }

  // ── Jump popup (graduated grid, both directions) ──────────────────────────
  function setJumpFocus(i) {
    jumpPopup.focusIndex = Math.max(0, Math.min(JUMP_DELTAS.length - 1, i));
    jumpPopup.el.querySelectorAll('button')[jumpPopup.focusIndex].focus();
  }

  function closeJumpPopup() {
    [jumpPopup].filter(Boolean).forEach(function(p) {
      document.removeEventListener('click', p.outsideHandler);
      document.body.removeChild(p.el);
      jumpPopup = null;
      document.getElementById('btn-jump').focus();
    });
  }

  function appendJumpOption(grid, delta, label) {
    var opt = document.createElement('button');
    opt.textContent = label;
    opt.setAttribute('data-delta', delta);
    opt.addEventListener('click', function() { closeJumpPopup(); executeSkip(delta); });
    grid.appendChild(opt);
  }

  function positionJumpPopup(popup) {
    var btn = document.getElementById('btn-jump');
    var rect = btn.getBoundingClientRect();
    var pw = popup.offsetWidth;
    var left = Math.max(8, Math.min(window.innerWidth - pw - 8, rect.left + rect.width / 2 - pw / 2));
    popup.style.left = left + 'px';
    popup.style.top = Math.max(8, rect.top - popup.offsetHeight - 8) + 'px';
  }

  function openJumpPopup() {
    closeJumpPopup();
    var popup = document.createElement('div');
    popup.className = 'jump-popup';
    popup.style.top = '-9999px';
    popup.style.left = '0';
    var title = document.createElement('div');
    title.className = 'jump-title';
    title.textContent = 'Jump';
    popup.appendChild(title);
    var grid = document.createElement('div');
    grid.className = 'jump-grid';
    JUMP_DELTAS.forEach(function(delta, i) { appendJumpOption(grid, delta, JUMP_LABELS[i]); });
    popup.appendChild(grid);
    document.body.appendChild(popup);
    function onClickOutside(e) {
      [e.target].filter(function(t) { return !popup.contains(t); }).forEach(function() { closeJumpPopup(); });
    }
    setTimeout(function() { document.addEventListener('click', onClickOutside); }, 0);
    jumpPopup = { el: popup, focusIndex: JUMP_DEFAULT, outsideHandler: onClickOutside };
    setTimeout(function() { positionJumpPopup(popup); setJumpFocus(JUMP_DEFAULT); }, 0);
    showControls();
  }

  function jumpSelect() {
    var delta = parseFloat(jumpPopup.el.querySelectorAll('button')[jumpPopup.focusIndex].getAttribute('data-delta'));
    closeJumpPopup();
    executeSkip(delta);
  }

  var JUMP_NAV = {
    ArrowLeft:  function() { setJumpFocus(jumpPopup.focusIndex - 1); },
    ArrowRight: function() { setJumpFocus(jumpPopup.focusIndex + 1); },
    ArrowUp:    function() { setJumpFocus(jumpPopup.focusIndex - JUMP_COLS); },
    ArrowDown:  function() { setJumpFocus(jumpPopup.focusIndex + JUMP_COLS); },
    Enter:      function() { jumpSelect(); },
    ' ':        function() { jumpSelect(); },
    Escape:     function() { closeJumpPopup(); },
    Backspace:  function() { closeJumpPopup(); }
  };

  var VIDEO_NAV = {
    ArrowLeft:  function() { executeSkip(-QUICK_SKIP); },
    ArrowRight: function() { executeSkip(QUICK_SKIP); },
    ArrowUp:    function() { moveFocus(-1); },
    ArrowDown:  function() { moveFocus(1); },
    Enter:      activate,
    ' ':        activate,
    Escape:     function() { stopPlayback(); },
    Backspace:  function() { stopPlayback(); }
  };

  // ── inline up-next line under the title (FEAT-017) ─────────────────────────
  // prefix is the muted lead ("Up next: " mid-series, "" at the wrapping end);
  // label is the emphasised episode title (or "Start again"). The page resolves
  // both from the next-episode lookup (series-detail.upNextParts).
  function setUpNext(prefix, label) {
    var el = document.getElementById('video-upnext');
    el.textContent = prefix;
    var b = document.createElement('b');
    b.textContent = label;
    el.appendChild(b);
  }

  // Player big title — "{series} · {episode}" / bare film title. The page sets
  // it once the series context resolves (series-detail.playerTitle).
  function setTitle(text) {
    document.getElementById('film-title-video').textContent = text;
  }

  function clearUpNext() {
    [upnextTimer].filter(Boolean).forEach(function() { clearInterval(upnextTimer); upnextTimer = null; });
    document.getElementById('upnext-overlay').classList.add('hidden');
  }

  function cancelUpNext() { clearUpNext(); stopPlayback(); }

  function renderUpNextCount() {
    document.getElementById('upnext-count').textContent = 'Starting in ' + upnextRemaining + '…';
  }

  function tickUpNext(proceed) {
    upnextRemaining = upnextRemaining - 1;
    renderUpNextCount();
    [upnextRemaining].filter(function(r) { return r <= 0; }).forEach(function() { clearUpNext(); proceed(); });
  }

  function startUpNext(title, proceed) {
    var text = document.getElementById('upnext-text');
    text.textContent = 'Up next: ';
    var b = document.createElement('b');
    b.textContent = title;
    text.appendChild(b);
    document.getElementById('upnext-overlay').classList.remove('hidden');
    document.getElementById('btn-upnext-cancel').focus();
    upnextRemaining = UPNEXT_SECS;
    renderUpNextCount();
    upnextTimer = setInterval(function() { tickUpNext(proceed); }, 1000);
  }

  var UPNEXT_NAV = {
    Enter:     function() { cancelUpNext(); },
    ' ':       function() { cancelUpNext(); },
    Escape:    function() { cancelUpNext(); },
    Backspace: function() { cancelUpNext(); }
  };

  // ── key routing: up-next overlay > jump popup > transport nav ──────────────
  function upnextActive() {
    return !document.getElementById('upnext-overlay').classList.contains('hidden');
  }

  function stateKey() {
    return ['upnext'].filter(function() { return upnextActive(); })
      .concat(['popup'].filter(function() { return !!jumpPopup; }))
      .concat(['nav'])[0];
  }

  var STATE_HANDLERS = {
    upnext: function(e) { [UPNEXT_NAV[e.key]].filter(Boolean).forEach(function(fn) { e.preventDefault(); fn(); }); },
    popup:  function(e) { [JUMP_NAV[e.key]].filter(Boolean).forEach(function(fn) { e.preventDefault(); fn(); }); },
    nav:    function(e) { [VIDEO_NAV[e.key]].filter(Boolean).forEach(function(fn) { e.preventDefault(); fn(); }); }
  };

  function handleVideoKey(e) {
    showControls();
    STATE_HANDLERS[stateKey()](e);
  }

  function startPlayback(seekTo) {
    document.getElementById('screen-video').style.display = '';
    onIntent('video');
    acquireWakeLock();
    video.muted = false;
    var doPlay = function() {
      video.play().catch(function() { video.muted = true; video.play().catch(function() {}); });
      showControls();
    };
    [seekTo].filter(function(t) { return t > 0; }).forEach(function(t) {
      [video].filter(function(el) { return el.readyState >= 1; }).forEach(function() { video.currentTime = t; doPlay(); });
      [video].filter(function(el) { return el.readyState < 1; }).forEach(function() {
        video.addEventListener('loadedmetadata', function onMeta() {
          video.removeEventListener('loadedmetadata', onMeta);
          video.currentTime = t;
          doPlay();
        });
      });
    });
    [seekTo].filter(function(t) { return !(t > 0); }).forEach(function() { doPlay(); });
  }

  function stopPlayback() {
    clearUpNext();
    heartbeat.stop();
    video.pause();
    video.src = '';
    document.getElementById('btn-cc').classList.add('hidden');
    [currentBlobUrl].filter(Boolean).forEach(function() { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; });
    onIntent('stop');
    releaseWakeLock();
    var rp = returnPage;
    currentVideo = null;
    returnPage = null;
    onStop(rp);
  }

  function ccVisible() {
    return !document.getElementById('btn-cc').classList.contains('hidden');
  }

  // Apply the global sticky captions pref to the live track + CC button state.
  function applyCaptions() {
    [video.textTracks.length].filter(Boolean).forEach(function() { video.textTracks[0].mode = CC_MODE[captionsOn + '']; });
    document.getElementById('btn-cc').classList.toggle('cc-off', !captionsOn);
  }

  // Build the native subtitle <track> for the current video (FEAT-015). Absent
  // subtitles ⇒ no track and the CC button stays hidden. On/off follows the
  // global sticky pref (FEAT-017), not a per-video default.
  function setSubtitleTrack(record) {
    Array.prototype.slice.call(video.querySelectorAll('track'))
      .forEach(function(t) { video.removeChild(t); });
    var cc = document.getElementById('btn-cc');
    cc.classList.add('hidden');
    captionsOn = getCaptions();
    [record.subtitles].filter(Boolean).forEach(function(file) {
      var track = document.createElement('track');
      track.kind = 'subtitles';
      track.srclang = 'en';
      track.label = 'English';
      track.src = mediaUrl(server, file);
      video.appendChild(track);
      cc.classList.remove('hidden');
      applyCaptions();
    });
  }

  function toggleSubtitles() {
    captionsOn = !captionsOn;
    setCaptions(captionsOn);
    applyCaptions();
    showControls();
    emitState();
  }

  // record: a full /api/video record. startSec is resolved by the page from the
  // backend (FEAT-017 source of truth) — resume by default, 0 on restart. No
  // localStorage read or write; series auto-advance is driven by the page.
  function playVideo(record, from, startSec) {
    var playFrom = [from].filter(Boolean).concat(['browse'])[0];
    [currentBlobUrl].filter(Boolean).forEach(function() { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; });
    currentVideo    = record;
    returnPage      = playFrom;
    _currentDisplay = { id: record.id, title: record.title };
    document.getElementById('video-upnext').textContent = '';
    video.src       = mediaUrl(server, record.id + '.mp4');
    setSubtitleTrack(record);
    document.getElementById('film-title-video').textContent = record.title;
    onIntent('play', { title: record.title });
    startPlayback(startSec);
  }

  function currentVideoDisplay() { return _currentDisplay; }

  // ⏮/⏭ are episode controls — meaningless for a standalone film, so hide them
  // when there is no series (they stay out of the d-pad focus cycle too).
  var SERIES_MODE = { 'true': 'remove', 'false': 'add' };
  function setSeriesMode(on) {
    ['btn-prev', 'btn-next'].forEach(function(id) { document.getElementById(id).classList[SERIES_MODE[on + '']]('hidden'); });
  }

  // Physical-remote d-pad maps onto the same key router as the keyboard, so the
  // popup / overlay / transport states behave identically however a press arrives.
  var remote = {};
  remote.left   = function() { handleVideoKey({ key: 'ArrowLeft',  preventDefault: function() {} }); };
  remote.right  = function() { handleVideoKey({ key: 'ArrowRight', preventDefault: function() {} }); };
  remote.up     = function() { handleVideoKey({ key: 'ArrowUp',    preventDefault: function() {} }); };
  remote.down   = function() { handleVideoKey({ key: 'ArrowDown',  preventDefault: function() {} }); };
  remote.select = function() { handleVideoKey({ key: 'Enter',      preventDefault: function() {} }); };
  remote.back   = function() { handleVideoKey({ key: 'Escape',     preventDefault: function() {} }); };
  remote.play     = function() { video.play().catch(function() {}); showControls(); };
  remote.pause    = function() { video.pause(); showControls(); };
  remote.toggle   = function() { VIDEO_TOGGLE[video.paused](); showControls(); };
  remote.next     = function() { onNext(); };
  remote.prev     = function() { onPrev(); };
  remote.skip     = function(params) { executeSkip([params].filter(Boolean).map(function(p) { return p.deltaSec; }).filter(Boolean).concat([0])[0]); };
  remote.vol_up   = function() { video.volume = Math.min(1, video.volume + 0.1); showControls(); };
  remote.vol_down = function() { video.volume = Math.max(0, video.volume - 0.1); showControls(); };
  remote.toggleCaptions = function() { [ccVisible()].filter(Boolean).forEach(toggleSubtitles); };
  remote.cc       = function() { [ccVisible()].filter(Boolean).forEach(toggleSubtitles); };

  video.addEventListener('timeupdate', function() {
    [video.duration].filter(Boolean).forEach(updateProgress);
    [currentVideo].filter(Boolean).forEach(function(rec) {
      var now = Date.now();
      // Backend is the sole progress store (FEAT-017): throttled save, no localStorage.
      [rec].filter(function() { return video.currentTime > 0; })
        .filter(function() { return !isNaN(video.duration); })
        .filter(function() { return now - lastBackendSave > BACKEND_SAVE_MS; })
        .forEach(function() { lastBackendSave = now; saveProgress(server, rec.id, video.currentTime, video.duration, getPerson()).catch(function() {}); });
    });
  });

  video.addEventListener('ended', function() {
    heartbeat.stop();
    [currentVideo].filter(Boolean).forEach(function(rec) { saveProgress(server, rec.id, video.duration, video.duration, getPerson()).catch(function() {}); });
    emitState();
    onEnded();
  });
  video.addEventListener('play', function() {
    document.getElementById('btn-play-pause').textContent = '⏸';
    heartbeat.start();
    emitState();
    sendTelemetry(EVENTS.VIDEO_PLAY, SOURCES.TV, { meta: { perf: performance.now() } });
    sampleFrameDrops();
  });
  video.addEventListener('pause', function() {
    document.getElementById('btn-play-pause').textContent = '▶';
    heartbeat.stop();
    emitState();
    sendTelemetry(EVENTS.VIDEO_PAUSE, SOURCES.TV, { meta: { perf: performance.now() } });
  });
  video.addEventListener('waiting', function() {
    sendTelemetry(EVENTS.VIDEO_BUFFER_START, SOURCES.TV, { meta: { perf: performance.now() } });
  });
  video.addEventListener('canplay', function() {
    sendTelemetry(EVENTS.VIDEO_BUFFER_END, SOURCES.TV, { meta: { perf: performance.now() } });
  });
  video.addEventListener('seeked', function() {
    emitState();
    sendTelemetry(EVENTS.SEEK, SOURCES.TV, { meta: { perf: performance.now() } });
    sampleFrameDrops();
  });

  document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);
  document.getElementById('btn-prev').addEventListener('click', function() { onPrev(); });
  document.getElementById('btn-next').addEventListener('click', function() { onNext(); });
  document.getElementById('btn-jump').addEventListener('click', openJumpPopup);
  document.getElementById('btn-cc').addEventListener('click', toggleSubtitles);
  document.getElementById('btn-upnext-cancel').addEventListener('click', cancelUpNext);
  document.getElementById('screen-video').addEventListener('click', showControls);

  return { playVideo, handleVideoKey, openJumpPopup, showControls, setUpNext, setTitle, startUpNext, setSeriesMode, currentVideoDisplay, stop: stopPlayback, remote };
}
