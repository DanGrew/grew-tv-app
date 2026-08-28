import { getParam, getProfile, getPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { buildDetailList, detailArrow, detailLeft, detailRight, focusFirstDetailRow } from './screen-detail.js';
import { connectApp } from '../../core/app-ws.js';
import { loadSeries, loadContinueWatching } from '../../core/app-api.js';
import { itemMediaType, queueAdd, queueAddStatus } from '../../core/queue-shell-config.js';
import { progressMapFromCW } from '../../core/progress.js';
import { primaryAction, playNextLabel } from '../../core/series-detail.js';
import { collectionMetaLine } from '../../core/detail-view.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// Backend = page origin, not a hardcoded host (BUG-009 — see screen-video-page).
var SERVER = window.location.origin;

export function initDetailPage() {
  var seriesId = getParam('series');
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var state = { series: { items: [] }, progress: {} };

  // resume = start where the backend left off (the row default); restart = from 0.
  // TASK-542: `collectionType` rides along so the player knows whether this
  // detail page is a TV series or a film boxset — detail.html/loadSeries serve
  // both through the same `?series=` param, and which queue the collection
  // opens is now the difference between them. Read at call time (every play
  // happens after the load), off the collection the page already holds.
  var PLAY_PARAMS = {
    resume:  function(id) { return { video: id, series: seriesId, collectionType: state.series.collectionType, from: 'detail' }; },
    restart: function(id) { return { video: id, series: seriesId, collectionType: state.series.collectionType, from: 'detail', restart: '1' }; }
  };
  function play(item, mode) { navTo('video.html', PLAY_PARAMS[mode](item.video.id)); }
  function onPlayItem(item, i, mode) { play(item, mode); }

  // Header action: continue the most-recent episode while it is still mid-watch,
  // otherwise the next one (wraps at the series end). Resume mode replays from the
  // backend position — the mid-watch point for continue, 0 for a fresh episode.
  function playNext() {
    var idx = primaryAction(state.series.items, state.progress).index;
    [state.series.items[idx]].filter(Boolean).forEach(function(item) { play(item, 'resume'); });
  }

  function goBack(e) { [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); }); navTo('browse.html'); }

  // FEAT-040/TASK-249 — per-episode "＋ Queue" on a video series
  // (TV or a film boxset — detail.html/loadSeries serve both identically).
  // TASK-503: this series/boxset detail list is ALWAYS driven by the TASK-498
  // unified queue engine now (screen-video-page's MODE_ENGINE, matching
  // queue_catalog_source.py's series/boxset/standalone catalog sources) —
  // POSTs queue-item to the unified engine, never the old video engine,
  // which that player no longer reads at all (queueing there silently queued to
  // nothing). The durable queue (TASK-247) keeps it across source swaps and the
  // persistent player shows it as Up next. A transient toast confirms.
  // BUG-531 — the last ＋ producer still naming its media type by hand, and the
  // last one posting around queueAdd(). The EPISODE's own itemType names the
  // Queue now, and the press goes through THE ＋Queue producer like the other
  // twelve. TASK-542 split TV series out and this followed the map unchanged:
  // the same list ＋'s an episode to the TV Series Queue and a boxset film to
  // the Films Queue, deciding neither for itself.
  // BUG-530 — and its confirmation now comes from queue-shell-config too. It was
  // the last hand-written one: it said "Queued to Play Next" while the press
  // appended, and read differently from the companion mirror's toast on this very
  // same list (companion-detail's queueVideo).
  var statusTimer = null;
  function hideStatus() { document.getElementById('queue-status').style.display = 'none'; }
  function showStatus(text) {
    var el = document.getElementById('queue-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(hideStatus, 2500);
  }
  function queueVideo(item) {
    var mediaType = itemMediaType(item.video.itemType);
    queueAdd(SERVER, mediaType, getPerson(), item.video.id)
      .then(function() { showStatus(queueAddStatus(mediaType)); })
      .catch(function() { showStatus('Could not queue.'); });
  }

  var wsApp = connectApp(window.location.origin, function(intent, params) {
    var INTENTS = {
      navigate_up:   function() { detailArrow({ key: 'ArrowUp',   preventDefault: function() {} }); },
      navigate_down: function() { detailArrow({ key: 'ArrowDown', preventDefault: function() {} }); },
      play_next:     function() { playNext(); },
      play:          function() {
        // Resolve the episode from series state by id and play it directly, so a
        // companion-driven play works regardless of the TV's active season (BUG-025):
        // the TV renders only the active season's rows, so clicking a `.detail-row`
        // missed a cross-season id and fell back to activeElement = S1E1. id + member
        // -> play it; no id -> play focused (legacy); id but not a member -> no-op.
        var id = [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)[0];
        var item = state.series.items.filter(function(it) { return it.video.id === id; })[0];
        ({
          true:  function() { [item].filter(Boolean).forEach(function(it) { play(it, 'resume'); }); },
          false: function() { document.activeElement.click(); }
        })[Boolean(id)]();
      },
      back:          function() { goBack(null); },
      navigate:      function() { navTo(params.page, params.params); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'detail', series_id: seriesId });
  // Live snapshot so the companion renders this series' context (TASK-118).
  wsApp.sendAppState({ screen: 'detail', itemId: seriesId, profile: profile });

  document.getElementById('btn-play-next').addEventListener('click', playNext);
  document.addEventListener('keydown', dispatchKey);

  initPage({
    onEnter: focusFirstDetailRow,
    keys: {
      Escape:     function(e) { goBack(e); },
      Backspace:  function(e) { goBack(e); },
      ArrowUp:    detailArrow,
      ArrowDown:  detailArrow,
      ArrowLeft:  detailLeft,
      ArrowRight: detailRight
    },
    remote: {}
  });

  Promise.all([
    loadSeries(SERVER, seriesId),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      state.series = res[0];
      state.progress = progressMapFromCW(res[1].content);
      mountBreadcrumb('breadcrumb', buildCrumbs('detail', { seriesId: seriesId, seriesTitle: state.series.title }));
      document.getElementById('detail-meta').textContent = collectionMetaLine(state.series);
      document.getElementById('btn-play-next').textContent = '▶ ' + playNextLabel(state.series.items, state.progress);
      buildDetailList(SERVER, state.series, state.progress, onPlayItem, null, queueVideo);
      focusFirstDetailRow();
    })
    .catch(function() { navTo('error.html'); });
}
