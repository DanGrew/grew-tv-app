import { connect } from '../../core/companion-ws.js';
import { screenPage, displayTitle, displayLabel } from '../../core/companion-utils.js';

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

export function initPage() {
  var host = window.location.hostname;
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
    { true: function() { window.location.href = page + '.html'; },
      false: function() {
        els.ctxTitle.textContent = displayTitle(payload);
        els.ctxLabel.textContent = displayLabel(payload);
        render(els.actionsEl, getApi().sendIntent);
      }
    }[page !== 'profile']();
  }

  api = connect('ws://' + host + ':8766', onContext, function(status) { els.connStatus.textContent = status; });
}
