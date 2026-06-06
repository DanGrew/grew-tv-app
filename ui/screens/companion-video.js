import { connect } from '../../core/companion-ws.js';
import { loadManifest } from '../../core/companion-manifest.js';
import { screenPage, skipLabel, displayTitle, displayLabel, getContentBasePath } from '../../core/companion-utils.js';

var FALLBACK_VIDEO_ACTIONS = [
  'skip_back_10','skip_back_30','skip_back_120','skip_back_300','skip_back_900','skip_back_1800',
  'skip_fwd_10','skip_fwd_30','skip_fwd_120','skip_fwd_300','skip_fwd_900','skip_fwd_1800'
];

function buildSkipBtn(actionId, sendIntent, showMain) {
  var btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.textContent = skipLabel(actionId);
  btn.addEventListener('click', function() { sendIntent(actionId); showMain(); });
  return btn;
}

function showSkipOptions(prefix, actions, actionsEl, sendIntent, showMain) {
  actionsEl.innerHTML = '';
  var returnBtn = document.createElement('button');
  returnBtn.className = 'action-btn';
  returnBtn.textContent = '\u2190 Back';
  returnBtn.addEventListener('click', showMain);
  actionsEl.appendChild(returnBtn);
  actions.filter(function(a) { return a.indexOf(prefix) === 0; })
    .forEach(function(actionId) { actionsEl.appendChild(buildSkipBtn(actionId, sendIntent, showMain)); });
}

function buildCtrlBtn(actions, prefix, showFn, actionsEl) {
  var has = actions.some(function(a) { return a.indexOf(prefix) === 0; });
  var btn = document.createElement('button');
  btn.className = 'ctrl-btn';
  [!has].filter(Boolean).forEach(function() { btn.setAttribute('aria-disabled', 'true'); });
  [has].filter(Boolean).forEach(function() { btn.addEventListener('click', showFn); });
  return btn;
}

function renderVideo(payload, actionsEl, sendIntent, manifestCache) {
  var display = [payload.display].filter(Boolean).concat([{}])[0];
  var id = display.id;
  var title = [display.title].filter(Boolean).concat([''])[0];
  var received = [payload.actions].filter(Array.isArray).filter(function(a) { return a.length > 0; })[0];
  var actions = [received].filter(Boolean).concat([FALLBACK_VIDEO_ACTIONS])[0];

  function showMain() {
    actionsEl.innerHTML = '';
    actionsEl.style.display = 'flex';
    actionsEl.style.flexDirection = 'column';
    actionsEl.style.alignItems = '';

    [id].filter(Boolean).forEach(function(itemId) {
      var img = document.createElement('img');
      img.className = 'video-thumb';
      img.src = window.location.origin + getContentBasePath(manifestCache) + itemId + '.jpg';
      img.alt = title;
      actionsEl.appendChild(img);
    });

    [title].filter(Boolean).forEach(function(t) {
      var div = document.createElement('div');
      div.className = 'video-title';
      div.textContent = t;
      actionsEl.appendChild(div);
    });

    var ctrlRow = document.createElement('div');
    ctrlRow.className = 'ctrl-row';
    var btnBack = buildCtrlBtn(actions, 'skip_back_', function() { showSkipOptions('skip_back_', actions, actionsEl, sendIntent, showMain); }, actionsEl);
    btnBack.textContent = '\u00ab';
    var btnToggle = document.createElement('button');
    btnToggle.className = 'ctrl-btn';
    btnToggle.textContent = '\u23ef';
    btnToggle.addEventListener('click', function() { sendIntent('toggle'); });
    var btnFwd = buildCtrlBtn(actions, 'skip_fwd_', function() { showSkipOptions('skip_fwd_', actions, actionsEl, sendIntent, showMain); }, actionsEl);
    btnFwd.textContent = '\u00bb';
    ctrlRow.appendChild(btnBack);
    ctrlRow.appendChild(btnToggle);
    ctrlRow.appendChild(btnFwd);
    actionsEl.appendChild(ctrlRow);

    var backBtn = document.createElement('button');
    backBtn.className = 'action-btn';
    backBtn.textContent = '\u2190 Back';
    backBtn.addEventListener('click', function() { sendIntent('back'); });
    actionsEl.appendChild(backBtn);
  }

  showMain();
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
    [state.latestPayload].filter(Boolean).forEach(function(p) {
      [p.context_id === 'video'].filter(Boolean).forEach(function() {
        renderVideo(p, els.actionsEl, getApi().sendIntent, state.manifestCache);
      });
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
    })[page !== 'video']();
  }

  loadManifest('http://' + host + ':8765')
    .then(function(data) { state.manifestCache = data; tryRender(); })
    .catch(function() { state.manifestCache = { contentBase: '' }; tryRender(); });

  api = connect('ws://' + host + ':8766', onContext, function(status) { els.connStatus.textContent = status; });
}
