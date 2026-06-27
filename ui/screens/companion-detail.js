import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadSeries, loadContinueWatching, mediaUrl, loadBrowse, addToPlaylist } from '../../core/app-api.js';
import { screenPage } from '../../core/companion-utils.js';
import { progressMapFromCW, percent, isMidWatch } from '../../core/progress.js';
import { resumeOf, episodeLabel, progressBarMarkup } from '../../core/detail-view.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { seasonsOf, hasSeasonChips, chipClass, seasonLabel, visibleItems, defaultSeason } from '../../core/seasons.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';

// Companion series context (TASK-118): the episode list with per-episode
// progress + a Play-next button, fetched straight from the backend (catalog +
// progress are backend state). Only the live context — which series the app is
// on, and the profile — arrives over WS. Tapping a row plays it on the TV
// (resume by default); Play next teleports to the next-in-order episode.
export function initPage() {
  var host = window.location.hostname;
  var server = 'http://' + host + ':8765';
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    ctxTitle: document.getElementById('ctx-title'),
    actionsEl: document.getElementById('actions'),
    backBtn: document.getElementById('btn-back')
  };
  var state = { seriesId: null, profile: null, person: null, series: null, progress: {}, activeSeason: null };
  var addState = { trackId: null, statusTimer: null };
  var api = {};
  var updateBar = null;
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }

  els.backBtn.addEventListener('click', function() { api.sendIntent('back'); });

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
    addToPlaylist(server, id, addState.trackId)
      .then(function() { closeAddSheet(); showStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showStatus('Could not add to playlist.'); });
  }
  // New playlist: hand off to the companion create screen (TASK-209, phone <input>)
  // carrying the track id + the live profile, so it is created, the track added,
  // then the playlists list reappears with the new playlist holding it.
  function createNew() {
    window.location.href = 'playlist-create.html?addTrack=' + encodeURIComponent(addState.trackId) +
      '&profile=' + encodeURIComponent(activeProfile());
  }
  function choiceBtn(card) {
    var b = document.createElement('button');
    b.className = 'add-choice';
    b.setAttribute('data-id', card.id);
    b.textContent = card.title;
    b.addEventListener('click', function() { addExisting(card.id, card.title); });
    return b;
  }
  function showAddSheet(cards) {
    var list = document.getElementById('add-sheet-list');
    list.innerHTML = '';
    cards.forEach(function(c) { list.appendChild(choiceBtn(c)); });
    document.getElementById('add-sheet').style.display = 'flex';
  }
  function openAddSheet(item) {
    addState.trackId = item.video.id;
    loadBrowse(server, activeProfile())
      .then(function(res) { showAddSheet(playlistCards([res.content].filter(Boolean).concat([[]])[0])); })
      .catch(function() { showStatus('Could not load playlists.'); });
  }
  function addBtn(item) {
    var b = document.createElement('button');
    b.className = 'detail-add-btn';
    b.setAttribute('data-add', item.video.id);
    b.textContent = '＋ Playlist';
    b.addEventListener('click', function() { openAddSheet(item); });
    return b;
  }

  // Breadcrumb trail (FEAT-021): Home (clickable) > this series (current). Home
  // sends the `navigate` intent so the app teleports the TV back to browse; the
  // companion follows on the app's echoed context.
  function navigate(page, params) { api.sendIntent('navigate', { page: page, params: params }); }
  function mountCrumbs(seriesTitle) {
    mountCompanionBreadcrumb('breadcrumb', buildCrumbs('detail', { seriesTitle: seriesTitle }), navigate);
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
    var mid = isMidWatch(resume, video.duration);
    var posterName = [video.poster, state.series.poster].filter(Boolean)[0];
    var btn = document.createElement('button');
    btn.className = 'tile-btn';
    btn.setAttribute('data-id', video.id);
    btn.appendChild(posterImg(posterName));
    btn.insertAdjacentHTML('beforeend',
      '<span>' + episodeLabel(item) + '</span>' + progressBarMarkup(mid, percent(resume, video.duration), 'ep-progress'));
    btn.addEventListener('click', function() { api.sendIntent('play', { id: video.id }); });
    return btn;
  }

  function playNextBtn() {
    var btn = document.createElement('button');
    btn.className = 'play-next-btn';
    btn.textContent = '▶ Play next';
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

  // An album track is rendered as a row: the existing play tile + a ＋ Playlist
  // control beside it (a <button> can't nest, so they are siblings in a row, as
  // companion-audio does for ＋ Queue). A TV episode renders the bare tile.
  function albumTrackNode(item) {
    var row = document.createElement('div');
    row.className = 'detail-track-row';
    row.appendChild(episodeBtn(item));
    row.appendChild(addBtn(item));
    return row;
  }
  var TRACK_NODE = { 'true': albumTrackNode, 'false': episodeBtn };
  function trackNode(item) { return TRACK_NODE[isAlbum() + ''](item); }

  function renderSeries() {
    els.actionsEl.appendChild(playNextBtn());
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
    els.ctxLabel.textContent = 'Series';
    [payload.series_id].filter(Boolean).filter(function(id) { return id !== state.seriesId; }).forEach(function(id) {
      state.seriesId = id;
      loadSeriesData(id);
    });
  }

  function onContext(payload) {
    var page = screenPage(payload.context_id);
    var ROUTE = {
      'true':  function() { window.location.href = page + '.html'; },
      'false': function() { captureSeries(payload); }
    };
    ROUTE[(page !== 'detail') + '']();
  }

  // The active person keys which Continue-Watching set tints the episode bars
  // (FEAT-026 TASK-158 — person rides the app_state; reloads when it changes).
  function onAppState(snap) {
    state.profile = [snap.profile].filter(Boolean).concat([state.profile])[0];
    [snap.person].filter(Boolean).filter(function(p) { return p !== state.person; }).forEach(function(p) { state.person = p; loadCW(); });
  }

  document.getElementById('btn-add-create').addEventListener('click', createNew);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);

  api = connect(wsUrl(host), onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices);
  updateBar = mountScreenBar(getApi, noop);
}
