import { connect } from '../../core/companion-ws.js';
import { loadManifest } from '../../core/companion-manifest.js';
import { screenPage, titleCase, displayTitle, displayLabel, getContentBasePath } from '../../core/companion-utils.js';

function renderNoContent(actionsEl, text) {
  var p = document.createElement('div');
  p.className = 'no-actions';
  p.textContent = text;
  actionsEl.appendChild(p);
}

function renderFilm(film, actionsEl, sendIntent, basePath) {
  var btn = document.createElement('button');
  btn.className = 'tile-btn';
  var img = document.createElement('img');
  var poster = [film.poster].filter(Boolean).concat([film.id + '.jpg'])[0];
  img.src = window.location.origin + basePath + poster;
  img.alt = [film.title].filter(Boolean).concat([film.id])[0];
  btn.appendChild(img);
  var span = document.createElement('span');
  span.textContent = [film.title].filter(Boolean).concat([titleCase(film.id)])[0];
  btn.appendChild(span);
  btn.addEventListener('click', function() { sendIntent('select', { id: film.id }); });
  actionsEl.appendChild(btn);
}

function render(state, actionsEl, sendIntent) {
  actionsEl.innerHTML = '';
  actionsEl.style.display = 'flex';
  actionsEl.style.flexDirection = 'column';
  actionsEl.style.alignItems = 'center';
  var content = [state.manifestCache].filter(Boolean)
    .map(function(m) { return m.content; }).filter(Boolean).concat([null])[0];
  [!content].filter(Boolean).forEach(function() { renderNoContent(actionsEl, 'Loading content\u2026'); });
  [content].filter(Boolean).filter(function(c) { return c.length === 0; })
    .forEach(function() { renderNoContent(actionsEl, 'No content available'); });
  [content].filter(Boolean).filter(function(c) { return c.length > 0; }).forEach(function(c) {
    var basePath = getContentBasePath(state.manifestCache);
    c.forEach(function(film) { renderFilm(film, actionsEl, sendIntent, basePath); });
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
  var state = { manifestCache: null, latestPayload: null };
  var api = {};
  function getApi() { return api; }

  function tryRender() {
    [state.latestPayload].filter(Boolean).forEach(function() {
      render(state, els.actionsEl, getApi().sendIntent);
    });
  }

  function onContext(payload) {
    var page = screenPage(payload.context_id);
    ({ true: function() { window.location.href = page + '.html'; },
      false: function() {
        state.latestPayload = payload;
        els.ctxTitle.textContent = displayTitle(payload);
        els.ctxLabel.textContent = displayLabel(payload);
        tryRender();
      }
    })[page !== 'browse']();
  }

  loadManifest('http://' + host + ':8765')
    .then(function(data) { state.manifestCache = data; tryRender(); })
    .catch(function() { state.manifestCache = { content: [] }; tryRender(); });

  api = connect('ws://' + host + ':8766', onContext, function(status) { els.connStatus.textContent = status; });
}
