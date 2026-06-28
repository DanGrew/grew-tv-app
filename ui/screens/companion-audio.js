import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadAlbum, loadPlaylist, playbackAction } from '../../core/app-api.js';
import { screenPage, displayTitle, queryString } from '../../core/companion-utils.js';
import { fmt } from '../../core/time.js';
import { percent } from '../../core/progress.js';
import { trailCrumbs } from '../../core/breadcrumb.js';
import { peek as peekTrail, clear as clearTrail } from '../../core/nav-trail.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';

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
    reset: document.getElementById('c-reset')
  };
  var state = { snap: null, sourceType: null, sourceId: null, person: null };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
  var syncBar = null;
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }
  // FEAT-038 (TASK-230): the mode switch ONLY changes mode (consistent on every
  // page — no surprise navigation). BROWSE greys the TV-driving transport in
  // place (via body.browsing) so there are no dead clicks; you reach the library
  // through the breadcrumb (local-nav while desynced). CONTROL reloads to re-run
  // the reconnect path.
  function reSync() { window.location.reload(); }
  function applyMode() { document.body.classList.toggle('browsing', mode.isDesynced()); }
  function onModeChange(browsing) { ({ true: applyMode, false: reSync })[browsing](); }

  // Back is the breadcrumb now (FEAT-032 / TASK-218), not a lone Back button: the
  // player shows Home > <items> > Track, where <items> is the level you launched
  // from (a browse grid, or an artist's albums page) recorded into nav-trail.
  // Tapping <items> returns there (browse self-restores; artist reloads). Only the
  // Home crumb — the one with EMPTY params — clears the trail and roots at
  // sections; an items crumb (browse tab/rail or artist) keeps it. The crumb fires
  // the same `navigate` intent the other companion screens use.
  function mountAudioCrumbs(title) {
    mountCompanionBreadcrumb('breadcrumb', trailCrumbs(peekTrail(), title), onCrumbNav);
  }
  // Browse mode: the crumb is a LOCAL hop (the intent would be suppressed anyway)
  // so you can reach the library without driving the TV. Control mode: the usual
  // navigate intent the other screens use.
  function localGo(page, params) { window.location.href = page + queryString(params); }
  function onCrumbNav(page, params) {
    ({ 'true': clearTrail, 'false': noop })[String(Object.keys(params).length === 0)]();
    ({ true: function() { localGo(page, params); }, false: function() { api.sendIntent('navigate', { page: page, params: params }); } })[mode.isDesynced()]();
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
    // A flat playlist track carries no episode number (episode:null) — show a
    // blank slot rather than the literal "null" (FEAT-036/TASK-205); an album
    // track keeps its number.
    var num = [item.episode].filter(Boolean).concat([''])[0];
    var b = document.createElement('button');
    b.className = 'track-btn';
    b.setAttribute('data-id', v.id);
    b.insertAdjacentHTML('beforeend', '<span class="t-num">' + num + '</span><span class="t-name">' + v.title + '</span>');
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
    els.tracks.innerHTML = '';
    album.items.forEach(function(item) { els.tracks.appendChild(trackBtn(item)); });
    markCurrent();
  }

  // Track list for a collection source (album or playlist) — both project to the
  // same { title, items } shape (loadAlbum / loadPlaylist), so the render is one
  // path; only the loader differs.
  function loadTracksVia(loader, id) {
    loader(server, id)
      .then(renderTracks)
      .catch(function() { els.tracks.innerHTML = ''; });
  }
  function loadTracks(albumId) { loadTracksVia(loadAlbum, albumId); }
  function loadPlaylistTracks(id) { loadTracksVia(loadPlaylist, id); }

  // Album AND playlist sources have a companion track list (FEAT-036/TASK-205:
  // a playlist source loads via loadPlaylist, NOT loadAlbum). An artist source
  // must NOT loadAlbum(artistId) (a 404 that cleared the list AND set a bogus
  // album-detail Back target — BUG-018), and a lone single has no list at all.
  var SOURCE_TRACKS = {
    album:    function(id) { loadTracks(id); },
    playlist: function(id) { loadPlaylistTracks(id); },
    artist:   function() {},
    track:    function() {}
  };
  function loadSource(s) {
    state.sourceId = s.sourceId;
    [SOURCE_TRACKS[s.sourceType]].filter(Boolean).forEach(function(fn) { fn(s.sourceId); });
  }
  // Always reflect the source type so Back routes correctly even before any list
  // resolves; reload the track list only when the source id changes.
  function captureSource(s) {
    state.sourceType = s.sourceType;
    [s.sourceId].filter(function(id) { return id !== state.sourceId; }).forEach(function() { loadSource(s); });
  }

  // The active person rides the app_state (TASK-158); the ＋ Queue POSTs key per
  // person off it, like the companion's Continue-Watching reads.
  function capturePerson(snap) {
    [snap.person].filter(Boolean).forEach(function(p) { state.person = p; });
  }

  function onAppState(snap) {
    syncBar.setPlaying(snap.playing);
    state.snap = snap;
    capturePerson(snap);
    renderControls();
    renderBar();
    captureSource(snap);
    markCurrent();
  }

  function followContext(payload) {
    els.ctxLabel.textContent = 'Now playing';
    els.title.textContent = displayTitle(payload);
    mountAudioCrumbs(displayTitle(payload));
    var page = screenPage(payload.context_id);
    [page].filter(function(p) { return p !== 'audio'; }).forEach(function(p) { window.location.href = p + '.html'; });
  }
  // The TV status strip title rides the context (both modes); only the nav-follow
  // is gated in Browse mode.
  function onContext(payload) {
    syncBar.setTitle(displayTitle(payload));
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
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

  syncBar = mountSyncBar(mode, onModeChange);
  applyMode();
  api = connect(wsUrl(host), onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { mode: mode });
  updateBar = mountScreenBar(getApi, noop);
}
