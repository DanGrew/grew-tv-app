import { connect } from '../../core/companion-ws.js';
import { queuePlaybackAction } from '../../core/app-api.js';
import { companionQueueShellHtml } from '../../core/queue-shell-view.js';
import { companionQueueCrumbHtml } from '../../core/queue-crumb.js';
import * as qRouter from '../../core/queue-playback-router.js';
import { screenPage } from '../../core/companion-utils.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { mountSyncBar } from './companion-sync-bar.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountStatusMenu } from './companion-status-menu.js';

// TASK-515 (FEAT-497) — THE companion Queue page, for every media type: the
// phone mirror of ui/screens/screen-queue-shell.js, replacing the
// per-cutover copies TASK-499 and TASK-503 each shipped. Nothing points at it
// yet: TASK-516 (home movies) and TASK-517 (films) mount it, TASK-504/505
// after them.
//
// It renders the server `queue_playback` snapshot (companion-ws
// onQueuePlayback, filtered to this page's own media_type — a person may hold
// live state in more than one type at once) and DRIVES the queue by POSTing
// the TASK-498 unified engine's actions straight to /api/queue/{media_type}
// for the target device's active person: server-authoritative, the resolved
// snapshot comes back over the WS relay and repaints (companion drives, TV
// mirrors). Per-row tap = play-item, ↑/↓ = move-queue-entry, ✕ =
// remove-queue-entry; transport next/prev/shuffle/repeat are server actions.
// Play/pause is the one device-local control — it toggles the TV's media
// element via the existing `toggle` WS intent, not a snapshot.
//
// options.media          — the core/queue-shell-config.js entry for this type.
// options.loadSourceName — (server, sourceId, sourceType) -> Promise<title>
//                          for a type whose source id is opaque (a series/
//                          boxset, an album); omitted by a type that derives
//                          its own source line from the snapshot. sourceType
//                          is passed for music, whose three source kinds
//                          (album/playlist/artist) resolve by different routes
//                          — films read the id alone and ignore it.
export function initQueueShellPage(options) {
  mountStatusMenu(['mode', 'screen', 'profile']);
  var media = options.media;
  var loadSourceName = options.loadSourceName;
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    crumb: document.getElementById('queue-crumb'),
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
    queuePlaybackAction(server, media.mediaType, action, state.person, body).catch(noop);
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
    els.body.innerHTML = companionQueueShellHtml(snap, media, sourceTitle);
    Array.prototype.slice.call(els.body.querySelectorAll('button[data-act]')).forEach(wireButton);
    [activeTab].filter(Boolean).forEach(applyTab);
  }

  // The hero's source line names the active source. A type whose source id is
  // opaque (a series/boxset, an album) fetches the title once per distinct
  // source_id and re-renders when it lands; a type that derives its own from
  // the snapshot has no loadSourceName and never fetches.
  function clearSourceTitle() { sourceTitle = ''; }
  function applySourceTitle(id, sourceType) {
    loadSourceName(server, id, sourceType)
      .then(function(title) { sourceTitle = title; render(lastSnap); })
      .catch(noop);
  }
  function ensureSourceTitle(snap) {
    var id = qRouter.sourceId(snap);
    [id !== loadedSourceId].filter(Boolean).forEach(function() {
      loadedSourceId = id;
      clearSourceTitle();
      [id].filter(Boolean).forEach(function(x) { applySourceTitle(x, snap.source_type); });
    });
  }
  var SOURCE_TITLE = { 'true': ensureSourceTitle, 'false': noop };

  // The active person rides the app_state (TASK-158); the POSTs key per
  // person off it, exactly as every other companion action page does.
  function onAppState(snap) {
    [snap.person].filter(Boolean).forEach(function(p) { state.person = p; });
  }

  function onQueuePlayback(payload) {
    [payload.media_type === media.mediaType].filter(Boolean).forEach(function() {
      lastSnap = payload;
      SOURCE_TITLE[!!loadSourceName + ''](payload);
      render(payload);
    });
  }

  // Follow the TV: if it leaves this page's playback context, jump to that
  // companion page (mirrors companion-video). Same-context is a no-op, so the
  // Queue page stays put while playback continues. Browse mode does not follow.
  function followContext(payload) {
    var page = screenPage(payload.context_id);
    [page].filter(function(p) { return p !== options.contextPage; }).forEach(function(p) { window.location.href = p + '.html'; });
  }
  function onContext(payload) {
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
  }

  // The crumb is "‹ Now Playing › Queue" (docs/QUEUE-UX-SHELL.md), rendered
  // rather than hardcoded — the page supplies only its mount.
  [els.crumb].filter(Boolean).forEach(function(el) { el.innerHTML = companionQueueCrumbHtml(); });
  document.getElementById('btn-back').addEventListener('click', function() { window.location.href = options.contextPage + '.html'; });
  document.getElementById('switch-profile').addEventListener('click', function() { api.sendIntent('navigate', switchProfileTarget()); });
  render(null);
  mountSyncBar(mode, onModeChange);
  applyMode();
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { onQueuePlayback: onQueuePlayback, mode: mode });
  updateBar = mountScreenBar(getApi, noop);
}
