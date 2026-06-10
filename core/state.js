import { loadSettings, saveSettings } from './app-api.js';
import { uuid } from './ws-protocol.js';

// Durable device identity (FEAT-026 TASK-158): WHICH screen this is, independent
// of who is watching. Minted once and set-and-forget (like grew-tv-profile), it
// is the companion's routing target and the key the backend addresses app_state /
// intent to. The optional label is a device-local friendly name for the
// companion's screen list; a generic 'Screen · {short-id}' stands in when unset.
export function getDevice() {
  return localStorage.getItem('grew-tv-device');
}

export function ensureDevice() {
  var id = getDevice();
  if (id) return id;
  id = uuid();
  localStorage.setItem('grew-tv-device', id);
  return id;
}

export function getDeviceLabel() {
  var label = localStorage.getItem('grew-tv-device-label');
  if (label) return label;
  return 'Screen · ' + ensureDevice().slice(0, 4);
}

export function setDeviceLabel(label) {
  localStorage.setItem('grew-tv-device-label', label);
}

export function getProfile() {
  return localStorage.getItem('grew-tv-profile');
}

export function setProfile(p) {
  localStorage.setItem('grew-tv-profile', p);
}

// Active person (FEAT-026 TASK-156): WHO is watching, the watch-progress key
// (consumed by TASK-155 on every progress read/write). Distinct from the profile
// above, which is the person's fixed content class (kids|adults). The picker sets
// both on selection. Per-device, like the profile (FEAT-023 out-of-scope).
export function getPerson() {
  return localStorage.getItem('grew-tv-person');
}

export function setPerson(id) {
  localStorage.setItem('grew-tv-person', id);
}

// Global sticky captions preference (FEAT-017, FEAT-023). The SERVER is the
// single source of truth (state DB), so the toggle is consistent across every
// browser/device — unlike the old per-browser localStorage 'grew-tv:captions',
// now retired. getCaptions() returns an in-memory cache seeded from the backend
// on boot (initCaptions); setCaptions() updates the cache and writes through to
// the backend. Default ON until the backend answers (BUG-003). Profile selection
// (above) deliberately stays per-device — see FEAT-023 out-of-scope.
var _captionsOn = true;
var _captionsServer = '';

export function getCaptions() {
  return _captionsOn;
}

export function setCaptions(on) {
  _captionsOn = !!on;
  // Fire-and-forget write-through; the companion mirror still rides the live WS
  // app_state.captionsOn relayed by the player on toggle.
  saveSettings(_captionsServer, _captionsOn).catch(function() {});
}

// Boot: seed the captions cache from the backend, then resolve the value. Also
// a one-time migration off the legacy localStorage key — if it is still present
// (a browser that toggled CC before FEAT-023), push that choice to the backend
// once, then delete the key (only after a successful push, so an offline boot
// retries next time) so it is never read again. Offline/error keeps the current
// default (ON). The migration overwrites the backend with the local choice; in
// practice only the one device that ever toggled CC carries the key.
export function initCaptions(server) {
  _captionsServer = server;
  var legacy = localStorage.getItem('grew-tv:captions');
  if (legacy !== null) {
    _captionsOn = legacy !== 'off';
    return saveSettings(server, _captionsOn)
      .then(function() { localStorage.removeItem('grew-tv:captions'); return _captionsOn; })
      .catch(function() { return _captionsOn; });
  }
  return loadSettings(server)
    .then(function(s) { _captionsOn = !!s.captionsOn; return _captionsOn; })
    .catch(function() { return _captionsOn; });
}

export function getParam(key) {
  return new URLSearchParams(location.search).get(key);
}

export function navTo(page, params) {
  var keys = Object.keys(params || {});
  var qs = keys.map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  location.href = [page, qs].filter(Boolean).join('?');
}
