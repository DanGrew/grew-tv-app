import { fmt } from '../../core/time.js';
import { mediaUrl, resetProgress } from '../../core/app-api.js';
import { getPerson } from '../../core/state.js';
import { createHeartbeat } from '../../core/ws-protocol.js';
import { logEvent, makeSeekCoalescer, SOURCE_TV } from '../../core/log.js';
import { readVolume, writeVolume } from '../../core/volume-store.js';

// FEAT-018 (TASK-130) audio player. The <audio> analogue of the FEAT-017 video
// player: same transport (play/pause, prev/next track, graduated skip, range
// seek via the Jump grid) minus CC/frame-drop telemetry. Shuffle/repeat live on
// the Queue (TASK-237), not the player.
// Media resolves to {id}.{ext} (ext from the record, e.g. m4a) — never the
// video player's hardcoded .mp4. Progress + the app_state snapshot reuse the
// backend source of truth; the snapshot carries `shuffle` for the companion
// (TASK-132). The full-screen lyrics layer is TASK-131; this screen is playback.

var JUMP_DELTAS = [-10, -30, -120, -600, 10, 30, 120, 600];
var JUMP_LABELS = ['-10s', '-30s', '-2m', '-10m', '+10s', '+30s', '+2m', '+10m'];
var JUMP_COLS    = 4;
var JUMP_DEFAULT = 4;            // +10s, the most common forward skip
var QUICK_SKIP   = 10;          // d-pad left/right one-press skip
var BACKEND_SAVE_MS = 5000;

// BUG-016: d-pad up/down follows the new visual order — transport (prev/play/next)
// then the pill row beneath the progress bar (queue, jump, lyrics, reset).
var FOCUS_ORDER = ['btn-prev', 'btn-play-pause', 'btn-next', 'btn-queue', 'btn-jump', 'btn-lyrics', 'btn-reset'];
var TOGGLE_INTENT = { 'true': 'play', 'false': 'pause' };
// App-side log (TASK-213): start from a saved position logs `resume`, else `play`.
var PLAY_EVENT    = { 'true': 'resume', 'false': 'play' };
var SEEK_SETTLE_MS = 500;        // coalesce a scrub burst into one `seek` log
// {id}.{ext}: ext defaults to mp4 only as a guard — audio records carry m4a/mp3.
var EXT_OF = { 'true': function(r) { return r.ext; }, 'false': function() { return 'mp4'; } };

