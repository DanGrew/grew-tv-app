import { connect } from '../../core/companion-ws.js';
import { loadSeries, loadContinueWatching, mediaUrl } from '../../core/app-api.js';
import { screenPage } from '../../core/companion-utils.js';
import { progressMapFromCW, percent, isMidWatch } from '../../core/progress.js';
import { resumeOf, episodeLabel, progressBarMarkup } from '../../core/detail-view.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';

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
  var state = { seriesId: null, profile: null, series: null, progress: {} };
  var api = {};

  els.backBtn.addEventListener('click', function() { api.sendIntent('back'); });

  // Breadcrumb trail (FEAT-021): Home (clickable) > this series (current). Home
  // sends the `navigate` intent so the app teleports the TV back to browse; the
  // companion follows on the app's echoed context.
  function navigate(page, params) { api.sendIntent('navigate', { page: page, params: params }); }
  function mountCrumbs(seriesTitle) {
    mountCompanionBreadcrumb('breadcrumb', buildCrumbs('detail', { seriesTitle: seriesTitle }), navigate);
  }

  function episodeBtn(item) {
    var video = item.video;
    var resume = resumeOf(state.progress[video.id]);
    var mid = isMidWatch(resume, video.duration);
    var posterName = [video.poster, state.series.poster].filter(Boolean)[0];
    var btn = document.createElement('button');
    btn.className = 'tile-btn';
    btn.setAttribute('data-id', video.id);
    btn.innerHTML = '<img src="' + mediaUrl(server, posterName) + '" alt="">' +
      '<span>' + episodeLabel(item) + '</span>' + progressBarMarkup(mid, percent(resume, video.duration), 'ep-progress');
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

  function renderSeries() {
    els.actionsEl.appendChild(playNextBtn());
    state.series.items.forEach(function(item) { els.actionsEl.appendChild(episodeBtn(item)); });
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
      .then(function(s) { state.series = s; els.ctxTitle.textContent = s.title; mountCrumbs(s.title); render(); })
      .catch(function() { state.series = null; render(); });
  }

  function loadCW(profile) {
    loadContinueWatching(server, profile)
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

  // Profile drives which Continue-Watching set tints the episode bars.
  function onAppState(snap) {
    [snap.profile].filter(Boolean).filter(function(p) { return p !== state.profile; }).forEach(function(p) { state.profile = p; loadCW(p); });
  }

  api = connect('ws://' + host + ':8766', onContext, function(status) { els.connStatus.textContent = status; }, onAppState);
}
