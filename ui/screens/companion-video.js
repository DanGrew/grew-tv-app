import { connect } from '../../core/companion-ws.js';
import { loadManifest } from '../../core/companion-manifest.js';
import { screenPage, titleCase, skipLabel } from '../../core/companion-utils.js';

var FALLBACK_VIDEO_ACTIONS = [
  'skip_back_10','skip_back_30','skip_back_120','skip_back_300','skip_back_900','skip_back_1800',
  'skip_fwd_10','skip_fwd_30','skip_fwd_120','skip_fwd_300','skip_fwd_900','skip_fwd_1800'
];

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
    [latestPayload].filter(Boolean).forEach(function(p) {
      [p.context_id === 'resume_prompt'].filter(Boolean).forEach(function() {
        renderResumePrompt(actionsEl, api.sendIntent);
      });
      [p.context_id === 'video'].filter(Boolean).forEach(function() {
        renderVideo(p, actionsEl, api.sendIntent, manifestCache);
      });
    });
  }

  loadManifest(serverUrl)
    .then(function(data) { manifestCache = data; tryRender(); })
    .catch(function() { manifestCache = { contentBase: '' }; tryRender(); });

  var api = connect('ws://' + host + ':8766', function(payload) {
    if (screenPage(payload.context_id) !== 'video') {
      window.location.href = screenPage(payload.context_id) + '.html';
      return;
    }
    ctxTitle.textContent = (payload.display || {}).title || '';
    ctxLabel.textContent = payload.context_id ? titleCase(payload.context_id) : '';
    latestPayload = payload;
    tryRender();
  }, function(status) { connStatus.textContent = status; });
}

function renderResumePrompt(actionsEl, sendIntent) {
  actionsEl.innerHTML = '';
  actionsEl.style.display = '';
  actionsEl.style.flexDirection = '';
  actionsEl.style.alignItems = '';
  var row = document.createElement('div');
  row.className = 'ctrl-row';
  row.style.marginTop = '40px';
  var btnResume = document.createElement('button');
  btnResume.className = 'ctrl-btn';
  btnResume.textContent = 'Resume';
  btnResume.addEventListener('click', function() { sendIntent('resume'); });
  var btnRestart = document.createElement('button');
  btnRestart.className = 'ctrl-btn';
  btnRestart.textContent = 'Restart';
  btnRestart.addEventListener('click', function() { sendIntent('restart'); });
  row.appendChild(btnResume);
  row.appendChild(btnRestart);
  actionsEl.appendChild(row);
}

function renderVideo(payload, actionsEl, sendIntent, manifestCache) {
  var display = payload.display || {};
  var id = display.id;
  var title = display.title || '';
  var received = [payload.actions].filter(Array.isArray).filter(function(a) { return a.length > 0; })[0];
  var actions = [received, FALLBACK_VIDEO_ACTIONS].filter(Boolean)[0];

  function showSkipOptions(prefix) {
    actionsEl.innerHTML = '';
    var filtered = actions.filter(function(a) { return a.indexOf(prefix) === 0; });
    var returnBtn = document.createElement('button');
    returnBtn.className = 'action-btn';
    returnBtn.textContent = '\u2190 Back';
    returnBtn.addEventListener('click', showMain);
    actionsEl.appendChild(returnBtn);
    filtered.forEach(function(actionId) {
      var btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.textContent = skipLabel(actionId);
      btn.addEventListener('click', function() { sendIntent(actionId); showMain(); });
      actionsEl.appendChild(btn);
    });
  }

  function showMain() {
    actionsEl.innerHTML = '';
    actionsEl.style.display = 'flex';
    actionsEl.style.flexDirection = 'column';
    actionsEl.style.alignItems = '';

    [id].filter(Boolean).forEach(function(itemId) {
      var img = document.createElement('img');
      img.className = 'video-thumb';
      var contentBasePath = (manifestCache && manifestCache.contentBase || '').replace(/^https?:\/\/[^/]+/, '');
      img.src = window.location.origin + contentBasePath + itemId + '.jpg';
      img.alt = title;
      actionsEl.appendChild(img);
    });

    [title].filter(Boolean).forEach(function(t) {
      var div = document.createElement('div');
      div.className = 'video-title';
      div.textContent = t;
      actionsEl.appendChild(div);
    });

    var hasBack = actions.some(function(a) { return a.indexOf('skip_back_') === 0; });
    var hasFwd  = actions.some(function(a) { return a.indexOf('skip_fwd_')  === 0; });

    var ctrlRow = document.createElement('div');
    ctrlRow.className = 'ctrl-row';

    var btnSkipBack = document.createElement('button');
    btnSkipBack.className = 'ctrl-btn';
    btnSkipBack.textContent = '\u00ab';
    [!hasBack].filter(Boolean).forEach(function() { btnSkipBack.setAttribute('aria-disabled', 'true'); });
    [hasBack].filter(Boolean).forEach(function() {
      btnSkipBack.addEventListener('click', function() { showSkipOptions('skip_back_'); });
    });

    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'ctrl-btn';
    toggleBtn.textContent = '\u23ef';
    toggleBtn.addEventListener('click', function() { sendIntent('toggle'); });

    var btnSkipFwd = document.createElement('button');
    btnSkipFwd.className = 'ctrl-btn';
    btnSkipFwd.textContent = '\u00bb';
    [!hasFwd].filter(Boolean).forEach(function() { btnSkipFwd.setAttribute('aria-disabled', 'true'); });
    [hasFwd].filter(Boolean).forEach(function() {
      btnSkipFwd.addEventListener('click', function() { showSkipOptions('skip_fwd_'); });
    });

    ctrlRow.appendChild(btnSkipBack);
    ctrlRow.appendChild(toggleBtn);
    ctrlRow.appendChild(btnSkipFwd);
    actionsEl.appendChild(ctrlRow);

    var backBtn = document.createElement('button');
    backBtn.className = 'action-btn';
    backBtn.textContent = '\u2190 Back';
    backBtn.addEventListener('click', function() { sendIntent('back'); });
    actionsEl.appendChild(backBtn);
  }

  showMain();
}
