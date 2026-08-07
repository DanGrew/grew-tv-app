// TASK-367: the disconnected "background mode" companion. No WebSocket, no live
// state — every button is one fire-and-forget fetch() POST to TASK-366's
// /api/quick-intent/{action}, targeting the device the full companion already
// persisted. Reads the key by name (core/companion-ws.js's TARGET_KEY) rather
// than importing companion-ws.js's connect() — this page opens no connection at
// all, so pulling in the WS module would be the wrong coupling.
var TARGET_KEY = 'grew-tv-companion-target';

function getTarget() { return localStorage.getItem(TARGET_KEY); }

function postIntent(deviceId, action) {
  fetch('/api/quick-intent/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId })
  }).catch(function() {});
}

function showControls(els) {
  els.message.style.display = 'none';
  els.controls.style.display = 'flex';
}

function showMessage(els) {
  els.controls.style.display = 'none';
  els.message.style.display = 'flex';
}

function wireControls(deviceId, els) {
  els.prev.addEventListener('click', function() { postIntent(deviceId, 'previous'); });
  els.toggle.addEventListener('click', function() { postIntent(deviceId, 'toggle'); });
  els.next.addEventListener('click', function() { postIntent(deviceId, 'next'); });
}

export function initPage() {
  var els = {
    message: document.getElementById('qp-message'),
    controls: document.getElementById('qp-controls'),
    prev: document.getElementById('qp-prev'),
    toggle: document.getElementById('qp-toggle'),
    next: document.getElementById('qp-next'),
    reconnect: document.getElementById('qp-reconnect')
  };
  var target = getTarget();
  els.reconnect.addEventListener('click', function() { window.location.href = 'audio.html'; });
  ({
    true: function() { showControls(els); wireControls(target, els); },
    false: function() { showMessage(els); }
  })[Boolean(target)]();
}
