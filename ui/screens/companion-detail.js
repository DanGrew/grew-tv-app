import { connect } from '../../core/companion-ws.js';
import { loadManifest } from '../../core/companion-manifest.js';

var SCREEN_TO_PAGE = { resume_prompt: 'video' };
function screenPage(id) { return SCREEN_TO_PAGE[id] || id; }
function titleCase(str) { return str.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }); }

export function initPage() {
  var host = window.location.hostname;
  var connStatus = document.getElementById('conn-status');
  var ctxLabel = document.getElementById('ctx-label');
  var ctxTitle = document.getElementById('ctx-title');
  var actionsEl = document.getElementById('actions');
  var serverUrl = 'http://' + host + ':8765';
  var manifestCache = null;
  var manifestFailed = false;
  var latestPayload = null;

  function tryRender() {
    [latestPayload].filter(Boolean).forEach(function(p) {
      render(p, actionsEl, api.sendIntent, manifestCache, manifestFailed);
    });
  }

  loadManifest(serverUrl)
    .then(function(data) { manifestCache = data; tryRender(); })
    .catch(function() { manifestFailed = true; manifestCache = { content: [] }; tryRender(); });

  var api = connect('ws://' + host + ':8766', function(payload) {
    if (screenPage(payload.context_id) !== 'detail') {
      window.location.href = screenPage(payload.context_id) + '.html';
      return;
    }
    ctxTitle.textContent = (payload.display || {}).title || '';
    ctxLabel.textContent = payload.context_id ? titleCase(payload.context_id) : '';
    latestPayload = payload;
    tryRender();
  }, function(status) { connStatus.textContent = status; });
}

function noContent(actionsEl, text) {
  var p = document.createElement('div');
  p.className = 'no-actions';
  p.textContent = text;
  actionsEl.appendChild(p);
}

function render(payload, actionsEl, sendIntent, manifestCache, manifestFailed) {
  actionsEl.innerHTML = '';
  actionsEl.style.display = 'flex';
  actionsEl.style.flexDirection = 'column';
  actionsEl.style.alignItems = 'center';
  var filmId = payload.film_id;
  if (manifestFailed) { noContent(actionsEl, 'Unable to load'); return; }
  if (!filmId || !manifestCache) { noContent(actionsEl, 'No content'); return; }
  var film = (manifestCache.content || []).filter(function(f) { return f.id === filmId; })[0];
  if (!film) { noContent(actionsEl, 'No content'); return; }
  var contentBasePath = (manifestCache.contentBase || '').replace(/^https?:\/\/[^/]+/, '');
  var items = film.items || [];
  if (items.length === 0) { noContent(actionsEl, 'No content'); return; }
  items.forEach(function(item) {
    var poster = ([item.poster].filter(Boolean).concat([film.poster].filter(Boolean)))[0];
    var btn = document.createElement('button');
    btn.className = 'tile-btn';
    var img = document.createElement('img');
    img.src = window.location.origin + contentBasePath + poster;
    img.alt = item.label || item.title || '';
    btn.appendChild(img);
    var span = document.createElement('span');
    span.textContent = item.label || item.title || titleCase(item.id);
    btn.appendChild(span);
    btn.addEventListener('click', function() { sendIntent('play', { id: item.id }); });
    actionsEl.appendChild(btn);
  });
}
