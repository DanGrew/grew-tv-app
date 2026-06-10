import {
  MESSAGE_TYPES, createAppState,
  createRegisterDevice, createActivatePerson
} from './ws-protocol.js';
import { ensureDevice, getDeviceLabel, getPerson, navTo } from './state.js';
import { switchProfileTarget } from './switch-profile.js';

// connectApp(wsUrl, onIntent, opts?) — opts carries the FEAT-026 Phase 2
// (TASK-158) verdict callbacks without breaking the (wsUrl, onIntent) callers:
//   opts.onDeactivated()           — this screen was taken over elsewhere
//   opts.onPersonActive(payload)   — activate_person succeeded (picker proceeds)
//   opts.onPersonBusy(payload)     — person is live on another screen (take-over)
export function connectApp(wsUrl, onIntent, opts) {
  var o = opts != null ? opts : {};
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
  // The active person is stamped centrally (TASK-158) so every emitter — incl.
  // the player's heartbeats — carries it; a targeting companion keys its
  // Continue-Watching reads per person off this (closes the TASK-155 debt).
  function sendAppState(snapshot) {
    var s = snapshot != null ? snapshot : {};
    var withPerson = Object.assign({}, s, { person: s.person != null ? s.person : getPerson() });
    var msg = createAppState(withPerson);
    lastAppState = msg;
    send(msg);
  }

  // Assert this device's lock on a person (TASK-158). Used by the picker to gate
  // on the server verdict (person_active / person_busy), and on every (re)connect
  // to re-assert the current person (idempotent server-side when already owner).
  function activatePerson(personId, takeover) {
    [personId].filter(Boolean).forEach(function(pid) {
      send(createActivatePerson(ensureDevice(), pid, takeover));
    });
  }

  // Default take-over response: drop to the person picker (the connection stays
  // open server-side; the picker reload re-registers this device with no active
  // person). A screen may override via opts.onDeactivated (e.g. the picker).
  function defaultDeactivated() {
    var t = switchProfileTarget();
    navTo(t.page, t.params);
  }

  function handleMsg(msg) {
    var HANDLERS = {
      intent: function() {
        [onIntent].filter(Boolean).forEach(function(fn) { fn(msg.payload.intent, msg.payload.params); });
      },
      person_active: function() {
        [o.onPersonActive].filter(Boolean).forEach(function(fn) { fn(msg.payload); });
      },
      person_busy: function() {
        [o.onPersonBusy].filter(Boolean).forEach(function(fn) { fn(msg.payload); });
      },
      deactivated: function() {
        [o.onDeactivated].filter(Boolean).concat([defaultDeactivated])[0](msg.payload);
      },
      ping: function() {
        lastPingTime = Date.now();
        send({ type: MESSAGE_TYPES.PONG });
      }
    };
    [HANDLERS[msg.type]].filter(Boolean).forEach(function(fn) { fn(); });
  }

  // On every (re)connect register the durable device first, re-assert the active
  // person, then replay cached context/app_state. Registration precedes state so
  // the backend can address this screen's app_state.
  function doConnect() {
    ws = new WebSocket(wsUrl);
    ws.onopen    = function() {
      send(createRegisterDevice(ensureDevice(), getDeviceLabel()));
      activatePerson(getPerson(), false);
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
  return { sendContext: sendContext, sendAppState: sendAppState, activatePerson: activatePerson };
}
