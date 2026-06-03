export function getProfile() {
  return localStorage.getItem('grew-tv-profile');
}

export function setProfile(p) {
  localStorage.setItem('grew-tv-profile', p);
}

export function getParam(key) {
  return new URLSearchParams(location.search).get(key);
}

export function navTo(page, params) {
  var keys = Object.keys(params || {});
  var qs = keys.map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  location.href = [page, qs].filter(Boolean).join('?');
}
