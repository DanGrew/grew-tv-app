import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { videoPlaybackAction } from '../../core/app-api.js';
import { companionVideoQueueHtml } from '../../core/video-queue-view.js';
import { screenPage } from '../../core/companion-utils.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { mountSyncBar } from './companion-sync-bar.js';

// FEAT-040 (TASK-250) companion Video Queue View — the phone mirror of the TV
// Video Queue View (screen-video-queue.js). It renders the server `video_playback`
// snapshot (companion-ws onVideoPlayback) and DRIVES the queue by POSTing the
// video-playback actions to /api/video-playback for the target device's active
// person — server-authoritative, the resolved snapshot comes back over the WS relay
// and repaints (companion drives, TV mirrors). A source row tap = play-item, a
// queued row's ↑/↓ = move-queue-entry, ✕ = remove-queue-entry; transport
// next/prev/repeat are server actions. Play/pause is the one device-local control —
// it toggles the TV's <video> via the existing `toggle` WS intent, not a snapshot.
export function initPage() {
  var host = window.location.hostname;
  var server = 'http://' + host + ':8765';
  var els = {
    connStatus: document.getElementById('conn-status'),
    back: document.getElementById('btn-back'),
    body: document.getElementById('queue-body')
  };
  var state = { person: null };
  var api = {};
  var mode = createCompanionMode();
  var syncBar = null;
  function noop() {}
  // FEAT-038 (TASK-230): the switch only changes mode. BROWSE greys the queue
  // actions in place (body.browsing) so nothing disturbs playback; reach the
  // library via Back -> player -> breadcrumb. CONTROL reloads (reconnect).
  function reSync() { window.location.reload(); }
  function applyMode() { document.body.classList.toggle('browsing', mode.isDesynced()); }
  function onModeChange(browsing) { ({ true: applyMode, false: reSync })[browsing](); }

  // POST a video-playback action for the bound person; the server broadcasts the
  // new snapshot back over the relay, which repaints the view (no local queue math).
  function post(action, body) {
    videoPlaybackAction(server, action, state.person, body).catch(noop);
  }

  var ACT = {
    select:    function(b) { post('play-item', { item_id: b.getAttribute('data-item') }); },
    move:      function(b) { post('move-queue-entry', { entry_id: b.getAttribute('data-entry'), direction: b.getAttribute('data-dir') }); },
    remove:    function(b) { post('remove-queue-entry', { entry_id: b.getAttribute('data-entry') }); },
    transport: function(b) { post(b.getAttribute('data-action'), {}); },
    toggle:    function() { api.sendIntent('toggle'); }
  };

  function wireButton(b) {
    b.addEventListener('click', function() { ACT[b.getAttribute('data-act')](b); });
  }

  function render(snap) {
    els.body.innerHTML = companionVideoQueueHtml(snap);
    Array.prototype.slice.call(els.body.querySelectorAll('button')).forEach(wireButton);
  }

  // The active person rides the app_state (TASK-158); the POSTs key per person off
  // it, exactly as the companion video player does.
  function onAppState(snap) {
    syncBar.updateStatus(snap);
    [snap.person].filter(Boolean).forEach(function(p) { state.person = p; });
  }

  // Follow the TV: if it leaves the video context, jump to that companion page
  // (mirrors companion-video). Same-context ('video') is a no-op, so the Queue View
  // stays put while the series keeps playing. Browse mode does not follow.
  function followContext(payload) {
    var page = screenPage(payload.context_id);
    [page].filter(function(p) { return p !== 'video'; }).forEach(function(p) { window.location.href = p + '.html'; });
  }
  function onContext(payload) {
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
  }

  els.back.addEventListener('click', function() { window.location.href = 'video.html'; });
  render(null);
  syncBar = mountSyncBar(mode, onModeChange);
  applyMode();
  api = connect(wsUrl(host), onContext, function(status) { els.connStatus.textContent = status; }, onAppState, noop, { onVideoPlayback: render, mode: mode });
}
