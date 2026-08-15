import { connect } from '../../core/companion-ws.js';
import { musicVideoPlaybackAction } from '../../core/app-api.js';
import { companionQueueHtml } from '../../core/music-video-queue-view.js';
import { screenPage } from '../../core/companion-utils.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { mountSyncBar } from './companion-sync-bar.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountStatusMenu } from './companion-status-menu.js';

// FEAT-418 (TASK-420) companion Music-Video Queue View — the phone mirror of
// the TV Queue View (screen-music-video-queue.js). It renders the four-section
// server `music_video_playback` snapshot (companion-ws onMusicVideoPlayback)
// and DRIVES the queue by POSTing the TASK-419 actions straight to
// /api/music-video-playback for the target device's active person —
// server-authoritative, the resolved snapshot comes back over the WS relay and
// repaints (companion drives, TV mirrors). Per-row tap = play-video, ↑/↓ =
// move-queue-entry, ✕ = remove-queue-entry; transport next/prev/shuffle/repeat
// are server actions. Play/pause is the one device-local control — it toggles
// the TV's <video> via the existing `toggle` WS intent, not a snapshot.
export function initPage() {
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    back: document.getElementById('btn-back'),
    body: document.getElementById('queue-body')
  };
  var state = { person: null };
  var api = {};
  var activeTab = null;               // chosen Queue/Next/Coming-Up tab
  var mode = createCompanionMode();
  var updateBar = null;
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }
  // FEAT-038 (TASK-230): the switch only changes mode. BROWSE greys the queue
  // actions in place (body.browsing) so nothing disturbs playback; reach the
  // library via Back -> player -> breadcrumb. CONTROL reloads (reconnect).
  function reSync() { window.location.reload(); }
  function applyMode() { document.body.classList.toggle('browsing', mode.isDesynced()); }
  function onModeChange(browsing) { ({ true: applyMode, false: reSync })[browsing](); }

  // POST a music-video-playback action for the bound person; the server
  // broadcasts the new snapshot back over the relay, which repaints the view
  // (no local queue math).
  function post(action, body) {
    musicVideoPlaybackAction(server, action, state.person, body).catch(noop);
  }

  var ACT = {
    select:    function(b) { post('play-video', { video_id: b.getAttribute('data-video') }); },
    move:      function(b) { post('move-queue-entry', { entry_id: b.getAttribute('data-entry'), direction: b.getAttribute('data-dir') }); },
    remove:    function(b) { post('remove-queue-entry', { entry_id: b.getAttribute('data-entry') }); },
    transport: function(b) { post(b.getAttribute('data-action'), {}); },
    toggle:    function() { api.sendIntent('toggle'); },
    tab:       function(b) { switchTab(b.getAttribute('data-tab')); }
  };

  function wireButton(b) {
    b.addEventListener('click', function() { ACT[b.getAttribute('data-act')](b); });
  }

  // Tap a tab to switch panels in place. Toggle the active class on the tab +
  // its panel; `activeTab` is re-applied across snapshot repaints.
  function applyTab(key) {
    Array.prototype.slice.call(els.body.querySelectorAll('.ph-qtab')).forEach(function(t) { t.classList.toggle('active', t.getAttribute('data-tab') === key); });
    Array.prototype.slice.call(els.body.querySelectorAll('.ph-qtab-panel')).forEach(function(p) { p.classList.toggle('active', p.getAttribute('data-tab') === key); });
  }
  function switchTab(key) { activeTab = key; applyTab(key); }

  function render(snap) {
    els.body.innerHTML = companionQueueHtml(snap);
    Array.prototype.slice.call(els.body.querySelectorAll('button')).forEach(wireButton);
    [activeTab].filter(Boolean).forEach(applyTab);
  }

  // The active person rides the app_state (TASK-158); the POSTs key per
  // person off it, exactly as the companion music/video Queue Views do.
  function onAppState(snap) {
    [snap.person].filter(Boolean).forEach(function(p) { state.person = p; });
  }

  // Follow the TV: if it leaves the video context, jump to that companion page
  // (mirrors companion-video). Same-context ('video') is a no-op, so the Queue
  // View stays put while the music video keeps playing. Browse mode does not follow.
  function followContext(payload) {
    var page = screenPage(payload.context_id);
    [page].filter(function(p) { return p !== 'video'; }).forEach(function(p) { window.location.href = p + '.html'; });
  }
  function onContext(payload) {
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
  }

  els.back.addEventListener('click', function() { window.location.href = 'video.html'; });
  document.getElementById('switch-profile').addEventListener('click', function() { api.sendIntent('navigate', switchProfileTarget()); });
  render(null);
  mountSyncBar(mode, onModeChange);
  mountStatusMenu();
  applyMode();
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { onMusicVideoPlayback: render, mode: mode });
  updateBar = mountScreenBar(getApi, noop);
}
