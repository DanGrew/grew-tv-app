export function getProfile() {
  return localStorage.getItem('grew-tv-profile');
}

export function setProfile(p) {
  localStorage.setItem('grew-tv-profile', p);
}

// Global sticky captions preference (FEAT-017): toggle once and captions stay
// on for every video that has them until toggled off. Held app-side, relayed to
// the companion via the app_state `captionsOn` field. Default off when unset.
export function getCaptions() {
  return localStorage.getItem('grew-tv:captions') === 'on';
}

export function setCaptions(on) {
  localStorage.setItem('grew-tv:captions', on ? 'on' : 'off');
}

export function getParam(key) {
  return new URLSearchParams(location.search).get(key);
}

export function navTo(page, params) {
  var keys = Object.keys(params || {});
  var qs = keys.map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  location.href = [page, qs].filter(Boolean).join('?');
}
