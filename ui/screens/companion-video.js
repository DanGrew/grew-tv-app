import { connect } from '../../core/companion-ws.js';
import { loadNext } from '../../core/app-api.js';
import { screenPage, displayTitle } from '../../core/companion-utils.js';
import { fmt } from '../../core/time.js';
import { percent } from '../../core/progress.js';

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
    upnext: document.getElementById('upnext')
  };
  var state = { snap: null, nextKey: null };
  var api = {};

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
  }

  function onContext(payload) {
    var page = screenPage(payload.context_id);
    ({ true:  function() { window.location.href = page + '.html'; },
       false: function() { els.ctxLabel.textContent = 'Now playing'; els.title.textContent = displayTitle(payload); }
    })[page !== 'video']();
  }

  els.toggle.addEventListener('click', function() { api.sendIntent('toggle'); });
  els.cc.addEventListener('click', function() { api.toggleCaptions(); });
  document.getElementById('c-prev').addEventListener('click', function() { api.prev(); });
  document.getElementById('c-next').addEventListener('click', function() { api.next(); });
  buildJump();
  setInterval(renderBar, 250);

  api = connect('ws://' + host + ':8766', onContext, function(status) { els.connStatus.textContent = status; }, onAppState);
}
