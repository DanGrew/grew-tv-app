import { fmt } from '../../core/time.js';
import { EVENTS, SOURCES, createEvent } from '../../core/telemetry-schema.js';
import { mediaUrl, saveProgress } from '../../core/app-api.js';

var SKIP_AMOUNTS   = [10, 30, 120, 300, 900, 1800];
var SKIP_LABELS    = ['10s', '30s', '2m', '5m', '15m', '30m'];
var SKIP_BTN_ID    = { back: 'btn-skip-back', fwd: 'btn-skip-fwd' };
var SKIP_IDS       = { 'btn-skip-back': true, 'btn-skip-fwd': true };
var SKIP_DIRECTION = { 'btn-skip-back': 'back', 'btn-skip-fwd': 'fwd' };
var SKIP_TEXT_FN   = {
  back: function(lbl) { return '« ' + lbl; },
  fwd:  function(lbl) { return lbl + ' »'; }
};
var SKIP_DELTA_FN  = {
  back: function(amt) { return -amt; },
  fwd:  function(amt) { return amt; }
};
var VIDEO_STOP_KEYS       = { Escape: true, Backspace: true };
var VIDEO_PLAY_PAUSE_KEYS = { ' ': true, Enter: true };
var TOGGLE_INTENT         = { 'true': 'play', 'false': 'pause' };
var SKIP_LEFT_TARGET      = { 'btn-skip-fwd': 'btn-play-pause', 'btn-skip-back': 'btn-back-video' };
var SKIP_RIGHT_TARGET     = { 'btn-skip-back': 'btn-play-pause', 'btn-skip-fwd': 'btn-back-video' };
var VIDEO_REMOTE_LEFT     = { 'btn-skip-fwd': 'btn-play-pause', 'btn-play-pause': 'btn-skip-back', 'btn-skip-back': 'btn-back-video' };
var VIDEO_REMOTE_RIGHT    = { 'btn-skip-back': 'btn-play-pause', 'btn-play-pause': 'btn-skip-fwd', 'btn-skip-fwd': 'btn-back-video' };
var VIDEO_REMOTE_DOWN     = { 'btn-skip-back': 'btn-back-video', 'btn-play-pause': 'btn-back-video', 'btn-skip-fwd': 'btn-back-video' };
var VIDEO_REMOTE_UP       = { 'btn-back-video': 'btn-play-pause' };

