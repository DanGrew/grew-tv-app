import { connect } from '../../core/companion-ws.js';
import { loadSeries, videoPlaybackAction } from '../../core/app-api.js';
import { screenPage, displayTitle, seriesIdFromSnap, queryString } from '../../core/companion-utils.js';
import { nowPlaying, upNextLine, seriesMode } from '../../core/video-player-router.js';
import { fmt } from '../../core/time.js';
import { percent } from '../../core/progress.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';

// Companion player transport (FEAT-017 + FEAT-037/TASK-223). Two planes, by design
// (the music-companion migration hasn't landed yet, so the shared intent rail must
// stay). PLANE B — server-authoritative video engine: prev/next/repeat POST to
// /api/video-playback for the active person and now-playing / up-next / repeat
// repaint from the per-person `video_playback` snapshot (onVideoPlayback), the SAME
// snapshot the persistent TV player renders — so a media change the companion drives
// swaps the TV in place, no forced reload. PLANE A — the legacy WS intent rail still
// carries play/pause, graduated skip, captions, volume and reset (the <video>'s own
// transport has no server action); the progress bar is interpolated locally between
// 1 Hz app_state snapshots. No scrub — seek is a relative skip(deltaSec).
var JUMP = [
  { d: -10, label: '-10s' }, { d: -30, label: '-30s' }, { d: -120, label: '-2m' }, { d: -600, label: '-10m' }, { d: -1800, label: '-30m' },
  { d: 10, label: '+10s' }, { d: 30, label: '+30s' }, { d: 120, label: '+2m' }, { d: 600, label: '+10m' }, { d: 1800, label: '+30m' }
];
var PLAY_ICON = { 'true': '⏸', 'false': '▶' };

