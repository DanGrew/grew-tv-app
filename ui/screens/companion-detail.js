import { connect } from '../../core/companion-ws.js';
import { loadSeries, loadContinueWatching, mediaUrl, loadBrowse, addToPlaylist, addSourceToPlaylist, playbackAction, videoPlaybackAction } from '../../core/app-api.js';
import { screenPage, queryString } from '../../core/companion-utils.js';
import { progressMapFromCW, percent, rowMidWatch } from '../../core/progress.js';
import { resumeOf, episodeLabel, progressBarMarkup } from '../../core/detail-view.js';
import { fmt } from '../../core/time.js';
import { buildCrumbs, trailCrumbs } from '../../core/breadcrumb.js';
import { peek as peekTrail, trimOnCrumb } from '../../core/nav-trail.js';
import { seasonsOf, hasSeasonChips, chipClass, seasonLabel, visibleItems, defaultSeason } from '../../core/seasons.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';

// Companion series context (TASK-118): the episode list with per-episode
// progress + a Play-next button, fetched straight from the backend (catalog +
// progress are backend state). Only the live context — which series the app is
// on, and the profile — arrives over WS. Tapping a row plays it on the TV
// (resume by default); Play next teleports to the next-in-order episode.
export function initPage() {
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxTitle: document.getElementById('ctx-title'),
    actionsEl: document.getElementById('actions')
  };
  var state = { seriesId: null, profile: null, person: null, series: null, progress: {}, activeSeason: null };
  var addState = { add: null, queue: null, createHref: '', statusTimer: null };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }

  // FEAT-032 (TASK-218) / BUG-021: the breadcrumb is built from the recorded nav
  // trail's top — whatever it is. Opened from an artist's albums page, the top is
  // that artist entry (Home › ELO › album); reached through a rail, the top is the
  // browse rail entry (Home › Continue Watching › series). Either way trailCrumbs
  // shows that level and a tap retraces it. Only an empty trail (deep-link / fresh
  // session) falls back to the static Home › series.
  // TASK-243: there is no visible Back button on any detail screen — the breadcrumb
  // is the sole on-screen back affordance.
  // FEAT-036/TASK-207 — "Add to playlist" on the companion, the PRACTICAL build
  // surface (a phone has a real keyboard + easy track browsing). The mirror of the
  // app's album-detail Add sheet (screen-album-detail-page): each ALBUM track row
  // gains a ＋ Playlist control that opens a touch sheet listing the active
  // profile's playlists (loadBrowse already profile-filters, so every card is a
  // valid target — core/playlist-pick) plus New playlist + Cancel. Picking POSTs
  // add-track; New playlist hands off to the companion create screen carrying the
  // track id. Album-only: a TV series (collectionType !== 'album') never offers it,
  // matching the app wiring the control only on album/artist track contexts. The
  // companion's profile-filtered playlist list is the Music drill of companion-
  // browse — there is no standalone playlists list to reuse, so the sheet fetches
  // browse itself, exactly as the app sheet does.
  function isAlbum() {
    return [state.series].filter(Boolean).filter(function(s) { return s.collectionType === 'album'; }).length > 0;
  }
  function activeProfile() { return [state.profile].filter(Boolean).concat(['adults'])[0]; }

  function hideStatus() { document.getElementById('add-status').style.display = 'none'; }
  // Transient confirmation toast — fades after 2.5s; a fresh add clears the prior
  // timer so a rapid second toast restarts the clock (mirrors the app sheet).
  function showStatus(text) {
    var el = document.getElementById('add-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(addState.statusTimer);
    addState.statusTimer = setTimeout(hideStatus, 2500);
  }
  function closeAddSheet() { document.getElementById('add-sheet').style.display = 'none'; }
  function addExisting(id, title) {
    addState.add(id)
      .then(function() { closeAddSheet(); showStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showStatus('Could not add to playlist.'); });
  }
  // New playlist: hand off to the companion create screen (TASK-209, phone <input>)
  // carrying the pending add (a track id, OR a bulk source for TASK-212) + the live
  // profile, so it is created, the add applied, then the list reappears holding it.
  function createNew() { window.location.href = addState.createHref; }
  function choiceBtn(card) {
    var b = document.createElement('button');
    b.className = 'add-choice';
    b.setAttribute('data-id', card.id);
    b.textContent = '♪ ' + card.title;
    b.addEventListener('click', function() { addExisting(card.id, card.title); });
    return b;
  }
  // TASK-253 — the sheet's top option: "▶ Play Next" (queue the track), above the
  // playlist cards. Present only for the per-TRACK sheet (openAddSheet sets
  // addState.queue); the album-level "Add all" sheet leaves it null. NOT `.add-choice`
  // so the playlist-list assertions stay clean.
  function queueChoiceBtn() {
    var b = document.createElement('button');
    b.className = 'add-queue';
    b.textContent = '☰ Play Next';
    b.addEventListener('click', addState.queue);
    return b;
  }
  function showAddSheet(cards) {
    var list = document.getElementById('add-sheet-list');
    list.innerHTML = '';
    [addState.queue].filter(Boolean).forEach(function() { list.appendChild(queueChoiceBtn()); });
    cards.forEach(function(c) { list.appendChild(choiceBtn(c)); });
    document.getElementById('add-sheet').style.display = 'flex';
  }
  function loadAndShowSheet() {
    loadBrowse(server, activeProfile())
      .then(function(res) { showAddSheet(playlistCards([res.content].filter(Boolean).concat([[]])[0])); })
      .catch(function() { showStatus('Could not load playlists.'); });
  }
  // Per-track: the single ＋ opens the sheet for ONE track — Play Next on top, then
  // the playlist cards (TASK-207 + TASK-253).
  function openAddSheet(item) {
    addState.add = function(id) { return addToPlaylist(server, id, item.video.id); };
    addState.queue = function() { queueThenClose(item); };
    addState.createHref = 'playlist-create.html?addTrack=' + encodeURIComponent(item.video.id) +
      '&profile=' + encodeURIComponent(activeProfile());
    loadAndShowSheet();
  }
  // Album-level "Add all to playlist" (TASK-212): snapshot the WHOLE album as a
  // source. Same sheet, but each pick POSTs add-source instead of add-track, and no
  // Play Next option (queue null — a per-track action).
  function openAddAllSheet() {
    addState.add = function(id) { return addSourceToPlaylist(server, id, 'album', state.seriesId); };
    addState.queue = null;
    addState.createHref = 'playlist-create.html?addSourceType=album&addSourceId=' + encodeURIComponent(state.seriesId) +
      '&profile=' + encodeURIComponent(activeProfile());
    loadAndShowSheet();
  }
  function addBtn(item) {
    var b = document.createElement('button');
    b.className = 'detail-add-btn';
    b.setAttribute('data-add', item.video.id);
    b.textContent = '＋';
    b.addEventListener('click', function() { openAddSheet(item); });
    return b;
  }
  // FEAT-040/TASK-248 — queue a track to PLAY NEXT. A per-person POST (queue-track),
  // so it works in BOTH modes: in Browse the play tile greys but this stays live
  // (like the sheet itself). The durable override queue (TASK-246) keeps it across
  // album swaps. TASK-253: now the sheet's top "▶ Play Next" action (no standalone
  // per-row button) — closes the sheet first, then POSTs.
  function queueTrack(item) {
    playbackAction(server, 'queue-track', state.person, { track_id: item.video.id })
      .then(function() { showStatus('Queued to Play Next'); })
      .catch(function() { showStatus('Could not queue track.'); });
  }
  function queueThenClose(item) { closeAddSheet(); queueTrack(item); }
  // FEAT-040/TASK-249 — the VIDEO ＋ Queue: a series episode queues to the separate
  // video queue (queue-video, distinct from the music queue-track above). Same
  // per-person POST ⇒ works in BOTH modes (the play tile greys in Browse, this
  // stays live); the durable queue (TASK-247) keeps it across source swaps.
  function queueVideo(item) {
    videoPlaybackAction(server, 'queue-video', state.person, { video_id: item.video.id })
      .then(function() { showStatus('Queued to Play Next'); })
      .catch(function() { showStatus('Could not queue.'); });
  }
  function videoQueueBtn(item) {
    var b = document.createElement('button');
    b.className = 'detail-queue-btn';
    b.setAttribute('data-queue', item.video.id);
    b.textContent = '＋ Queue';
    b.addEventListener('click', function() { queueVideo(item); });
    return b;
  }
  // The album-level control, rendered once above the track list (album context
  // only — a TV series has no playlist semantics).
  function appendAddAllBtn() {
    var b = document.createElement('button');
    b.className = 'add-all-btn';
    b.id = 'btn-add-all';
    b.textContent = '＋ Add all to playlist';
    b.addEventListener('click', openAddAllSheet);
    els.actionsEl.appendChild(b);
  }
  function maybeAddAll() { ({ 'true': appendAddAllBtn, 'false': noop })[isAlbum() + ''](); }

  // Breadcrumb trail (FEAT-021): Home (clickable) > this series (current). Home
  // sends the `navigate` intent so the app teleports the TV back to browse; the
  // companion follows on the app's echoed context.
  // SYNCED: breadcrumb navigation drives the TV (navigate intent). DESYNCED: hop
  // locally instead, carrying any params as a query string.
  function localGo(page, params) { window.location.href = page + queryString(params); }
  function navigate(page, params) {
    // Trim the trail to the clicked ancestor (Home clears) so a later Back can't
    // retrace past this jump (FEAT-032 stale-Back fix).
    trimOnCrumb(page, params);
    ({ true: function() { localGo(page, params); }, false: function() { api.sendIntent('navigate', { page: page, params: params }); } })[mode.isDesynced()]();
  }
  function mountCrumbs(seriesTitle) {
    mountCompanionBreadcrumb('breadcrumb', ({ true: trailCrumbs(peekTrail(), seriesTitle), false: buildCrumbs('detail', { seriesTitle: seriesTitle }) })[Boolean(peekTrail())], navigate);
  }

  // Poster <img> with a load-failure fallback: a missing/abortive poster hides
  // the image rather than showing a broken icon (matches companion-browse and
  // the app's tile.js). loading="lazy" trims the initial poster request burst.
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

  function episodeBtn(item) {
    var video = item.video;
    var resume = resumeOf(state.progress[video.id]);
    var mid = rowMidWatch(isAlbum(), resume, video.duration);
    var posterName = [video.poster, state.series.poster].filter(Boolean)[0];
    var btn = document.createElement('button');
    btn.className = 'tile-btn';
    btn.setAttribute('data-id', video.id);
    // Playing a track/episode drives the TV -> greyed when desynced (no dead
    // click; the WS layer also no-ops the intent). The ＋ Playlist button beside
    // it stays live (per-person add, both modes).
    btn.classList.toggle('desync-off', mode.isDesynced());
    var subHtml = [video.duration].filter(Boolean).map(function(d) { return '<span class="t-sub">' + fmt(d) + '</span>'; }).concat([''])[0];
    btn.appendChild(posterImg(posterName));
    btn.insertAdjacentHTML('beforeend',
      '<div class="t-info"><span class="t-label">' + episodeLabel(item) + '</span>' + subHtml +
      progressBarMarkup(mid, percent(resume, video.duration), 'ep-progress') + '</div>');
    btn.addEventListener('click', function() { api.sendIntent('play', { id: video.id }); });
    return btn;
  }

  function playNextBtn() {
    var btn = document.createElement('button');
    btn.className = 'play-next-btn';
    btn.textContent = '▶ Play next';
    btn.classList.toggle('desync-off', mode.isDesynced());
    btn.addEventListener('click', function() { api.sendIntent('play_next'); });
    return btn;
  }

  // Season chips (TASK-123): mirror the app's season selector. Tapping a chip
  // re-renders the list filtered to that season (companion is touch — a full
  // re-render is fine, no focus to preserve). A series with no seasons[] keeps
  // the flat episode list.
  function pickSeason(season) { state.activeSeason = season; render(); }

  function seasonChip(s) {
    var btn = document.createElement('button');
    btn.className = chipClass(s.season, state.activeSeason);
    btn.setAttribute('data-season', s.season);
    btn.textContent = seasonLabel(s.season);
    btn.addEventListener('click', function() { pickSeason(s.season); });
    return btn;
  }

  function appendChipRow() {
    var row = document.createElement('div');
    row.className = 'season-chips';
    seasonsOf(state.series).forEach(function(s) { row.appendChild(seasonChip(s)); });
    els.actionsEl.appendChild(row);
  }

  function renderSeasonChips() {
    ({ 'true': appendChipRow, 'false': noop })[hasSeasonChips(state.series) + '']();
  }

  // An album track row: the play tile + a single ＋ control beside it (TASK-253,
  // was ＋ Playlist and ＋ Queue side by side — they crowded the track text). The ＋
  // opens the add sheet whose top option is ▶ Play Next (queue), playlist cards
  // below. A <button> can't nest, so they are siblings in a row.
  function albumTrackNode(item) {
    var row = document.createElement('div');
    row.className = 'detail-track-row';
    row.appendChild(episodeBtn(item));
    row.appendChild(addBtn(item));
    return row;
  }
  // A video series episode is the play tile + a ＋ Queue (VIDEO queue) beside it —
  // no ＋ Playlist (playlists are music-only). FEAT-040/TASK-249.
  function videoTrackNode(item) {
    var row = document.createElement('div');
    row.className = 'detail-track-row';
    row.appendChild(episodeBtn(item));
    row.appendChild(videoQueueBtn(item));
    return row;
  }
  var TRACK_NODE = { 'true': albumTrackNode, 'false': videoTrackNode };
  function trackNode(item) { return TRACK_NODE[isAlbum() + ''](item); }

  function renderSeries() {
    els.actionsEl.appendChild(playNextBtn());
    maybeAddAll();
    renderSeasonChips();
    visibleItems(state.series.items, state.activeSeason).forEach(function(e) { els.actionsEl.appendChild(trackNode(e.item)); });
  }

  function renderNoContent() {
    var p = document.createElement('div');
    p.className = 'no-actions';
    p.textContent = 'No content';
    els.actionsEl.appendChild(p);
  }

  var RENDER = { 'true': renderSeries, 'false': renderNoContent };
  function render() { els.actionsEl.innerHTML = ''; RENDER[!!state.series + ''](); }

  function loadSeriesData(seriesId) {
    loadSeries(server, seriesId)
      .then(function(s) { state.series = s; state.activeSeason = defaultSeason(s.items, state.progress, seasonsOf(s)); els.ctxTitle.textContent = s.title; mountCrumbs(s.title); render(); })
      .catch(function() { state.series = null; render(); });
  }

  function loadCW() {
    loadContinueWatching(server, state.profile, state.person)
      .then(function(c) { state.progress = progressMapFromCW([c.content].filter(Boolean).concat([[]])[0]); render(); })
      .catch(function() { state.progress = {}; render(); });
  }

  function captureSeries(payload) {
    [payload.series_id].filter(Boolean).filter(function(id) { return id !== state.seriesId; }).forEach(function(id) {
      state.seriesId = id;
      loadSeriesData(id);
    });
  }

  function followContext(payload) {
    var page = screenPage(payload.context_id);
    var ROUTE = {
      'true':  function() { window.location.href = page + '.html'; },
      'false': function() { captureSeries(payload); }
    };
    ROUTE[(page !== 'detail') + '']();
  }
  // The status strip title rides the context (both modes); only the nav-follow is
  // gated — desynced, it stays on the page browse opened locally.
  function onContext(payload) {
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
  }

  // The active person keys which Continue-Watching set tints the episode bars
  // (FEAT-026 TASK-158 — person rides the app_state; reloads when it changes).
  // The TV status strip reads the same snapshot (display-only, both modes).
  function onAppState(snap) {
    state.profile = [snap.profile].filter(Boolean).concat([state.profile])[0];
    [snap.person].filter(Boolean).filter(function(p) { return p !== state.person; }).forEach(function(p) { state.person = p; loadCW(); });
  }

  // Toggle: going DESYNCED re-renders to grey the play controls; going SYNCED
  // re-runs the reconnect path (reload) to snap back to the TV.
  function reSync() { window.location.reload(); }
  function onToggle(desynced) { ({ true: render, false: reSync })[desynced](); }

  document.getElementById('btn-add-create').addEventListener('click', createNew);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);

  mountSyncBar(mode, onToggle);
  // Desynced entry: browse linked here with ?id=…, so load that collection
  // ourselves rather than waiting for the TV's context echo (which won't come).
  [new URLSearchParams(window.location.search).get('id')].filter(Boolean).forEach(function(id) {
    state.seriesId = id;
    loadSeriesData(id);
  });
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { mode: mode });
  updateBar = mountScreenBar(getApi, noop);
}
