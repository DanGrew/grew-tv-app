// v3 normalized-model API client (FEAT-016). The backend serves videos and
// series; presentation is driven by metadata, not a film/series type field.
// Content files (mp4, poster, subtitles) are referenced by bare name and
// resolved by the media-manager's /media/ route — the app holds no contentBase.

function getJson(url) {
  return fetch(url, { cache: 'no-store' })
    .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); });
}

export function loadBrowse(serverUrl, profile) {
  return getJson(serverUrl + '/api/browse?profile=' + encodeURIComponent(profile));
}

export function loadVideo(serverUrl, id) {
  return getJson(serverUrl + '/api/video/' + encodeURIComponent(id));
}

export function loadSeries(serverUrl, id) {
  return getJson(serverUrl + '/api/series/' + encodeURIComponent(id));
}

export function loadNext(serverUrl, seriesId, videoId) {
  return getJson(serverUrl + '/api/next/' + encodeURIComponent(seriesId) + '/' + encodeURIComponent(videoId));
}

export function scanDevices(serverUrl) {
  return fetch(serverUrl + '/scan', { cache: 'no-store' })
    .then(function(r) { return r.json(); });
}

// Resolve a content file (by bare name) to its streaming URL. Falsy name -> ''
// so callers can fall back to a placeholder instead of requesting /media/null.
export function mediaUrl(serverUrl, filename) {
  return [filename].filter(Boolean).map(function(f) { return serverUrl + '/media/' + f; }).concat([''])[0];
}
