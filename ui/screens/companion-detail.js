import { connect } from '../../core/companion-ws.js';
import { loadManifest } from '../../core/companion-manifest.js';
import { screenPage, titleCase, displayTitle, displayLabel, getContentBasePath } from '../../core/companion-utils.js';

function renderNoContent(actionsEl, text) {
  var p = document.createElement('div');
  p.className = 'no-actions';
  p.textContent = text;
  actionsEl.appendChild(p);
}

function renderItem(item, film, actionsEl, sendIntent, basePath) {
  var poster = [item.poster].filter(Boolean).concat([film.poster].filter(Boolean)).concat([''])[0];
  var btn = document.createElement('button');
  btn.className = 'tile-btn';
  var img = document.createElement('img');
  img.src = window.location.origin + basePath + poster;
  img.alt = [item.label, item.title].filter(Boolean).concat([''])[0];
  btn.appendChild(img);
  var span = document.createElement('span');
  span.textContent = [item.label, item.title].filter(Boolean).concat([titleCase(item.id)])[0];
  btn.appendChild(span);
  btn.addEventListener('click', function() { sendIntent('play', { id: item.id }); });
  actionsEl.appendChild(btn);
}

function renderFilmItems(film, actionsEl, sendIntent, manifestCache) {
  var basePath = getContentBasePath(manifestCache);
  var items = [film.items].filter(Boolean).concat([[]])[0];
  [items.length === 0].filter(Boolean).forEach(function() { renderNoContent(actionsEl, 'No content'); });
  [items].filter(function(i) { return i.length > 0; }).forEach(function(i) {
    i.forEach(function(item) { renderItem(item, film, actionsEl, sendIntent, basePath); });
  });
}

function renderForFilm(filmId, state, actionsEl, sendIntent) {
  var content = [state.manifestCache].filter(Boolean)
    .map(function(m) { return m.content; }).filter(Boolean).concat([[]])[0];
  var film = content.filter(function(f) { return f.id === filmId; })[0];
  [!film].filter(Boolean).forEach(function() { renderNoContent(actionsEl, 'No content'); });
  [film].filter(Boolean).forEach(function(f) { renderFilmItems(f, actionsEl, sendIntent, state.manifestCache); });
}

function render(payload, state, actionsEl, sendIntent) {
  actionsEl.innerHTML = '';
  actionsEl.style.display = 'flex';
  actionsEl.style.flexDirection = 'column';
  actionsEl.style.alignItems = 'center';
  [state.manifestFailed].filter(Boolean).forEach(function() { renderNoContent(actionsEl, 'Unable to load'); });
  [!state.manifestFailed].filter(Boolean).forEach(function() {
    [!payload.film_id].filter(Boolean).forEach(function() { renderNoContent(actionsEl, 'No content'); });
    [payload.film_id].filter(Boolean).forEach(function(fid) { renderForFilm(fid, state, actionsEl, sendIntent); });
  });
}

export function initPage() {
  var host = window.location.hostname;
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    ctxTitle: document.getElementById('ctx-title'),
    actionsEl: document.getElementById('actions')
  };
  var state = { manifestCache: null, manifestFailed: false, latestPayload: null };
  var api = {};
  function getApi() { return api; }

  function tryRender() {
    [state.latestPayload].filter(Boolean).forEach(function(p) {
      render(p, state, els.actionsEl, getApi().sendIntent);
    });
  }

  function onContext(payload) {
    var page = screenPage(payload.context_id);
    { true: function() { window.location.href = page + '.html'; },
      false: function() {
        state.latestPayload = payload;
        els.ctxTitle.textContent = displayTitle(payload);
        els.ctxLabel.textContent = displayLabel(payload);
        tryRender();
      }
    }[page !== 'detail']();
  }

  loadManifest('http://' + host + ':8765')
    .then(function(data) { state.manifestCache = data; tryRender(); })
    .catch(function() { state.manifestFailed = true; state.manifestCache = { content: [] }; tryRender(); });

  api = connect('ws://' + host + ':8766', onContext, function(status) { els.connStatus.textContent = status; });
}
