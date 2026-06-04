export function loadManifest(serverUrl) {
  return fetch(serverUrl + '/manifest.json', { cache: 'no-store' })
    .then(function(r) { return r.json(); });
}

export function scanDevices(serverUrl) {
  return fetch(serverUrl + '/scan', { cache: 'no-store' })
    .then(function(r) { return r.json(); });
}
