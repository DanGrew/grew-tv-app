import { MESSAGE_TYPES, createAppState } from './ws-protocol.js';

export function connectApp(wsUrl, onIntent) {
  var ws = null;
  var lastPingTime = Date.now();
  var pendingContext = null;
  var lastAppState = null;

  function send(data) {
    [ws].filter(Boolean).forEach(function(s) {
      [s.readyState === WebSocket.OPEN].filter(Boolean).forEach(function() {
        s.send(JSON.stringify(data));
      });
    });
  }

  function sendContext(payload) {
    pendingContext = payload;
    send({ type: 'context_push', payload: payload });
  }

  // Full snapshot, app -> companion. Cached so reconnect re-syncs the companion.
  function sendAppState(snapshot) {
    var msg = createAppState(snapshot);
    lastAppState = msg;
    send(msg);
  }

  function handleMsg(msg) {
    var HANDLERS = {
      intent: function() {
        [onIntent].filter(Boolean).forEach(function(fn) { fn(msg.payload.intent, msg.payload.params); });
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
    ws.onopen    = function() {
      [pendingContext].filter(Boolean).forEach(function(ctx) { send({ type: 'context_push', payload: ctx }); });
      [lastAppState].filter(Boolean).forEach(function(msg) { send(msg); });
    };
    ws.onmessage = function(e) { handleMsg(JSON.parse(e.data)); };
    ws.onclose   = function() { setTimeout(doConnect, 2000); };
    ws.onerror   = function() {};
  }

  setInterval(function() {
    [ws].filter(Boolean).forEach(function(s) {
      [Date.now() - lastPingTime > 20000].filter(Boolean).forEach(function() { s.close(); });
    });
  }, 5000);

  doConnect();
  return { sendContext: sendContext, sendAppState: sendAppState };
}
