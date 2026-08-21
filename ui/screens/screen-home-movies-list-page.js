import { getParam, getProfile, getPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { buildDetailList, detailArrow, detailLeft, detailRight, focusFirstDetailRow } from './screen-detail.js';
import { connectApp } from '../../core/app-ws.js';
import { loadBrowse, loadContinueWatching, videoPlaybackAction } from '../../core/app-api.js';
import { progressMapFromCW } from '../../core/progress.js';
import { collectionMetaLine } from '../../core/detail-view.js';
import { homeMoviesListItems, homeMoviesListTitle, homeMoviesListPlayParams } from '../../core/home-rails.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// TASK-486 (revision, owner 2026-08-21) — the Play All rail tile (All or a
// kid) now opens THIS screen first, a plain clip list like a boxset/series
// detail (screen-detail-page.js), rather than starting playback on tap. No
// backend endpoint: the list is assembled client-side from the SAME
// /api/browse cards the Home Movies rails already load (home-rails.js
// homeMoviesListItems), mirroring the artist page's own "option (b)"
// client-assembly (screen-artist-page.js) — so this screen ships standalone,
// no co-deploy with the backend. The header "Play All" button and each row
// both hand off to video.html's existing homeMoviesAll/homeMoviesPerson entry
// (screen-video-page.js), which still owns the actual play-source call — a
// row adds `video` (the tapped clip), read there as an optional item_id,
// exactly how a series episode row already works.
var SERVER = window.location.origin;

export function initHomeMoviesListPage() {
  var person = getParam('homeMoviesPerson');
  var month = getParam('homeMoviesMonth');
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var title = homeMoviesListTitle(person, month);
  var state = { items: [], progress: {} };

  function play(id) { navTo('video.html', homeMoviesListPlayParams(person, id, month)); }
  function onPlayItem(item) { play(item.video.id); }
  function playAll() { play(undefined); }

  function focusFirstRow() { focusFirstDetailRow(); }

  // Back collapses one level — to the Home Movies tab on the browse page.
  function goBack(e) {
    [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); });
    navTo('browse.html', { tab: 'home-movies' });
  }

  // FEAT-040/TASK-249 shape — the per-clip "＋ Queue" control (queue-video,
  // the home-movies domain queue via catalog.is_home_movie), same as a
  // series episode row already gets on the boxset detail screen.
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
    videoPlaybackAction(SERVER, 'queue-video', getPerson(), { video_id: item.video.id })
      .then(function() { showStatus('Queued to Play Next'); })
      .catch(function() { showStatus('Could not queue.'); });
  }

  var wsApp = connectApp(window.location.origin, function(intent, params) {
    var INTENTS = {
      navigate_up:   function() { detailArrow({ key: 'ArrowUp',   preventDefault: function() {} }); },
      navigate_down: function() { detailArrow({ key: 'ArrowDown', preventDefault: function() {} }); },
      play_next:     function() { playAll(); },
      // Resolve the tapped row by id (a flat list — no season split to miss,
      // unlike screen-detail-page's cross-season BUG-025 case) and play it;
      // no id -> play the focused row (legacy fallback, mirrors screen-artist-page).
      play:          function() {
        var id = [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)[0];
        var target = [id].filter(Boolean).map(function(i) { return document.querySelector('.detail-row[data-id="' + i + '"]'); }).filter(Boolean)[0];
        ([target].filter(Boolean).concat([document.activeElement]))[0].click();
      },
      back:          function() { goBack(null); },
      navigate:      function() { navTo(params.page, params.params); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'home-movies-list', home_movies_person: person, home_movies_month: month });
  // Live snapshot so the companion mirrors this list's context.
  wsApp.sendAppState({ screen: 'home-movies-list', homeMoviesPerson: person, homeMoviesMonth: month, profile: profile });

  document.getElementById('btn-play-next').addEventListener('click', playAll);
  document.addEventListener('keydown', dispatchKey);

  initPage({
    onEnter: focusFirstRow,
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
    loadBrowse(SERVER, profile),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      var cards = [res[0].content].filter(Boolean).concat([[]])[0];
      state.items = homeMoviesListItems(cards, person, month);
      state.progress = progressMapFromCW([res[1].content].filter(Boolean).concat([[]])[0]);
      mountBreadcrumb('breadcrumb', buildCrumbs('home-movies-list', { title: title }));
      document.getElementById('detail-title').textContent = title;
      document.getElementById('detail-meta').textContent = collectionMetaLine({ items: state.items, type: 'home' });
      buildDetailList(SERVER, { title: title, items: state.items }, state.progress, onPlayItem, null, queueVideo);
      focusFirstRow();
    })
    .catch(function() { navTo('error.html'); });
}
