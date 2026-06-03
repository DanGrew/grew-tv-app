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
  var latestPayload = null;

  function tryRender() {
    [latestPayload].filter(Boolean).forEach(function() {
      render(actionsEl, api.sendIntent, manifestCache, serverUrl);
    });
  }

  loadManifest(serverUrl)
    .then(function(data) { manifestCache = data; tryRender(); })
    .catch(function() { manifestCache = { content: [] }; tryRender(); });

  var api = connect('ws://' + host + ':8766', function(payload) {
    if (screenPage(payload.context_id) !== 'browse') {
      window.location.href = screenPage(payload.context_id) + '.html';
      return;
    }
    ctxTitle.textContent = (payload.display || {}).title || '';
    ctxLabel.textContent = payload.context_id ? titleCase(payload.context_id) : '';
    latestPayload = payload;
    tryRender();
  }, function(status) { connStatus.textContent = status; });
}

function render(actionsEl, sendIntent, manifestCache, serverUrl) {
  actionsEl.innerHTML = '';
  actionsEl.style.display = 'flex';
  actionsEl.style.flexDirection = 'column';
  actionsEl.style.alignItems = 'center';
  var content = manifestCache ? manifestCache.content || [] : null;
  [!content].filter(Boolean).forEach(function() {
    var p = document.createElement('div');
    p.className = 'no-actions';
    p.textContent = 'Loading content\u2026';
    actionsEl.appendChild(p);
  });
  [content && content.length === 0].filter(Boolean).forEach(function() {
    var p = document.createElement('div');
    p.className = 'no-actions';
    p.textContent = 'No content available';
    actionsEl.appendChild(p);
  });
  var contentBasePath = (manifestCache && manifestCache.contentBase || '').replace(/^https?:\/\/[^/]+/, '');
  [content || []].filter(function(c) { return c.length > 0; }).forEach(function(c) {
    c.forEach(function(film) {
      var btn = document.createElement('button');
      btn.className = 'tile-btn';
      var img = document.createElement('img');
      img.src = window.location.origin + contentBasePath + (film.poster || film.id + '.jpg');
      img.alt = film.title || film.id;
      btn.appendChild(img);
      var span = document.createElement('span');
      span.textContent = film.title || titleCase(film.id);
      btn.appendChild(span);
      btn.addEventListener('click', function() { sendIntent('select', { id: film.id }); });
      actionsEl.appendChild(btn);
    });
  });
}