export function initPage() {
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    title: document.getElementById('now-title'),
    barFill: document.getElementById('bar-fill'),
    time: document.getElementById('time'),
    toggle: document.getElementById('c-toggle'),
    cc: document.getElementById('c-cc'),
    repeat: document.getElementById('c-repeat'),
    prev: document.getElementById('c-prev'),
    next: document.getElementById('c-next'),
    jump: document.getElementById('jump'),
    upnext: document.getElementById('upnext'),
    reset: document.getElementById('c-reset')
  };
  var state = { snap: null, vsnap: null, person: null, loadedSeriesId: null, crumb: { seriesId: null, seriesTitle: null, videoTitle: '' } };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }
  // FEAT-038 (TASK-230): the switch ONLY changes mode (consistent everywhere).
  // BROWSE greys the transport in place (body.browsing); reach the library via
  // the breadcrumb (local-nav while desynced). CONTROL reloads (reconnect).
  function reSync() { window.location.reload(); }
  function applyMode() { document.body.classList.toggle('browsing', mode.isDesynced()); }
  function onModeChange(browsing) { ({ true: applyMode, false: reSync })[browsing](); }

  // Breadcrumb trail (FEAT-021): Home > Series > Episode (film: Home > Title).
  // Ancestor crumbs send the `navigate` intent — the app teleports the TV and
  // echoes context back, which onContext follows. The episode title arrives in
  // the WS context; the series id/title are derived from the app_state snapshot
  // (itemId is the series for an episode, the video itself for a film) and the
  // series title is fetched once, mirroring the detail screen.
  // Browse mode: crumb is a local hop (reach the library without driving the TV).
  function localGo(page, params) { window.location.href = page + queryString(params); }
  function navigate(page, params) {
    ({ true: function() { localGo(page, params); }, false: function() { api.sendIntent('navigate', { page: page, params: params }); } })[mode.isDesynced()]();
  }
  function mountVideoCrumbs() {
    mountCompanionBreadcrumb('breadcrumb', buildCrumbs('video', state.crumb), navigate);
  }
  function loadSeriesTitle(seriesId) {
    loadSeries(server, seriesId)
      .then(function(s) { state.crumb.seriesTitle = s.title; mountVideoCrumbs(); })
      .catch(function() { state.crumb.seriesTitle = 'Series'; mountVideoCrumbs(); });
  }
  function captureSeries(snap) {
    state.crumb.seriesId = seriesIdFromSnap(snap);
    [state.crumb.seriesId].filter(Boolean).filter(function(id) { return id !== state.loadedSeriesId; }).forEach(function(id) {
      state.loadedSeriesId = id;
      loadSeriesTitle(id);
    });
  }

  function buildJump() {
    JUMP.forEach(function(j) {
      var b = document.createElement('button');
      b.className = 'jump-btn';
      b.textContent = j.label;
      b.addEventListener('click', function() { api.skip(j.d); });
      els.jump.appendChild(b);
    });
  }

  // Smooth playhead from the interpolated position (api.position()), not from a
  // raw snapshot — gives a moving bar between 1 Hz heartbeats with no traffic.
  function renderBar() {
    [state.snap].filter(Boolean).forEach(function(s) {
      var pos = api.position();
      els.barFill.style.width = percent(pos, s.durationSec) + '%';
      els.time.textContent = fmt(pos) + ' / ' + fmt([s.durationSec].filter(Boolean).concat([0])[0]);
    });
  }

  function renderControls() {
    [state.snap].filter(Boolean).forEach(function(s) {
      els.toggle.textContent = PLAY_ICON[s.playing + ''];
      els.cc.classList.toggle('on', !!s.captionsOn);
    });
  }

  // PLANE B transport: each fires the same server action the TV player fires
  // (TASK-222), keyed to the active person — the server advances the engine and
  // broadcasts the resolved `video_playback` snapshot, which repaints BOTH surfaces.
  function sendVideoAction(action) { videoPlaybackAction(server, action, state.person).catch(noop); }

  // ── server `video_playback` snapshot -> companion (the now-playing source of
  // truth, mirroring the TV). Now-playing + the breadcrumb leaf, the inline up-next
  // line (wraps to "Start again" under repeat), and the repeat pill all read the
  // snapshot; the ⏮/repeat/⏭ row hides for a single-item source (a standalone film).
  function renderNowFromSnap(snap) {
    [nowPlaying(snap)].filter(Boolean).forEach(function(np) {
      els.ctxLabel.textContent = 'Now playing';
      els.title.textContent = np.title;
      state.crumb.videoTitle = np.title;
      mountVideoCrumbs();
    });
  }
  function renderUpNext(snap) {
    els.upnext.textContent = [upNextLine(snap)].filter(Boolean).map(function(l) { return l.prefix + l.label; }).concat([''])[0];
  }
  function renderRepeat(snap) {
    els.repeat.classList.toggle('on', !!snap.repeat);
  }
  function applySeriesMode(on) {
    els.prev.classList.toggle('single', !on);
    els.next.classList.toggle('single', !on);
    els.repeat.classList.toggle('single', !on);
  }
  function onVideoPlayback(snap) {
    state.vsnap = snap;
    renderNowFromSnap(snap);
    renderUpNext(snap);
    renderRepeat(snap);
    applySeriesMode(seriesMode(snap));
  }

  // The active person rides the app_state (TASK-158); the Plane B POSTs key per
  // person off it, like the companion-audio producer.
  function capturePerson(snap) {
    [snap.person].filter(Boolean).forEach(function(p) { state.person = p; });
  }

  function onAppState(snap) {
    state.snap = snap;
    capturePerson(snap);
    renderControls();
    renderBar();
    captureSeries(snap);
  }

  function onVideoContext(payload) {
    els.ctxLabel.textContent = 'Now playing';
    els.title.textContent = displayTitle(payload);
    state.crumb.videoTitle = displayTitle(payload);
    mountVideoCrumbs();
  }

  // Following the TV onto another page is gated in Browse mode; staying on the
  // video page to refresh titles (display-only) is fine in both modes.
  function followToOtherPage(page) {
    ({ true: function() { window.location.href = page + '.html'; }, false: noop })[mode.drivesNav()]();
  }
  function onContext(payload) {
    var page = screenPage(payload.context_id);
    ({ true: function() { followToOtherPage(page); }, false: function() { onVideoContext(payload); } })[page !== 'video']();
  }

  // Reset progress (TASK-142): two-tap confirm (tap -> "Reset progress?" -> tap)
  // then send the `reset` intent — the TV player clears this item's progress and
  // exits, and the companion follows the echoed context. Auto-disarms after 4s so
  // an armed button never stays stuck on touch.
  var resetArmed = false;
  var resetTimer = null;
  function disarmReset() {
    resetArmed = false;
    els.reset.classList.remove('confirm');
    els.reset.textContent = 'Reset progress';
  }
  function armReset() {
    resetArmed = true;
    els.reset.classList.add('confirm');
    els.reset.textContent = 'Reset progress?';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(disarmReset, 4000);
  }
  function fireReset() {
    clearTimeout(resetTimer);
    disarmReset();
    api.sendIntent('reset');
  }
  function onResetTap() {
    ({ 'false': armReset, 'true': fireReset })[String(resetArmed)]();
  }

  els.toggle.addEventListener('click', function() { api.sendIntent('toggle'); });
  els.cc.addEventListener('click', function() { api.toggleCaptions(); });
  els.prev.addEventListener('click', function() { sendVideoAction('previous'); });
  els.next.addEventListener('click', function() { sendVideoAction('next'); });
  els.repeat.addEventListener('click', function() { sendVideoAction('toggle-repeat'); });
  document.getElementById('c-vol-down').addEventListener('click', function() { api.sendIntent('vol_down'); });
  document.getElementById('c-vol-up').addEventListener('click', function() { api.sendIntent('vol_up'); });
  els.reset.addEventListener('click', onResetTap);
  document.getElementById('c-queue').addEventListener('click', function() { window.location.href = 'video-queue.html'; });
  buildJump();
  setInterval(renderBar, 250);

  mountSyncBar(mode, onModeChange);
  applyMode();
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { mode: mode, onVideoPlayback: onVideoPlayback });
  updateBar = mountScreenBar(getApi, noop);
}
