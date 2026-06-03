import { connect } from '../../core/companion-ws.js';
import { screenPage, titleCase } from '../../core/companion-utils.js';

export function initPage() {
  var host = window.location.hostname;
  var connStatus = document.getElementById('conn-status');
  var ctxLabel = document.getElementById('ctx-label');
  var ctxTitle = document.getElementById('ctx-title');
  var actionsEl = document.getElementById('actions');

  var api = connect('ws://' + host + ':8766', function(payload) {
    if (screenPage(payload.context_id) !== 'error') {
      window.location.href = screenPage(payload.context_id) + '.html';
      return;
    }
    ctxTitle.textContent = (payload.display || {}).title || '';
    ctxLabel.textContent = payload.context_id ? titleCase(payload.context_id) : '';
    render(payload, actionsEl, api.sendIntent);
  }, function(status) { connStatus.textContent = status; });
}

function render(payload, actionsEl, sendIntent) {
  actionsEl.style.display = '';
  actionsEl.style.flexDirection = '';
  actionsEl.style.alignItems = '';
  var actions = Array.isArray(payload.actions) ? payload.actions : [];
  actionsEl.innerHTML = '';
  [actions.length === 0].filter(Boolean).forEach(function() {
    var p = document.createElement('div');
    p.className = 'no-actions';
    p.textContent = 'No actions available';
    actionsEl.appendChild(p);
  });
  actions.forEach(function(action) {
    var btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = action.label || titleCase(action.id);
    btn.addEventListener('click', function() { sendIntent(action.id); });
    actionsEl.appendChild(btn);
  });
}
