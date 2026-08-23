import { connect } from '../../core/companion-ws.js';
import { queuePlaybackAction, loadSeries } from '../../core/app-api.js';
import { companionFilmQueueHtml } from '../../core/film-queue-view.js';
import * as qRouter from '../../core/queue-playback-router.js';
import { screenPage } from '../../core/companion-utils.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { mountSyncBar } from './companion-sync-bar.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountStatusMenu } from './companion-status-menu.js';

// TASK-503 (FEAT-497) companion Film Queue View — the phone mirror of the TV
// Queue View (screen-film-queue.js). ⚠️ Superseded by
// companion-queue-shell.js, which home movies already run on (TASK-516);
// TASK-517 points films there too and deletes this file.
// It renders the server `queue_playback`
// snapshot (companion-ws onQueuePlayback, filtered to media_type 'film') and
// DRIVES the queue by POSTing the TASK-498 unified queue engine's actions
// straight to /api/queue/film for the target device's active person —
// server-authoritative, the resolved snapshot comes back over the WS relay
// and repaints (companion drives, TV mirrors). Per-row tap = play-item, ↑/↓ =
// move-queue-entry, ✕ = remove-queue-entry; transport next/prev/shuffle/
// repeat are server actions (shuffle/repeat inert when the hero renders them
// disabled — no source, a standalone film). Play/pause is the one
// device-local control — it toggles the TV's <video> via the existing
// `toggle` WS intent, not a snapshot.
export function initPage() {
  mountStatusMenu(['mode', 'screen', 'profile']);
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    back: document.getElementById('btn-back'),
    body: document.getElementById('queue-body')
  };
  var state = { person: null };
  var api = {};
  var activeTab = null;               // chosen Queue/Next/Coming-Up tab
  var lastSnap = null;
  var sourceTitle = '';
  var loadedSourceId = null;
  var mode = createCompanionMode();
  var updateBar = null;
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }
  function reSync() { window.location.reload(); }
  function applyMode() { document.body.classList.toggle('browsing', mode.isDesynced()); }
  function onModeChange(browsing) { ({ true: applyMode, false: reSync })[browsing](); }

  // POST a queue action for the bound person; the server broadcasts the new
  // snapshot back over the relay, which repaints the view (no local queue math).
  function post(action, body) {
    queuePlaybackAction(server, 'film', action, state.person, body).catch(noop);
  }

  var ACT = {
    select:    function(b) { post('play-item', { item_id: b.getAttribute('data-item') }); },
    move:      function(b) { post('move-queue-entry', { entry_id: b.getAttribute('data-entry'), direction: b.getAttribute('data-dir') }); },
    remove:    function(b) { post('remove-queue-entry', { entry_id: b.getAttribute('data-entry') }); },
    transport: function(b) { post(b.getAttribute('data-action'), {}); },
    toggle:    function() { api.sendIntent('toggle'); },
    tab:       function(b) { switchTab(b.getAttribute('data-tab')); }
  };

  function wireButton(b) {
    b.addEventListener('click', function() { ACT[b.getAttribute('data-act')](b); });
  }

  function applyTab(key) {
    Array.prototype.slice.call(els.body.querySelectorAll('.ph-qtab')).forEach(function(t) { t.classList.toggle('active', t.getAttribute('data-tab') === key); });
    Array.prototype.slice.call(els.body.querySelectorAll('.ph-qtab-panel')).forEach(function(p) { p.classList.toggle('active', p.getAttribute('data-tab') === key); });
  }
  function switchTab(key) { activeTab = key; applyTab(key); }

  function render(snap) {
    els.body.innerHTML = companionFilmQueueHtml(snap, sourceTitle);
    Array.prototype.slice.call(els.body.querySelectorAll('button')).forEach(wireButton);
    [activeTab].filter(Boolean).forEach(applyTab);
  }

  // The hero subtitle names the active source (a series/boxset title) — an
  // opaque id, so it needs its own lookup (mirrors the TV's own
  // screen-film-queue.js / screen-video-page.js resolution), fetched once per
  // distinct source_id and re-rendered when it lands. null/no source_type
  // (a standalone film) clears it rather than fetching.
  function clearSourceTitle() { sourceTitle = ''; }
  function applySourceTitle(id) {
    loadSeries(server, id)
      .then(function(s) { sourceTitle = s.title; render(lastSnap); })
      .catch(noop);
  }
  function ensureSourceTitle(snap) {
    var id = qRouter.sourceId(snap);
    [id !== loadedSourceId].filter(Boolean).forEach(function() {
      loadedSourceId = id;
      clearSourceTitle();
      [id].filter(Boolean).forEach(applySourceTitle);
    });
  }

  // The active person rides the app_state (TASK-158); the POSTs key per
  // person off it, exactly as the companion music/video Queue Views do.
  function onAppState(snap) {
    [snap.person].filter(Boolean).forEach(function(p) { state.person = p; });
  }

  // Only a film snapshot repaints this page — a person may hold live state in
  // more than one media_type at once (the WS relay tags every queue_playback
  // push), and this page only ever shows its own.
  function onQueuePlayback(payload) {
    [payload.media_type === 'film'].filter(Boolean).forEach(function() {
      lastSnap = payload;
      ensureSourceTitle(payload);
      render(payload);
    });
  }

  // Follow the TV: if it leaves the video context, jump to that companion
  // page (mirrors companion-video). Same-context ('video') is a no-op, so
  // the Queue View stays put while the film keeps playing. Browse mode does
  // not follow.
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
  applyMode();
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { onQueuePlayback: onQueuePlayback, mode: mode });
  updateBar = mountScreenBar(getApi, noop);
}
