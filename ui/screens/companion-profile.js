import { connect } from '../../core/companion-ws.js';

var SCREEN_TO_PAGE = { resume_prompt: 'video' };
function screenPage(id) { return SCREEN_TO_PAGE[id] || id; }
function titleCase(str) { return str.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }); }

export function initPage() {
  var host = window.location.hostname;
  var connStatus = document.getElementById('conn-status');
  var ctxLabel = document.getElementById('ctx-label');
  var ctxTitle = document.getElementById('ctx-title');
  var actionsEl = document.getElementById('actions');

  var api = connect('ws://' + host + ':8766', function(payload) {
    if (screenPage(payload.context_id) !== 'profile') {
      window.location.href = screenPage(payload.context_id) + '.html';
      return;
    }
    ctxTitle.textContent = (payload.display || {}).title || '';
    ctxLabel.textContent = payload.context_id ? titleCase(payload.context_id) : '';
    render(actionsEl, api.sendIntent);
  }, function(status) { connStatus.textContent = status; });
}

function render(actionsEl, sendIntent) {
  actionsEl.innerHTML = '';
  actionsEl.style.display = '';
  actionsEl.style.flexDirection = '';
  [['Kids', 'kids'], ['Adults', 'adults']].forEach(function(pair) {
    var btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = pair[0];
    btn.addEventListener('click', function() { sendIntent(pair[1]); });
    actionsEl.appendChild(btn);
  });
}
