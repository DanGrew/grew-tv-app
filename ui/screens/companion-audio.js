import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadAlbum, playbackAction } from '../../core/app-api.js';
import { screenPage, displayTitle } from '../../core/companion-utils.js';
import { fmt } from '../../core/time.js';
import { percent } from '../../core/progress.js';
import { mountScreenBar } from './companion-screen-bar.js';

// Companion audio context (FEAT-018 TASK-132). The music analogue of
// companion-video: live transport (play/pause, prev/next track, graduated skip,
// shuffle) + now-playing, plus the album track list — tap a row to teleport the
// TV to that track. Progress is interpolated locally between 1 Hz app_state
// snapshots; the shuffle pill reflects (and toggles) the snapshot flag. Every
// control here already has a d-pad path on the TV (TASK-130/131).
var JUMP = [
  { d: -30, label: '-30s' }, { d: -10, label: '-10s' }, { d: 10, label: '+10s' }, { d: 30, label: '+30s' }
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
    shuffle: document.getElementById('c-shuffle'),
    jump: document.getElementById('jump'),
    tracks: document.getElementById('tracks'),
    back: document.getElementById('btn-back'),
    reset: document.getElementById('c-reset')
  };
  var state = { snap: null, albumId: null, person: null };
  var api = {};
  var updateBar = null;
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }

  // Back teleports the TV to the album detail (companion follows the echoed
  // `detail` context); a single with no album falls back to browse. Same
  // navigate-intent path the browse/detail companions use.
  function backTarget() {
    return [state.albumId].filter(Boolean)
      .map(function(id) { return { page: 'album-detail.html', params: { album: id } }; })
      .concat([{ page: 'browse.html', params: {} }])[0];
  }
  function goBack() {
    var t = backTarget();
    api.sendIntent('navigate', { page: t.page, params: t.params });
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

  // Smooth playhead from the interpolated position, not a raw snapshot — a moving
  // bar between 1 Hz heartbeats with no extra traffic.
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
      els.shuffle.classList.toggle('on', !!s.shuffle);
    });
  }

  function currentId() {
    return [state.snap].filter(Boolean).map(function(s) { return s.episodeId; }).concat([null])[0];
  }

  // Highlight the row matching the live current track (episodeId). Scoped to the
  // play buttons so the sibling ＋ Queue control isn't mistaken for a track row.
  function markCurrent() {
    Array.prototype.slice.call(els.tracks.querySelectorAll('.track-btn')).forEach(function(b) {
      b.classList.toggle('cur', b.getAttribute('data-id') === currentId());
    });
  }

  // FEAT-031 (TASK-189) producer: queue a track to PLAY NEXT. Server-authoritative
  // — POST queue-track straight to /api/playback for the active person; it lands
  // in the override queue and shows up under PLAY NEXT on the Queue View + TV.
  function queueTrack(id) {
    playbackAction(server, 'queue-track', state.person, { track_id: id }).catch(noop);
  }

  // A track row: the play button (tap = play now, keeps the .track-btn contract
  // the highlight + e2e key off) plus a ＋ Queue producer (FEAT-031 mockup).
  function playBtn(item) {
    var v = item.video;
    var b = document.createElement('button');
    b.className = 'track-btn';
    b.setAttribute('data-id', v.id);
    b.insertAdjacentHTML('beforeend', '<span class="t-num">' + item.episode + '</span><span class="t-name">' + v.title + '</span>');
    b.addEventListener('click', function() { api.play(v.id); });
    return b;
  }

  function queueBtn(item) {
    var v = item.video;
    var b = document.createElement('button');
    b.className = 'queue-btn';
    b.setAttribute('data-queue', v.id);
    b.setAttribute('aria-label', 'Queue');
    b.textContent = '＋';
    b.addEventListener('click', function() { queueTrack(v.id); });
    return b;
  }

  function trackBtn(item) {
    var row = document.createElement('div');
    row.className = 'track-row';
    row.appendChild(playBtn(item));
    row.appendChild(queueBtn(item));
    return row;
  }

  function renderTracks(album) {
    els.back.textContent = '‹ ' + album.title;
    els.tracks.innerHTML = '';
    album.items.forEach(function(item) { els.tracks.appendChild(trackBtn(item)); });
    markCurrent();
  }

  function loadTracks(albumId) {
    loadAlbum(server, albumId)
      .then(renderTracks)
      .catch(function() { els.tracks.innerHTML = ''; });
  }

  // The album is itemId when it differs from the current track (episodeId); a
  // standalone single has no album list. Reload only when the album changes.
  function captureAlbum(s) {
    [s.itemId].filter(function() { return s.itemId !== s.episodeId; })
      .filter(function(id) { return id !== state.albumId; })
      .forEach(function(id) { state.albumId = id; loadTracks(id); });
  }

  // The active person rides the app_state (TASK-158); the ＋ Queue POSTs key per
  // person off it, like the companion's Continue-Watching reads.
  function capturePerson(snap) {
    [snap.person].filter(Boolean).forEach(function(p) { state.person = p; });
  }

  function onAppState(snap) {
    state.snap = snap;
    capturePerson(snap);
    renderControls();
    renderBar();
    captureAlbum(snap);
    markCurrent();
  }

  function onContext(payload) {
    els.ctxLabel.textContent = 'Now playing';
    els.title.textContent = displayTitle(payload);
    var page = screenPage(payload.context_id);
    [page].filter(function(p) { return p !== 'audio'; }).forEach(function(p) { window.location.href = p + '.html'; });
  }

  // Reset progress (TASK-142): two-tap confirm then send the `reset` intent — the
  // TV player clears this track's progress and exits; the companion follows the
  // echoed context. Auto-disarms after 4s so an armed button never sticks.
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

  els.back.addEventListener('click', goBack);
  els.toggle.addEventListener('click', function() { api.sendIntent('toggle'); });
  els.shuffle.addEventListener('click', function() { api.shuffle(); });
  document.getElementById('c-prev').addEventListener('click', function() { api.prev(); });
  document.getElementById('c-next').addEventListener('click', function() { api.next(); });
  document.getElementById('c-vol-down').addEventListener('click', function() { api.sendIntent('vol_down'); });
  document.getElementById('c-vol-up').addEventListener('click', function() { api.sendIntent('vol_up'); });
  els.reset.addEventListener('click', onResetTap);
  document.getElementById('c-queue').addEventListener('click', function() { window.location.href = 'queue.html'; });
  buildJump();
  setInterval(renderBar, 250);

  api = connect(wsUrl(host), onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices);
  updateBar = mountScreenBar(getApi, noop);
}
