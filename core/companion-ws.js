import {
  MESSAGE_TYPES, createIntent, createSnapshotRequest, isStaleContext,
  interpolatePosition,
  createListDevices, createRegisterCompanion,
  createPlayIntent, createSkipIntent, createNextIntent, createPrevIntent,
  createSetProfileIntent, createToggleCaptionsIntent,
  createShuffleIntent, createPlayAlbumIntent
} from './ws-protocol.js';

// FEAT-026 Phase 2 (TASK-158): a companion targets ONE screen (device_id) and
// survives that screen's person-switch — routing is by the live
// device -> active_person on the backend, so no reconnect/re-register is needed
// when the TV flips person. The chosen target persists per device.
var TARGET_KEY = 'grew-tv-companion-target';

export function connect(wsUrl, onContext, onStatus, onAppState, onDevices) {
  var ws = null;
  var currentVersion = -1;
  var lastPingTime = Date.now();
  var lastAppState = null;     // payload of the most recent app_state snapshot
  var appStateAt = 0;          // local receive time, for skew-free interpolation
  var targeted = null;         // device_id we are currently registered against
  var lastDevices = [];        // most recent screen list (for the UI chooser)

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

  function getTarget() { return localStorage.getItem(TARGET_KEY); }

  // Register as this device's companion, then ask for its current state. Called
  // on (auto)target and when the UI picks a screen. Persists the choice.
  function registerFor(deviceId) {
    targeted = deviceId;
    localStorage.setItem(TARGET_KEY, deviceId);
    send(createRegisterCompanion(deviceId));
    send(createSnapshotRequest());
  }

  // Pick a target from the live list. A persisted choice STAYS chosen: re-bind
  // to it only when it is actually present, and otherwise wait (null) — never
  // silently fail over to a different sole screen just because the chosen one is
  // momentarily absent. (Its own screen's profile->browse reconnect briefly
  // dropped it from the list; the old `ids.length === 1` fallback then grabbed
  // the OTHER screen, mis-binding the companion — empty browse + misrouted
  // intents, FEAT-026.) Auto-target a sole screen only when nothing is chosen.
  function autoTarget(devices) {
    var ids = devices.map(function(d) { return d.device_id; });
    var persisted = getTarget();
    if (persisted) return ids.indexOf(persisted) >= 0 ? persisted : null;
    if (ids.length === 1) return ids[0];
    return null;
  }

  function onDevicesMsg(devices) {
    lastDevices = devices;
    var pick = autoTarget(devices);
    // Register only when the pick changes our target — a pushed devices update
    // for an unchanged target (e.g. the screen flipped person) must NOT
    // re-register, so the companion rides the switch with no drop.
    if (pick && pick !== targeted) registerFor(pick);
    // Notify the UI AFTER (auto)targeting so the screen chooser reads the freshly
    // bound `targeted` and renders the current screen, not a transient "pick a
    // screen" for a sole screen it is about to auto-target (TASK-179).
    [onDevices].filter(Boolean).forEach(function(fn) { fn(devices); });
  }

  function applyContext(p) {
    [p].filter(function(c) { return !isStaleContext(c, { version: currentVersion }); }).forEach(function(c) {
      currentVersion = c.version;
      onContext(c);
    });
  }

  function handleMsg(msg) {
    var HANDLERS = {
      snapshot: function() { applyContext(msg.payload); },
      context: function() { applyContext(msg.payload); },
      devices: function() { onDevicesMsg([msg.payload.devices].filter(Boolean).concat([[]])[0]); },
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
      // Reconnect drops our server-side companion registration — force a fresh
      // register on the next devices reply by clearing the local target marker.
      targeted = null;
      send(createListDevices());
    };
    ws.onmessage = function(e) { handleMsg(JSON.parse(e.data)); };
    ws.onclose = function() {
      [onStatus].filter(Boolean).forEach(function(fn) { fn('reconnecting…'); });
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
    devices: function() { return lastDevices; },
    currentTarget: function() { return targeted; },
    target: registerFor,
    play: function(id) { send(createPlayIntent(id)); },
    skip: function(deltaSec) { send(createSkipIntent(deltaSec)); },
    next: function() { send(createNextIntent()); },
    prev: function() { send(createPrevIntent()); },
    setProfile: function(profile) { send(createSetProfileIntent(profile)); },
    toggleCaptions: function() { send(createToggleCaptionsIntent()); },
    shuffle: function() { send(createShuffleIntent()); },
    playAlbum: function(id) { send(createPlayAlbumIntent(id)); }
  };
}
