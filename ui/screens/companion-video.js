import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadNext, loadSeries } from '../../core/app-api.js';
import { screenPage, displayTitle, seriesIdFromSnap } from '../../core/companion-utils.js';
import { fmt } from '../../core/time.js';
import { percent } from '../../core/progress.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';

// Companion player transport (FEAT-017). Read-only progress bar interpolated
// locally between 1 Hz app_state snapshots; graduated discrete jumps + prev/next
// /captions relayed as intents. No scrub — seek is a relative skip(deltaSec).
var JUMP = [
  { d: -10, label: '-10s' }, { d: -30, label: '-30s' }, { d: -120, label: '-2m' }, { d: -600, label: '-10m' }, { d: -1800, label: '-30m' },
  { d: 10, label: '+10s' }, { d: 30, label: '+30s' }, { d: 120, label: '+2m' }, { d: 600, label: '+10m' }, { d: 1800, label: '+30m' }
];
var PLAY_ICON = { 'true': '⏸', 'false': '▶' };

export function initPage() {
  var host = window.location.hostname;
  var server = 'http://' + host + ':8765';
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    title: document.getElementById('now-title'),
    barFill: document.getElementById('bar-fill'),
    time: document.getElementById('time'),
    toggle: document.getElementById('c-toggle'),
    cc: document.getElementById('c-cc'),
    jump: document.getElementById('jump'),
    upnext: document.getElementById('upnext'),
    reset: document.getElementById('c-reset')
  };
  var state = { snap: null, nextKey: null, loadedSeriesId: null, crumb: { seriesId: null, seriesTitle: null, videoTitle: '' } };
  var api = {};
  var updateBar = null;
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }

  // Breadcrumb trail (FEAT-021): Home > Series > Episode (film: Home > Title).
  // Ancestor crumbs send the `navigate` intent — the app teleports the TV and
  // echoes context back, which onContext follows. The episode title arrives in
  // the WS context; the series id/title are derived from the app_state snapshot
  // (itemId is the series for an episode, the video itself for a film) and the
  // series title is fetched once, mirroring the detail screen.
  function navigate(page, params) { api.sendIntent('navigate', { page: page, params: params }); }
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

  // Up next is backend state — fetch it directly (only when on a series episode,
  // and only when the episode actually changes).
  function fetchUpNext(s) {
    var key = s.itemId + '/' + s.episodeId;
    [key].filter(function() { return s.itemId !== s.episodeId; }).filter(function() { return key !== state.nextKey; }).forEach(function() {
      state.nextKey = key;
      loadNext(server, s.itemId, s.episodeId)
        .then(function(d) { els.upnext.textContent = [d.next].filter(Boolean).map(function(n) { return 'Up next: ' + n.video.title; }).concat([''])[0]; })
        .catch(function() { els.upnext.textContent = ''; });
    });
  }

  function onAppState(snap) {
    state.snap = snap;
    renderControls();
    renderBar();
    fetchUpNext(snap);
    captureSeries(snap);
  }

  function onVideoContext(payload) {
    els.ctxLabel.textContent = 'Now playing';
    els.title.textContent = displayTitle(payload);
    state.crumb.videoTitle = displayTitle(payload);
    mountVideoCrumbs();
  }

  function onContext(payload) {
    var page = screenPage(payload.context_id);
    ({ true:  function() { window.location.href = page + '.html'; },
       false: onVideoContext
    })[page !== 'video'](payload);
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
  document.getElementById('c-prev').addEventListener('click', function() { api.prev(); });
  document.getElementById('c-next').addEventListener('click', function() { api.next(); });
  document.getElementById('c-vol-down').addEventListener('click', function() { api.sendIntent('vol_down'); });
  document.getElementById('c-vol-up').addEventListener('click', function() { api.sendIntent('vol_up'); });
  els.reset.addEventListener('click', onResetTap);
  buildJump();
  setInterval(renderBar, 250);

  api = connect(wsUrl(host), onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices);
  updateBar = mountScreenBar(getApi, noop);
}
