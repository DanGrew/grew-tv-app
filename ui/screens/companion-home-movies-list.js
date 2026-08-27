import { connect } from '../../core/companion-ws.js';
import { loadBrowse, mediaUrl } from '../../core/app-api.js';
import { itemMediaType, queueAdd, queueAddStatus } from '../../core/queue-shell-config.js';
import { screenPage } from '../../core/companion-utils.js';
import { episodeLabel } from '../../core/detail-view.js';
import { homeMoviesListItems, homeMoviesListTitle } from '../../core/home-rails.js';
import { fmt } from '../../core/time.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';
import { mountStatusMenu } from './companion-status-menu.js';
import { mountRowStep } from './companion-row-step.js';

// TASK-486 (revision) / TASK-491 — the companion mirror of
// screen-home-movies-list-page.js (FEAT-017/028 mirror invariant): the same
// scoped clip list (All, a kid, or a month), built off the SAME
// core/home-rails.js homeMoviesListItems/homeMoviesListTitle
// the TV screen uses, so the two can never disagree about which clips are in
// scope. A "▶ Play All" header button (mirrors companion-detail's Play-next)
// plus one row per clip with a ＋ Queue control (mirrors companion-detail's
// videoTrackNode) — tapping a row or the header drives the TV via `play`/
// `play_next` intents, greyed while desynced (they drive the TV); ＋ Queue is a
// per-person POST, live in both modes (mirrors every other queue control).
export function initPage() {
  mountStatusMenu(['mode', 'row', 'screen', 'profile']);
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxTitle: document.getElementById('ctx-title'),
    actionsEl: document.getElementById('actions')
  };
  // homeMoviesPerson/homeMoviesMonth start undefined (never null) so the
  // FIRST context/URL capture of the 'All' scope (a legitimate null for
  // both) still counts as a change — captureScope's own dedupe below only
  // drops a REPEAT of the same value, per field. scopeCaptured is a plain
  // flag (not `person !== undefined || month !== undefined`, which would be
  // cyclomatic-2 here) set by either capture block below.
  var state = { homeMoviesPerson: undefined, homeMoviesMonth: undefined, scopeCaptured: false, profile: null, person: null, model: { title: '', items: [] } };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }
  var applyRowStepMode = mountRowStep(mode, getApi);

  function mountCrumbs(title) {
    mountCompanionBreadcrumb('breadcrumb', buildCrumbs('home-movies-list', { title: title }), function(page, params) { api.sendIntent('navigate', { page: page, params: params }); });
  }

  var statusTimer = null;
  function hideStatus() { document.getElementById('add-status').style.display = 'none'; }
  function showStatus(text) {
    var el = document.getElementById('add-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(hideStatus, 2500);
  }
  // TASK-516 — the phone's own per-clip ＋Queue, on the same TASK-498 unified
  // engine the TV list now posts to (queue-shell-config.js's routing map).
  // It fed the old video-playback queue, which nothing reads any more.
  // BUG-531 — the CLIP's own itemType names the Queue, not this screen.
  function queueVideo(item) {
    var mediaType = itemMediaType(item.video.itemType);
    queueAdd(server, mediaType, state.person, item.video.id)
      .then(function() { showStatus(queueAddStatus(mediaType)); })
      .catch(function() { showStatus('Could not queue.'); });
  }
  function queueBtn(item) {
    var b = document.createElement('button');
    b.className = 'detail-queue-btn';
    b.setAttribute('data-queue', item.video.id);
    b.textContent = '＋ Queue';
    b.addEventListener('click', function() { queueVideo(item); });
    return b;
  }

  function posterImg(posterName) {
    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    var src = mediaUrl(server, posterName);
    ({
      true: function() {
        img.src = src;
        img.addEventListener('error', function() { img.style.display = 'none'; });
      },
      false: function() { img.style.display = 'none'; }
    })[String(!!src)]();
    return img;
  }

  function clipBtn(item) {
    var video = item.video;
    var btn = document.createElement('button');
    btn.className = 'tile-btn';
    btn.setAttribute('data-id', video.id);
    btn.classList.toggle('desync-off', mode.isDesynced());
    var sub = [video.duration].filter(Boolean).map(function(d) { return '<span class="t-sub">' + fmt(d) + '</span>'; }).concat([''])[0];
    btn.appendChild(posterImg(video.poster));
    btn.insertAdjacentHTML('beforeend', '<div class="t-info"><span class="t-label">' + episodeLabel(item) + '</span>' + sub + '</div>');
    btn.addEventListener('click', function() { api.sendIntent('play', { id: video.id }); });
    return btn;
  }

  function clipRow(item) {
    var row = document.createElement('div');
    row.className = 'detail-track-row';
    row.appendChild(clipBtn(item));
    row.appendChild(queueBtn(item));
    return row;
  }

  function playAllBtn() {
    var btn = document.createElement('button');
    btn.className = 'play-next-btn';
    btn.textContent = '▶ Play All';
    btn.classList.toggle('desync-off', mode.isDesynced());
    btn.addEventListener('click', function() { api.sendIntent('play_next'); });
    return btn;
  }

  function renderList() {
    els.actionsEl.appendChild(playAllBtn());
    state.model.items.forEach(function(item) { els.actionsEl.appendChild(clipRow(item)); });
  }
  function renderNoContent() {
    var p = document.createElement('div');
    p.className = 'no-actions';
    p.textContent = 'No clips';
    els.actionsEl.appendChild(p);
  }
  var RENDER = { 'true': renderList, 'false': renderNoContent };
  function render() { els.actionsEl.innerHTML = ''; RENDER[(state.model.items.length > 0) + ''](); }

  // Home Movies cards need BOTH the scope (context) and the profile (app_state,
  // picks the catalog); they can arrive in either order, so load only once
  // a scope field has been captured (person and month are mutually exclusive
  // — exactly one Play All tile sets one — so only one field ever leaves its
  // undefined sentinel for a given entry) and re-load if the profile changes.
  function loadClips() {
    [state.profile].filter(Boolean).filter(function() { return state.scopeCaptured; }).forEach(function(profile) {
      loadBrowse(server, profile)
        .then(function(b) {
          var cards = [b.content].filter(Boolean).concat([[]])[0];
          state.model = { title: homeMoviesListTitle(state.homeMoviesPerson, state.homeMoviesMonth), items: homeMoviesListItems(cards, state.homeMoviesPerson, state.homeMoviesMonth) };
          els.ctxTitle.textContent = state.model.title;
          mountCrumbs(state.model.title);
          render();
        })
        .catch(function() { state.model = { title: homeMoviesListTitle(state.homeMoviesPerson, state.homeMoviesMonth), items: [] }; render(); });
    });
  }

  // TASK-491 — payload now always carries BOTH home_movies_person and
  // home_movies_month (mirroring the TV screen's own sendContext), so each
  // field is captured/deduped independently, same terms as the pre-existing
  // person-only capture.
  function captureScope(payload) {
    [payload.home_movies_person].filter(function(p) { return p !== undefined; }).filter(function(p) { return p !== state.homeMoviesPerson; }).forEach(function(p) {
      state.homeMoviesPerson = p;
      state.scopeCaptured = true;
      loadClips();
    });
    [payload.home_movies_month].filter(function(m) { return m !== undefined; }).filter(function(m) { return m !== state.homeMoviesMonth; }).forEach(function(m) {
      state.homeMoviesMonth = m;
      state.scopeCaptured = true;
      loadClips();
    });
  }

  function followContext(payload) {
    var page = screenPage(payload.context_id);
    var ROUTE = {
      'true':  function() { window.location.href = page + '.html'; },
      'false': function() { captureScope(payload); }
    };
    ROUTE[(page !== 'home-movies-list') + '']();
  }
  function onContext(payload) {
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
  }

  function onAppState(snap) {
    state.person = [snap.person].filter(Boolean).concat([state.person])[0];
    [snap.profile].filter(Boolean).filter(function(p) { return p !== state.profile; }).forEach(function(p) {
      state.profile = p;
      loadClips();
    });
  }

  function reSync() { window.location.reload(); }
  function applySwitchProfile() { document.getElementById('switch-profile').classList.toggle('desync-off', mode.isDesynced()); }
  function onToggle(desynced) {
    applySwitchProfile();
    applyRowStepMode();
    ({ true: render, false: reSync })[desynced]();
  }

  document.getElementById('switch-profile').addEventListener('click', function() { api.sendIntent('navigate', switchProfileTarget()); });
  mountSyncBar(mode, onToggle);
  applySwitchProfile();
  // Desynced entry: browse linked here with the tile's own navParams
  // (?homeMoviesAll=1, ?homeMoviesPerson=<slug>, or ?homeMoviesMonth=<yearMonth>
  // — companion-browse.js openItemLocal), so seed the scope ourselves rather
  // than waiting for the TV's context echo (which won't come while
  // desynced). Both scope fields are always passed together (mirroring the
  // TV screen's own sendContext shape) so state.homeMoviesPerson/Month never
  // stay at their undefined sentinel for a desynced entry.
  [new URLSearchParams(window.location.search).get('homeMoviesPerson')].filter(Boolean).forEach(function(p) { captureScope({ home_movies_person: p, home_movies_month: null }); });
  [new URLSearchParams(window.location.search).get('homeMoviesMonth')].filter(Boolean).forEach(function(m) { captureScope({ home_movies_person: null, home_movies_month: m }); });
  [new URLSearchParams(window.location.search).get('homeMoviesAll')].filter(Boolean).forEach(function() { captureScope({ home_movies_person: null, home_movies_month: null }); });
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { mode: mode });
  updateBar = mountScreenBar(getApi, noop);
}
