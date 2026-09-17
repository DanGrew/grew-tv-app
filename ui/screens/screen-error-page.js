import { navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { connectApp } from '../../core/app-ws.js';
import { installErrorReporter } from '../../core/error-reporter.js';
import { helpCard } from './help-card.js';

// The error screen's own page module — the same shape every other TV page has
// (`app/homeview/*.html` imports and calls one init). It moved out of the page's
// inline script in TASK-633, when the Info card took that block past the 30-line
// inline cap; nothing about what the screen does changed.
export function initErrorPage() {
  installErrorReporter(window);   // app-wide JS-error capture (TASK-213); this page has no device badge

  function retry() { document.getElementById('btn-retry').click(); }

  document.getElementById('btn-retry').addEventListener('click', function() { navTo('profile.html'); });

  var wsApp = connectApp('ws://localhost:8766', function(intent) {
    var INTENTS = {
      back:   function() { navTo('profile.html'); },
      select: retry,
      retry:  retry
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'error' });
  document.addEventListener('keydown', dispatchKey);
  initPage({
    onEnter: function() { document.getElementById('btn-retry').focus(); },
    keys: {
      Enter: function(e) { e.preventDefault(); retry(); }
    },
    remote: {
      select: retry,
      back:   retry
    },
    help: 'error',
    card: helpCard
  });
}
