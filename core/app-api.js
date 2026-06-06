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

// Mid-watch videos for a profile, newest first (FEAT-017). Backs the Home
// Continue Watching rail and the companion shortcut. Backend is the source of
// truth for progress, so this — not localStorage — drives cross-device CW.
export function loadContinueWatching(serverUrl, profile) {
  return getJson(serverUrl + '/api/continue-watching?profile=' + encodeURIComponent(profile));
}

// Persist a resume position to the backend. Dual-written alongside localStorage
// during the FEAT-017 transition (TASK-118/119 retire the localStorage copy).
export function saveProgress(serverUrl, id, positionSec, durationSec) {
  return fetch(serverUrl + '/api/progress/' + encodeURIComponent(id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position_secs: positionSec, duration_secs: durationSec })
  });
}

export function loadVideo(serverUrl, id) {
  return getJson(serverUrl + '/api/video/' + encodeURIComponent(id));
}

// Backend watch progress for one video (FEAT-017 source of truth). Returns the
// zero-state record ({position_secs:0,...}) when nothing is saved, so the player
// resumes by default without the old localStorage resume/restart prompt.
export function loadProgress(serverUrl, id) {
  return getJson(serverUrl + '/api/progress/' + encodeURIComponent(id));
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
