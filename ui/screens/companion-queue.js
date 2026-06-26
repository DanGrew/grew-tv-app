import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { playbackAction } from '../../core/app-api.js';
import { companionQueueHtml } from '../../core/queue-view.js';
import { screenPage } from '../../core/companion-utils.js';

// FEAT-031 (TASK-189) companion Queue View — the phone mirror of the TV Queue
// View (screen-queue.js). It renders the four-section server `playback`
// snapshot (companion-ws onPlayback) and DRIVES the queue by POSTing the
// TASK-186 actions straight to /api/playback for the target device's active
// person — server-authoritative, the resolved snapshot comes back over the WS
// relay and repaints (companion drives, TV mirrors). Per-row tap = play-track,
// ↑/↓ = move-queue-entry, ✕ = remove-queue-entry; transport next/prev/shuffle/
// repeat are server actions. Play/pause is the one device-local control — it
// toggles the TV's <audio> via the existing `toggle` WS intent, not a snapshot.
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
  function noop() {}

  // POST a playback action for the bound person; the server broadcasts the new
  // snapshot back over the relay, which repaints the view (no local queue math).
  function post(action, body) {
    playbackAction(server, action, state.person, body).catch(noop);
  }

  var ACT = {
    select:    function(b) { post('play-track', { track_id: b.getAttribute('data-track') }); },
    move:      function(b) { post('move-queue-entry', { entry_id: b.getAttribute('data-entry'), direction: b.getAttribute('data-dir') }); },
    remove:    function(b) { post('remove-queue-entry', { entry_id: b.getAttribute('data-entry') }); },
    transport: function(b) { post(b.getAttribute('data-action'), {}); },
    toggle:    function() { api.sendIntent('toggle'); }
  };

  function wireButton(b) {
    b.addEventListener('click', function() { ACT[b.getAttribute('data-act')](b); });
  }

  function render(snap) {
    els.body.innerHTML = companionQueueHtml(snap);
    Array.prototype.slice.call(els.body.querySelectorAll('button')).forEach(wireButton);
  }

  // The active person rides the app_state (TASK-158); the POSTs key per person
  // off it, exactly as the companion's Continue-Watching reads do.
  function onAppState(snap) {
    [snap.person].filter(Boolean).forEach(function(p) { state.person = p; });
  }

  // Follow the TV: if it leaves the audio context, jump to that companion page
  // (mirrors companion-audio). Same-context ('audio') is a no-op, so the Queue
  // View stays put while the album keeps playing.
  function onContext(payload) {
    var page = screenPage(payload.context_id);
    [page].filter(function(p) { return p !== 'audio'; }).forEach(function(p) { window.location.href = p + '.html'; });
  }

  els.back.addEventListener('click', function() { window.location.href = 'audio.html'; });
  render(null);
  api = connect(wsUrl(host), onContext, function(status) { els.connStatus.textContent = status; }, onAppState, noop, { onPlayback: render });
}
