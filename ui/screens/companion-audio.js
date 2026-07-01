import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadAlbum, loadPlaylist, playbackAction } from '../../core/app-api.js';
import { screenPage, displayTitle, queryString } from '../../core/companion-utils.js';
import { fmt } from '../../core/time.js';
import { percent } from '../../core/progress.js';
import { trailCrumbs } from '../../core/breadcrumb.js';
import { peek as peekTrail, trimOnCrumb } from '../../core/nav-trail.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';

// Companion audio context (FEAT-018 TASK-132 / FEAT-037 TASK-245). The music
// analogue of companion-video: live transport + now-playing, plus the album track
// list — tap a row to teleport the TV to that track. SERVER-AUTHORITATIVE now
// (TASK-245): prev / next / play-track POST to the per-person
// /api/playback engine (Plane B) — the SAME endpoint the TV audio page drives —
// and now-playing, the current-track highlight and the track
// list's source all repaint from the `playback` snapshot the server pushes back
// (onPlayback), mirroring the TV. play/pause, graduated skip, volume and reset
// have no server action (TV-local) so they stay on the legacy WS intent rail
// (Plane A); the progress bar is still interpolated locally between 1 Hz app_state
// snapshots. Every control here already has a d-pad path on the TV (TASK-130/131).
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
    jump: document.getElementById('jump'),
    tracks: document.getElementById('tracks'),
    reset: document.getElementById('c-reset')
  };
  var state = { snap: null, psnap: null, sourceType: null, sourceId: null, person: null };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
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
    // Trim the trail to the clicked ancestor (Home clears) so a later Back can't
    // retrace past this jump (FEAT-032 stale-Back fix). Replaces the old
    // clear-only-on-Home (an items crumb left the trail untrimmed).
    trimOnCrumb(page, params);
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

  // Play/pause stays on the 1 Hz app_state (Plane A — the <audio> is TV-local).
  function renderControls() {
    [state.snap].filter(Boolean).forEach(function(s) {
      els.toggle.textContent = PLAY_ICON[s.playing + ''];
    });
  }

  // The live current track rides the `playback` snapshot's now-playing (the engine
  // source of truth), not the 1 Hz app_state.
  function currentId() {
    return [state.psnap].filter(Boolean).map(function(s) { return s.now_playing; }).filter(Boolean).map(function(np) { return np.track_id; }).concat([null])[0];
  }

  // Highlight the row matching the live current track (episodeId). Scoped to the
  // play buttons so the sibling ＋ Queue control isn't mistaken for a track row.
  function markCurrent() {
    Array.prototype.slice.call(els.tracks.querySelectorAll('.track-btn')).forEach(function(b) {
      b.classList.toggle('cur', b.getAttribute('data-id') === currentId());
    });
  }

  // FEAT-037 (TASK-245) transport: every music action POSTs to the per-person
  // /api/playback engine (Plane B), the SAME endpoint the TV audio page drives;
  // the server applies the transition and broadcasts the resolved `playback`
  // snapshot, which repaints BOTH surfaces (onPlayback). Mirrors companion-video's
  // sendVideoAction. Keyed to the active person captured off app_state.
  function sendPlayback(action, body) { playbackAction(server, action, state.person, body).catch(noop); }
  function playTrack(id) { sendPlayback('play-track', { track_id: id }); }

  // FEAT-031 (TASK-189) producer: queue a track to PLAY NEXT — it lands in the
  // override queue and shows up under PLAY NEXT on the Queue View + TV.
  function queueTrack(id) { sendPlayback('queue-track', { track_id: id }); }

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
    b.addEventListener('click', function() { playTrack(v.id); });
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
  // The source identity rides the `playback` snapshot (source_type / source_id) —
  // the engine source of truth (TASK-245), not the 1 Hz app_state.
  var SOURCE_TRACKS = {
    album:    function(id) { loadTracks(id); },
    playlist: function(id) { loadPlaylistTracks(id); },
    artist:   function() {},
    track:    function() {}
  };
  function loadSource(s) {
    state.sourceId = s.source_id;
    [SOURCE_TRACKS[s.source_type]].filter(Boolean).forEach(function(fn) { fn(s.source_id); });
  }
  // Always reflect the source type so Back routes correctly even before any list
  // resolves; reload the track list only when the source id changes.
  function captureSource(s) {
    state.sourceType = s.source_type;
    [s.source_id].filter(function(id) { return id !== state.sourceId; }).forEach(function() { loadSource(s); });
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
  }

  // ── server `playback` snapshot -> companion (the now-playing source of truth,
  // mirroring the TV audio page's applySnapshot). Now-playing title + the breadcrumb
  // leaf, the current-track highlight and the track list's source
  // all read it; the progress bar and play/pause icon still ride app_state (Plane A).
  function renderNowFromSnap(snap) {
    [snap.now_playing].filter(Boolean).forEach(function(np) {
      els.ctxLabel.textContent = 'Now playing';
      els.title.textContent = np.title;
      mountAudioCrumbs(np.title);
    });
  }
  function onPlayback(snap) {
    state.psnap = snap;
    renderNowFromSnap(snap);
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
  document.getElementById('c-prev').addEventListener('click', function() { sendPlayback('previous'); });
  document.getElementById('c-next').addEventListener('click', function() { sendPlayback('next'); });
  document.getElementById('c-vol-down').addEventListener('click', function() { api.sendIntent('vol_down'); });
  document.getElementById('c-vol-up').addEventListener('click', function() { api.sendIntent('vol_up'); });
  els.reset.addEventListener('click', onResetTap);
  document.getElementById('c-queue').addEventListener('click', function() { window.location.href = 'queue.html'; });
  buildJump();
  setInterval(renderBar, 250);

  mountSyncBar(mode, onModeChange);
  applyMode();
  api = connect(wsUrl(host), onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { mode: mode, onPlayback: onPlayback });
  updateBar = mountScreenBar(getApi, noop);
}
