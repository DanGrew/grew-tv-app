import {
  MESSAGE_TYPES, createIntent, createSnapshotRequest, isStaleContext,
  interpolatePosition,
  createPlayIntent, createSkipIntent, createNextIntent, createPrevIntent,
  createSetProfileIntent, createToggleCaptionsIntent
} from './ws-protocol.js';

export function connect(wsUrl, onContext, onStatus, onAppState) {
  var ws = null;
  var currentVersion = -1;
  var lastPingTime = Date.now();
  var lastAppState = null;     // payload of the most recent app_state snapshot
  var appStateAt = 0;          // local receive time, for skew-free interpolation

  function send(data) {
    [ws].filter(Boolean).forEach(function(s) {
      [s.readyState === WebSocket.OPEN].filter(Boolean).forEach(function() {
        s.send(JSON.stringify(data));
      });
    });
  }

  function sendIntent(intent, params) { send(createIntent(intent, params)); }

  // Interpolated playhead between heartbeats, against the local receive clock.
  function position() {
    return interpolatePosition(lastAppState, (Date.now() - appStateAt) / 1000);
  }

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
      app_state: function() {
        lastAppState = msg.payload;
        appStateAt = Date.now();
        [onAppState].filter(Boolean).forEach(function(fn) { fn(msg.payload); });
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
  return {
    sendIntent: sendIntent,
    position: position,
    appState: function() { return lastAppState; },
    play: function(id) { send(createPlayIntent(id)); },
    skip: function(deltaSec) { send(createSkipIntent(deltaSec)); },
    next: function() { send(createNextIntent()); },
    prev: function() { send(createPrevIntent()); },
    setProfile: function(profile) { send(createSetProfileIntent(profile)); },
    toggleCaptions: function() { send(createToggleCaptionsIntent()); }
  };
}
