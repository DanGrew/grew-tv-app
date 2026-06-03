export function loadManifest(serverUrl) {
  return fetch(serverUrl + '/manifest.json')
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); });
}
