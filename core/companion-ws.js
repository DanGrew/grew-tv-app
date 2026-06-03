import { MESSAGE_TYPES, createIntent, createSnapshotRequest, isStaleContext } from './ws-protocol.js';

export function connect(wsUrl, onContext, onStatus) {
  var ws = null;
  var currentVersion = -1;
  var lastPingTime = Date.now();

  function send(data) {
    [ws].filter(Boolean).forEach(function(s) {
      [s.readyState === WebSocket.OPEN].filter(Boolean).forEach(function() {
        s.send(JSON.stringify(data));
      });
    });
  }

  function sendIntent(intent, params) { send(createIntent(intent, params)); }

  function handleMsg(msg) {
    var HANDLERS = {
      snapshot: function() {
        [msg.payload].filter(function(p) { return !isStaleContext(p, { version: currentVersion }); }).forEach(function(p) {
          currentVersion = p.version;
          onContext(p);
        });
      },
      context: function() {
        [msg.payload].filter(function(p) { return !isStaleContext(p, { version: currentVersion }); }).forEach(function(p) {
          currentVersion = p.version;
          onContext(p);
        });
      },
      ping: function() {
        lastPingTime = Date.now();
        send({ type: MESSAGE_TYPES.PONG });
      }
    };
    [HANDLERS[msg.type]].filter(Boolean).forEach(function(fn) { fn(); });
  }

  function doConnect() {
    ws = new WebSocket(wsUrl);
    ws.onopen = function() {
      [onStatus].filter(Boolean).forEach(function(fn) { fn('connected'); });
      send(createSnapshotRequest());
    };
    ws.onmessage = function(e) { handleMsg(JSON.parse(e.data)); };
    ws.onclose = function() {
      [onStatus].filter(Boolean).forEach(function(fn) { fn('reconnecting\u2026'); });
      setTimeout(doConnect, 2000);
    };
    ws.onerror = function() {
      [onStatus].filter(Boolean).forEach(function(fn) { fn('error'); });
    };
  }

  setInterval(function() {
    [ws].filter(Boolean).forEach(function(s) {
      [Date.now() - lastPingTime > 20000].filter(Boolean).forEach(function() { s.close(); });
    });
  }, 5000);

  doConnect();
  return { sendIntent: sendIntent };
}