export function setup(config) {
  var video    = config.video;
  var server   = config.server;
  var onStop   = config.onStop;
  var onEnded  = [config.onEnded ].filter(Boolean).concat([function() { stopPlayback(); }])[0];
  var onNext   = [config.onNext  ].filter(Boolean).concat([function() {}])[0];
  var onPrev   = [config.onPrev  ].filter(Boolean).concat([function() {}])[0];
  var onIntent = [config.onIntent].filter(Boolean).concat([function() {}])[0];

  var wakeLock             = null;
  var controlsTimer        = null;
  var currentBlobUrl       = null;
  var currentVideo         = null;
  var returnPage           = null;
  var lastSaveTime         = 0;
  var lastBackendSave      = 0;
  var lastDroppedFrames    = 0;
  var pendingResumePosition = 0;
  var skipPopup            = null;
  var _currentDisplay      = {};

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
    var t = document.getElementById('film-title-video');
    c.classList.remove('hidden');
    t.classList.remove('hidden');
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(function() { c.classList.add('hidden'); t.classList.add('hidden'); }, 3000);
  }

  function updateProgress() {
    var pct = (video.currentTime / video.duration) * 100;
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('time-display').textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
  }

  function togglePlayPause() {
    onIntent(TOGGLE_INTENT[video.paused + '']);
    VIDEO_TOGGLE[video.paused]();
  }

  var executeSkip = function(delta) {
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
    showControls();
  };

  function updateSkipPopupFocus() {
    skipPopup.el.querySelectorAll('button')[skipPopup.focusIndex].focus();
  }

  function closeSkipPopup() {
    [skipPopup].filter(Boolean).forEach(function(p) {
      document.removeEventListener('click', p.outsideHandler);
      document.body.removeChild(p.el);
      skipPopup = null;
    });
  }

  function positionSkipPopup(popup, btn) {
    var rect = btn.getBoundingClientRect();
    var ph = popup.offsetHeight;
    var pw = popup.offsetWidth;
    var left = Math.max(8, Math.min(window.innerWidth - pw - 8, rect.left + rect.width / 2 - pw / 2));
    popup.style.left = left + 'px';
    popup.style.top = Math.max(8, rect.top - ph - 8) + 'px';
  }

  function appendSkipOption(popup, amt, i, direction, btnId) {
    var opt = document.createElement('button');
    opt.textContent = SKIP_TEXT_FN[direction](SKIP_LABELS[i]);
    opt.setAttribute('data-delta', SKIP_DELTA_FN[direction](amt));
    opt.addEventListener('click', function() {
      executeSkip(parseFloat(opt.getAttribute('data-delta')));
      closeSkipPopup();
      document.getElementById(btnId).focus();
    });
    popup.appendChild(opt);
  }

  function openSkipPopup(direction) {
    closeSkipPopup();
    var btnId = SKIP_BTN_ID[direction];
    var btn = document.getElementById(btnId);
    var popup = document.createElement('div');
    popup.className = 'skip-popup';
    popup.style.top = '-9999px';
    popup.style.left = '0';
    SKIP_AMOUNTS.forEach(function(amt, i) { appendSkipOption(popup, amt, i, direction, btnId); });
    document.body.appendChild(popup);
    function onClickOutside(e) {
      [e.target].filter(function(t) { return !popup.contains(t); }).forEach(function() { closeSkipPopup(); });
    }
    setTimeout(function() { document.addEventListener('click', onClickOutside); }, 0);
    skipPopup = { el: popup, direction: direction, focusIndex: 0, outsideHandler: onClickOutside };
    setTimeout(function() { positionSkipPopup(popup, btn); updateSkipPopupFocus(); }, 0);
    showControls();
  }

  var POPUP_NAV = {
    ArrowUp:   function() { skipPopup.focusIndex = Math.max(0, skipPopup.focusIndex - 1); updateSkipPopupFocus(); },
    ArrowDown: function() { skipPopup.focusIndex = Math.min(SKIP_AMOUNTS.length - 1, skipPopup.focusIndex + 1); updateSkipPopupFocus(); },
    Enter:     function() {
      var p = skipPopup;
      var delta = parseFloat(p.el.querySelectorAll('button')[p.focusIndex].getAttribute('data-delta'));
      closeSkipPopup();
      executeSkip(delta);
      document.getElementById(SKIP_BTN_ID[p.direction]).focus();
    },
    Escape:    function() { closeSkipPopup(); },
    Backspace: function() { closeSkipPopup(); }
  };

  var SKIP_NAV = {
    ArrowLeft:  function() { document.getElementById(SKIP_LEFT_TARGET[document.activeElement.id]).focus(); },
    ArrowRight: function() {
      var id = document.activeElement.id;
      // From btn-skip-fwd, step right onto the CC toggle when it is showing.
      var target = ([id].filter(function(x) { return x === 'btn-skip-fwd' && ccVisible(); })
        .map(function() { return 'btn-cc'; }))[0] || SKIP_RIGHT_TARGET[id];
      document.getElementById(target).focus();
    },
    ArrowDown:  function() { document.getElementById('btn-back-video').focus(); },
    Enter:      function() { openSkipPopup(SKIP_DIRECTION[document.activeElement.id]); }
  };

  var BACK_NAV = {
    ArrowUp: function() { document.getElementById('btn-play-pause').focus(); }
  };

  // Subtitle toggle (FEAT-013) — only reachable/visible when the current video
  // carries a subtitles track; absent ⇒ btn-cc stays hidden and nav is unchanged.
  var CC_NAV = {
    ArrowLeft: function() { document.getElementById('btn-skip-fwd').focus(); },
    ArrowUp:   function() { document.getElementById('btn-play-pause').focus(); },
    ArrowDown: function() { document.getElementById('btn-back-video').focus(); }
  };

  var PLAY_PAUSE_NAV = {
    ArrowLeft:  function() { document.getElementById('btn-skip-back').focus(); },
    ArrowRight: function() { document.getElementById('btn-skip-fwd').focus(); },
    ArrowDown:  function() { document.getElementById('btn-back-video').focus(); }
  };

  var EXIT_FN   = { 'true': doRestart, 'false': stopPlayback };
  var RESUME_NAV = { 'btn-resume': { ArrowRight: 'btn-restart' }, 'btn-restart': { ArrowLeft: 'btn-resume' } };

  var POPUP_HANDLERS = {
    'true':  function(e) {
      [POPUP_NAV[e.key]].filter(Boolean).forEach(function(fn) { e.preventDefault(); fn(); });
    },
    'false': function(e) {
      var onSkip      = !!SKIP_IDS[document.activeElement.id];
      var onBack      = document.activeElement.id === 'btn-back-video';
      var onPlayPause = document.activeElement.id === 'btn-play-pause';
      var onCc        = document.activeElement.id === 'btn-cc';
      var onResume    = pendingResumePosition > 0;
      [EXIT_FN[onResume + '']].filter(function() { return VIDEO_STOP_KEYS[e.key]; }).forEach(function(f) { e.preventDefault(); f(); });
      [RESUME_NAV[document.activeElement.id]].filter(Boolean).filter(function() { return onResume; }).forEach(function(nav) {
        [nav[e.key]].filter(Boolean).forEach(function(id) { e.preventDefault(); document.getElementById(id).focus(); });
      });
      [SKIP_NAV[e.key]].filter(Boolean).filter(function() { return onSkip; }).forEach(function(fn) { e.preventDefault(); fn(); });
      [BACK_NAV[e.key]].filter(Boolean).filter(function() { return onBack; }).forEach(function(fn) { e.preventDefault(); fn(); });
      [PLAY_PAUSE_NAV[e.key]].filter(Boolean).filter(function() { return onPlayPause; }).forEach(function(fn) { e.preventDefault(); fn(); });
      [CC_NAV[e.key]].filter(Boolean).filter(function() { return onCc; }).forEach(function(fn) { e.preventDefault(); fn(); });
      [toggleSubtitles].filter(function() { return VIDEO_PLAY_PAUSE_KEYS[e.key]; }).filter(function() { return onCc; }).forEach(function(f) { e.preventDefault(); f(); });
      [togglePlayPause].filter(function() { return VIDEO_PLAY_PAUSE_KEYS[e.key]; }).filter(function() { return !onSkip; }).filter(function() { return !onBack; }).filter(function() { return !onCc; }).forEach(function(f) { e.preventDefault(); f(); });
    }
  };

  function handleVideoKey(e) {
    showControls();
    POPUP_HANDLERS[!!skipPopup + ''](e);
  }

  function startPlayback(seekTo) {
    document.getElementById('screen-resume').style.display = 'none';
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

  function doResume() {
    var t = pendingResumePosition;
    pendingResumePosition = 0;
    startPlayback(t);
  }

  function doRestart() {
    pendingResumePosition = 0;
    localStorage.removeItem('grew-tv:position:' + currentVideo.id);
    startPlayback(0);
  }

  function ccVisible() {
    var b = document.getElementById('btn-cc');
    return !!b && !b.classList.contains('hidden');
  }

  // Build the native subtitle <track> for the current video (FEAT-013). One
  // English track per video; absent subtitles ⇒ no track and the CC toggle
  // stays hidden, leaving playback chrome unchanged.
  function setSubtitleTrack(record) {
    Array.prototype.slice.call(video.querySelectorAll('track'))
      .forEach(function(t) { video.removeChild(t); });
    var cc = document.getElementById('btn-cc');
    cc.classList.add('hidden');
    [record.subtitles].filter(Boolean).forEach(function(file) {
      var track = document.createElement('track');
      track.kind = 'subtitles';
      track.srclang = 'en';
      track.label = 'English';
      track.src = mediaUrl(server, file);
      track['default'] = true;
      video.appendChild(track);
      cc.classList.remove('hidden');
      cc.classList.remove('cc-off');
    });
  }

  function toggleSubtitles() {
    [video.textTracks.length].filter(Boolean).forEach(function() {
      var tt = video.textTracks[0];
      var SET = { 'showing': 'hidden', 'hidden': 'showing' };
      tt.mode = SET[tt.mode] || 'hidden';
      document.getElementById('btn-cc').classList.toggle('cc-off', tt.mode !== 'showing');
      showControls();
    });
  }

  // record: a full /api/video record (the watchable leaf). A video is the unit
  // of playback in v3 — there is no item list; series auto-advance is driven by
  // the page via /api/next.
  function playVideo(record, from) {
    var playFrom = [from].filter(Boolean).concat(['browse'])[0];
    [currentBlobUrl].filter(Boolean).forEach(function() { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; });
    currentVideo    = record;
    returnPage      = playFrom;
    _currentDisplay = { id: record.id, title: record.title };
    video.src       = mediaUrl(server, record.id + '.mp4');
    setSubtitleTrack(record);
    document.getElementById('film-title-video').textContent = record.title;
    onIntent('play', { title: record.title });
    var saved = localStorage.getItem('grew-tv:position:' + record.id);
    var t     = [saved].filter(Boolean).map(parseFloat)[0];
    [t].filter(function(x) { return x > 5; }).forEach(function(x) {
      pendingResumePosition = x;
      document.getElementById('resume-time').textContent = fmt(x);
      document.getElementById('screen-video').style.display = 'none';
      document.getElementById('screen-resume').style.display = 'flex';
      document.getElementById('btn-resume').focus();
      onIntent('resume_prompt');
    });
    [t].filter(function(x) { return !(x > 5); }).forEach(function() { startPlayback(0); });
  }

  function currentVideoDisplay() { return _currentDisplay; }

  var remote = {};
  SKIP_AMOUNTS.forEach(function(amt) {
    remote['skip_back_' + amt] = function() { executeSkip(-amt); };
    remote['skip_fwd_'  + amt] = function() { executeSkip(amt); };
  });
  remote.play     = function() { video.play().catch(function() {}); showControls(); };
  remote.pause    = function() { video.pause(); showControls(); };
  remote.toggle   = function() { VIDEO_TOGGLE[video.paused](); showControls(); };
  remote.next     = function() { onNext(); };
  remote.prev     = function() { onPrev(); };
  remote.vol_up   = function() { video.volume = Math.min(1, video.volume + 0.1); showControls(); };
  remote.vol_down = function() { video.volume = Math.max(0, video.volume - 0.1); showControls(); };
  remote.skip_back = function() { openSkipPopup('back'); };
  remote.skip_fwd  = function() { openSkipPopup('fwd'); };
  remote.left   = function() { var p = skipPopup; [p].filter(Boolean).forEach(function() { POPUP_NAV.Escape(); }); [!p].filter(Boolean).forEach(function() { [VIDEO_REMOTE_LEFT[document.activeElement.id]].filter(Boolean).forEach(function(id) { showControls(); document.getElementById(id).focus(); }); }); };
  remote.right  = function() { var p = skipPopup; [p].filter(Boolean).forEach(function() { POPUP_NAV.Escape(); }); [!p].filter(Boolean).forEach(function() { [VIDEO_REMOTE_RIGHT[document.activeElement.id]].filter(Boolean).forEach(function(id) { showControls(); document.getElementById(id).focus(); }); }); };
  remote.down   = function() { var p = skipPopup; [p].filter(Boolean).forEach(function() { POPUP_NAV.ArrowDown(); }); [!p].filter(Boolean).forEach(function() { [VIDEO_REMOTE_DOWN[document.activeElement.id]].filter(Boolean).forEach(function(id) { showControls(); document.getElementById(id).focus(); }); }); };
  remote.up     = function() { var p = skipPopup; [p].filter(Boolean).forEach(function() { POPUP_NAV.ArrowUp(); }); [!p].filter(Boolean).forEach(function() { [VIDEO_REMOTE_UP[document.activeElement.id]].filter(Boolean).forEach(function(id) { showControls(); document.getElementById(id).focus(); }); }); };
  remote.select = function() { var p = skipPopup; [p].filter(Boolean).forEach(function() { POPUP_NAV.Enter(); }); [!p].filter(Boolean).forEach(function() { showControls(); document.activeElement.click(); }); };
  remote.back   = function() { var p = skipPopup; [p].filter(Boolean).forEach(function() { POPUP_NAV.Escape(); }); [!p].filter(Boolean).forEach(function() { stopPlayback(); }); };
  remote.resume  = function() { doResume(); };
  remote.restart = function() { doRestart(); };
  remote.cc      = function() { [ccVisible()].filter(Boolean).forEach(toggleSubtitles); };

  video.addEventListener('timeupdate', function() {
    [video.duration].filter(Boolean).forEach(updateProgress);
    [currentVideo].filter(Boolean).forEach(function(rec) {
      var now = Date.now();
      [rec].filter(function() { return video.currentTime > 0; }).filter(function() { return !isNaN(video.duration); }).forEach(function() {
        var key = 'grew-tv:position:' + rec.id;
        [key].filter(function() { return video.duration - video.currentTime < 30; }).forEach(function() { localStorage.removeItem(key); });
        [key].filter(function() { return video.duration - video.currentTime >= 30; }).filter(function() { return now - lastSaveTime > 5000; }).forEach(function() { lastSaveTime = now; localStorage.setItem(key, video.currentTime); });
        // Dual-write to the backend (FEAT-017 source of truth) on its own throttle,
        // ungated by the 30s rule above so true position drives Continue Watching.
        [rec].filter(function() { return now - lastBackendSave > 5000; }).forEach(function() { lastBackendSave = now; saveProgress(server, rec.id, video.currentTime, video.duration).catch(function() {}); });
      });
    });
  });

  video.addEventListener('ended', function() {
    [currentVideo].filter(Boolean).forEach(function(rec) { saveProgress(server, rec.id, video.duration, video.duration).catch(function() {}); });
    onEnded();
  });
  video.addEventListener('play', function() {
    document.getElementById('btn-play-pause').textContent = '⏸';
    sendTelemetry(EVENTS.VIDEO_PLAY, SOURCES.TV, { meta: { perf: performance.now() } });
    sampleFrameDrops();
  });
  video.addEventListener('pause', function() {
    document.getElementById('btn-play-pause').textContent = '▶';
    sendTelemetry(EVENTS.VIDEO_PAUSE, SOURCES.TV, { meta: { perf: performance.now() } });
  });
  video.addEventListener('waiting', function() {
    sendTelemetry(EVENTS.VIDEO_BUFFER_START, SOURCES.TV, { meta: { perf: performance.now() } });
  });
  video.addEventListener('canplay', function() {
    sendTelemetry(EVENTS.VIDEO_BUFFER_END, SOURCES.TV, { meta: { perf: performance.now() } });
  });
  video.addEventListener('seeked', function() {
    sendTelemetry(EVENTS.SEEK, SOURCES.TV, { meta: { perf: performance.now() } });
    sampleFrameDrops();
  });

  document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);
  document.getElementById('btn-resume').addEventListener('click', doResume);
  document.getElementById('btn-restart').addEventListener('click', doRestart);
  document.getElementById('btn-back-video').addEventListener('click', stopPlayback);
  document.getElementById('btn-skip-back').addEventListener('click', function() { openSkipPopup('back'); });
  document.getElementById('btn-skip-fwd').addEventListener('click', function() { openSkipPopup('fwd'); });
  document.getElementById('btn-cc').addEventListener('click', toggleSubtitles);
  document.getElementById('screen-video').addEventListener('click', showControls);

  return { playVideo, doResume, doRestart, handleVideoKey, openSkipPopup, showControls, currentVideoDisplay, stop: stopPlayback, remote };
}
