// TASK-367: the disconnected "background mode" companion. No WebSocket, no live
// state — every button is one fire-and-forget fetch() POST to TASK-366's
// /api/quick-intent/{action}, targeting the device the full companion already
// persisted. Reads the key by name (core/companion-ws.js's TARGET_KEY) rather
// than importing companion-ws.js's connect() — this page opens no connection at
// all, so pulling in the WS module would be the wrong coupling.
var TARGET_KEY = 'grew-tv-companion-target';
// TASK-488: set by the Quick Pause button itself in both audio.html and
// video.html, read here by name — not imported — same reasoning as TARGET_KEY
// above: this page opens no connection, so pulling in either companion module
// would be the wrong coupling. No signal (a stale bookmark, or a direct load)
// falls back to 'audio', matching this page's pre-TASK-488 behaviour.
var SOURCE_KEY = 'grew-tv-quickpause-source';
var RECONNECT_HREF = { video: 'video.html', audio: 'audio.html' };

function getTarget() { return localStorage.getItem(TARGET_KEY); }

function getSource() { return [localStorage.getItem(SOURCE_KEY)].filter(Boolean).concat(['audio'])[0]; }

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
  var source = getSource();
  document.body.classList.add('qp-source-' + source);
  els.reconnect.addEventListener('click', function() { window.location.href = RECONNECT_HREF[source]; });
  ({
    true: function() { showControls(els); wireControls(target, els); },
    false: function() { showMessage(els); }
  })[Boolean(target)]();
}
