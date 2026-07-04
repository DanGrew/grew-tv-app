import { connect } from '../../core/companion-ws.js';
import { screenPage, titleCase, displayTitle, displayLabel } from '../../core/companion-utils.js';

function renderAction(action, actionsEl, sendIntent) {
  var btn = document.createElement('button');
  btn.className = 'action-btn';
  btn.textContent = [action.label].filter(Boolean).concat([titleCase(action.id)])[0];
  btn.addEventListener('click', function() { sendIntent(action.id); });
  actionsEl.appendChild(btn);
}

function render(payload, actionsEl, sendIntent) {
  actionsEl.innerHTML = '';
  actionsEl.style.display = '';
  actionsEl.style.flexDirection = '';
  actionsEl.style.alignItems = '';
  var actions = [payload.actions].filter(Array.isArray).concat([[]])[0];
  [actions.length === 0].filter(Boolean).forEach(function() {
    var p = document.createElement('div');
    p.className = 'no-actions';
    p.textContent = 'No actions available';
    actionsEl.appendChild(p);
  });
  actions.forEach(function(action) { renderAction(action, actionsEl, sendIntent); });
}

export function initPage() {
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    ctxTitle: document.getElementById('ctx-title'),
    actionsEl: document.getElementById('actions')
  };
  var api = {};
  function getApi() { return api; }

  function onContext(payload) {
    var page = screenPage(payload.context_id);
    ({ true: function() { window.location.href = page + '.html'; },
      false: function() {
        els.ctxTitle.textContent = displayTitle(payload);
        els.ctxLabel.textContent = displayLabel(payload);
        render(payload, els.actionsEl, getApi().sendIntent);
      }
    })[page !== 'error']();
  }

  api = connect(window.location.origin, onContext, function(status) { els.connStatus.textContent = status; });
}