export function setup(config) {
  var audio  = config.audio;
  audio.volume = readVolume();   // BUG-034: re-apply the remembered level to this fresh element
  var server = config.server;
  var onStop = config.onStop;
  var onEnded  = [config.onEnded ].filter(Boolean).concat([function() { stopPlayback(); }])[0];
  var onNext   = [config.onNext  ].filter(Boolean).concat([function() {}])[0];
  var onPrev   = [config.onPrev  ].filter(Boolean).concat([function() {}])[0];
  // Queue opens the full-screen Queue View overlay (owned by the page); shuffle +
  // repeat are toggled there now, not on the player (TASK-237).
  var onQueue  = [config.onQueue ].filter(Boolean).concat([function() {}])[0];
  // FEAT-031 (TASK-187): debounced position report — the page relays it to the
  // server `position` action (playback_state is the audio resume source now).
  var reportPosition = [config.reportPosition].filter(Boolean).concat([function() {}])[0];
  var onLyrics  = [config.onLyrics ].filter(Boolean).concat([function() {}])[0];
  var onIntent = [config.onIntent].filter(Boolean).concat([function() {}])[0];
  var emitSnapshot = [config.emitState ].filter(Boolean).concat([function() {}])[0];
  var appContext   = [config.appContext].filter(Boolean).concat([function() { return {}; }])[0];

  var currentTrack    = null;
  var returnPage      = null;
  var lastBackendSave = 0;
  var jumpPopup       = null;
  var lyricsOn        = true;          // ambient lyrics shown by default
  var pendingResume   = false;
  var _currentDisplay = {};
  // TASK-283: the per-track early-advance boundary (endAt). A number arms the cut;
  // null means play to the natural end. Latched by nulling it on fire so a burst of
  // timeupdate ticks past the boundary advances exactly once; re-armed per track in
  // playTrack.
  var currentEndAt    = null;

  var AUDIO_TOGGLE = {
    'true':  function() { audio.play().catch(function() {}); },
    'false': function() { audio.pause(); }
  };

  function extFor(record) { return EXT_OF[(!!record.ext) + ''](record); }

  function updateProgress() {
    var pct = (audio.currentTime / audio.duration) * 100;
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('time-display').textContent = fmt(audio.currentTime) + ' / ' + fmt(audio.duration);
  }

  // app -> companion snapshot (FEAT-017): static context from the page + live
  // fields here. Shuffle rides the server `playback` snapshot now, not app_state.
  function buildSnapshot() {
    var ctx = appContext();
    return {
      screen: ctx.screen, itemId: ctx.itemId, episodeId: ctx.episodeId, profile: ctx.profile,
      sourceType: ctx.sourceType, sourceId: ctx.sourceId,
      positionSec: audio.currentTime,
      durationSec: [audio.duration].filter(function(d) { return !isNaN(d); }).concat([null])[0],
      playing: !audio.paused,
      // TASK-239: reflect the ambient-lyrics pref so the companion pill mirrors it.
      lyricsOn: lyricsOn
    };
  }
  function emitState() { emitSnapshot(buildSnapshot()); }
  var heartbeat = createHeartbeat(emitState);

  // App-side log context (TASK-213): who / what / where-in-the-track / which
  // screen. itemId is the playing track; an album track also carries its album
  // as collectionId.
  function logCtx() {
    var ctx = appContext();
    var id = [currentTrack].filter(Boolean).map(function(r) { return r.id; }).concat([ctx.itemId])[0];
    return {
      itemId: id,
      collectionId: [ctx.itemId].filter(Boolean).filter(function(c) { return c !== id; }).concat([null])[0],
      positionSec: audio.currentTime,
      durationSec: [audio.duration].filter(function(d) { return !isNaN(d); }).concat([null])[0],
      person: getPerson(),
      source: SOURCE_TV
    };
  }
  function emit(event) { logEvent(event, logCtx()); }
  var coalesceSeek = makeSeekCoalescer(function() { emit('seek'); }, SEEK_SETTLE_MS);

  function togglePlayPause() {
    onIntent(TOGGLE_INTENT[audio.paused + '']);
    AUDIO_TOGGLE[audio.paused]();
  }

  var executeSkip = function(delta) {
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + delta));
  };

  // ── transport d-pad nav (L/R = quick ±10s; U/D cycles buttons) ─────────────
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

  // ── Jump popup (graduated grid, both directions = range seek) ──────────────
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

  var AUDIO_NAV = {
    ArrowLeft:  function() { executeSkip(-QUICK_SKIP); },
    ArrowRight: function() { executeSkip(QUICK_SKIP); },
    ArrowUp:    function() { moveFocus(-1); },
    ArrowDown:  function() { moveFocus(1); },
    Enter:      activate,
    ' ':        activate,
    Escape:     function() { stopPlayback(); },
    Backspace:  function() { stopPlayback(); }
  };

  // ── key routing: jump popup > transport nav ────────────────────────────────
  function stateKey() {
    return ['popup'].filter(function() { return !!jumpPopup; }).concat(['nav'])[0];
  }

  var STATE_HANDLERS = {
    popup: function(e) { [JUMP_NAV[e.key]].filter(Boolean).forEach(function(fn) { e.preventDefault(); fn(); }); },
    nav:   function(e) { [AUDIO_NAV[e.key]].filter(Boolean).forEach(function(fn) { e.preventDefault(); fn(); }); }
  };

  function handleAudioKey(e) {
    STATE_HANDLERS[stateKey()](e);
  }

  function startPlayback(seekTo) {
    onIntent('audio');
    pendingResume = seekTo > 0;   // TASK-213: resume vs fresh play (DOM `play` reads it)
    var doPlay = function() { audio.play().catch(function() {}); };
    [seekTo].filter(function(t) { return t > 0; }).forEach(function(t) {
      [audio].filter(function(el) { return el.readyState >= 1; }).forEach(function() { audio.currentTime = t; doPlay(); });
      [audio].filter(function(el) { return el.readyState < 1; }).forEach(function() {
        audio.addEventListener('loadedmetadata', function onMeta() {
          audio.removeEventListener('loadedmetadata', onMeta);
          audio.currentTime = t;
          doPlay();
        });
      });
    });
    [seekTo].filter(function(t) { return !(t > 0); }).forEach(function() { doPlay(); });
  }

  function stopPlayback() {
    // Log `stop` while the track is still current (TASK-213); no-op if nothing playing.
    [currentTrack].filter(Boolean).forEach(function() { emit('stop'); });
    heartbeat.stop();
    audio.pause();
    audio.src = '';
    onIntent('stop');
    var rp = returnPage;
    currentTrack = null;
    returnPage = null;
    onStop(rp);
  }

  // Reset progress (TASK-142): wipe this track's backend progress for the active
  // person, then leave. Pause first so the throttled timeupdate save stops firing
  // (stopPlayback never saves), making the DELETE the last write — no race.
  function resetAndExit() {
    audio.pause();
    [currentTrack].filter(Boolean).forEach(function(rec) {
      resetProgress(server, rec.id, getPerson()).catch(function() {});
    });
    stopPlayback();
  }

  // Two-press confirm guards a mis-tap: first press arms (label -> "Reset?"),
  // second resets + exits; blurring disarms.
  function fireReset(btn) {
    ({
      'false': function() { btn.classList.add('confirm'); btn.textContent = 'Reset?'; btn.setAttribute('data-armed', '1'); },
      'true':  function() { resetAndExit(); }
    })[String(btn.getAttribute('data-armed') === '1')]();
  }

  function disarmReset() {
    var btn = document.getElementById('btn-reset');
    btn.classList.remove('confirm');
    btn.textContent = 'Reset';
    btn.removeAttribute('data-armed');
  }

  // record: a full playable record (from the album items[] or /api/video).
  // startSec is the load-seek the page resolved (TASK-283: track.startAt, else 0 —
  // TASK-276 removed mid-song resume). endAt (TASK-283) is the early-advance
  // boundary (a number to cut short, null to play to the natural end); it re-arms
  // the latch for this track.
  function playTrack(record, from, startSec, endAt) {
    var playFrom = [from].filter(Boolean).concat(['browse'])[0];
    currentTrack    = record;
    returnPage      = playFrom;
    currentEndAt    = endAt;
    _currentDisplay = { id: record.id, title: record.title };
    audio.src       = mediaUrl(server, record.id + '.' + extFor(record));
    document.getElementById('audio-title').textContent = record.title;
    document.getElementById('audio-artist').textContent = [record.artist].filter(Boolean).concat([''])[0];
    onIntent('play', { title: record.title });
    startPlayback(startSec);
  }

  function currentTrackDisplay() { return _currentDisplay; }

  // ⏮/⏭ are queue controls — hidden (and out of the focus cycle) for a single
  // track with no album queue.
  var QUEUE_MODE = { 'true': 'remove', 'false': 'add' };
  function setQueueMode(multi) {
    ['btn-prev', 'btn-next'].forEach(function(id) { document.getElementById(id).classList[QUEUE_MODE[multi + '']]('hidden'); });
  }

  // Shuffle + repeat are SERVER-owned (FEAT-031) and toggled from the Queue View
  // now (TASK-237) — the player no longer carries those pills.
  function openQueue() {
    onQueue();
  }

  // Lyrics toggle: reflect on the pill (on = ambient lyrics enabled) and tell the
  // page to show/hide the lyric layer. Default on; the page only shows lyrics for
  // a track that actually has an .lrc.
  function setLyrics(on) {
    lyricsOn = !!on;
    document.getElementById('btn-lyrics').classList.toggle('on', lyricsOn);
  }
  // A press flips the pill + the page's ambient layer, then emits app_state at once
  // (TASK-239) so a companion-driven toggle round-trips its Lyrics pill immediately
  // — the heartbeat is paused-track-silent, so don't wait on the next 1 Hz tick.
  function toggleLyrics() {
    setLyrics(!lyricsOn);
    onLyrics(lyricsOn);
    emitState();
  }

  var remote = {};
  remote.left   = function() { handleAudioKey({ key: 'ArrowLeft',  preventDefault: function() {} }); };
  remote.right  = function() { handleAudioKey({ key: 'ArrowRight', preventDefault: function() {} }); };
  remote.up     = function() { handleAudioKey({ key: 'ArrowUp',    preventDefault: function() {} }); };
  remote.down   = function() { handleAudioKey({ key: 'ArrowDown',  preventDefault: function() {} }); };
  remote.select = function() { handleAudioKey({ key: 'Enter',      preventDefault: function() {} }); };
  remote.back   = function() { handleAudioKey({ key: 'Escape',     preventDefault: function() {} }); };
  remote.play     = function() { audio.play().catch(function() {}); };
  remote.pause    = function() { audio.pause(); };
  remote.toggle   = function() { AUDIO_TOGGLE[audio.paused](); };
  remote.next     = function() { emit('next'); onNext(); };
  remote.prev     = function() { onPrev(); };
  remote.queue    = function() { openQueue(); };
  remote.lyrics   = function() { toggleLyrics(); };
  remote.skip     = function(params) { executeSkip([params].filter(Boolean).map(function(p) { return p.deltaSec; }).filter(Boolean).concat([0])[0]); };
  remote.vol_up   = function() { audio.volume = Math.min(1, audio.volume + 0.1); writeVolume(audio.volume); };   // companion volume (TASK-198)
  remote.vol_down = function() { audio.volume = Math.max(0, audio.volume - 0.1); writeVolume(audio.volume); };
  remote.reset    = function() { resetAndExit(); };   // companion Reset intent (TASK-142)

  audio.addEventListener('timeupdate', function() {
    [audio.duration].filter(Boolean).forEach(updateProgress);
    [currentTrack].filter(Boolean).forEach(function(rec) {
      var now = Date.now();
      [rec].filter(function() { return audio.currentTime > 0; })
        .filter(function() { return !isNaN(audio.duration); })
        .filter(function() { return now - lastBackendSave > BACKEND_SAVE_MS; })
        .forEach(function() { lastBackendSave = now; reportPosition(audio.currentTime); });
    });
  });

  // Track end -> the page fires the server `next` action (autoadvance is server
  // queue math now); no client-side progress write. TASK-283: an endAt-trimmed
  // track routes through the SAME fireEnd on reaching the boundary, so queue/album
  // continuation is identical to a natural end (no bespoke stop).
  function fireEnd() {
    heartbeat.stop();
    emit('complete');
    emitState();
    onEnded();
  }
  audio.addEventListener('ended', fireEnd);
  // TASK-283: watch for the early-advance boundary. Nulling currentEndAt on fire
  // latches it (a burst of ticks past endAt advances once); a manual seek past the
  // boundary (>= endAt) advances too.
  function checkTrim() {
    [currentEndAt].filter(Boolean)
      .filter(function(end) { return audio.currentTime >= end; })
      .forEach(function() { currentEndAt = null; fireEnd(); });
  }
  audio.addEventListener('timeupdate', checkTrim);
  audio.addEventListener('play', function() {
    document.getElementById('btn-play-pause').textContent = '⏸';
    heartbeat.start();
    emitState();
    emit(PLAY_EVENT[pendingResume + '']);
    pendingResume = false;
  });
  audio.addEventListener('pause', function() {
    document.getElementById('btn-play-pause').textContent = '▶';
    heartbeat.stop();
    emitState();
    emit('pause');
  });
  audio.addEventListener('waiting', function() { emit('buffer_start'); });
  audio.addEventListener('canplay', function() { emit('buffer_end'); });
  audio.addEventListener('seeked', function() { emitState(); coalesceSeek(); });

  document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);
  document.getElementById('btn-prev').addEventListener('click', function() { onPrev(); });
  document.getElementById('btn-next').addEventListener('click', function() { emit('next'); onNext(); });
  document.getElementById('btn-queue').addEventListener('click', openQueue);
  document.getElementById('btn-lyrics').addEventListener('click', toggleLyrics);
  document.getElementById('btn-jump').addEventListener('click', openJumpPopup);
  document.getElementById('btn-reset').addEventListener('click', function() { fireReset(document.getElementById('btn-reset')); });
  document.getElementById('btn-reset').addEventListener('blur', disarmReset);

  return { playTrack, handleAudioKey, setQueueMode, setLyrics, currentTrackDisplay, stop: stopPlayback, remote };
}
