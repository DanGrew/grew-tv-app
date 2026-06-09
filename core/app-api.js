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

// Persist a resume position to the backend — the sole progress store (FEAT-017).
// The legacy localStorage copy was retired in TASK-119; this is the only writer.
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

// Profiles + Adults PIN config (TASK-120). Lives on the media-manager content
// root as config.json, fetched via the same /media/ route as posters. Callers
// catch and fall back to profile-config defaults when it is absent/unreadable.
export function loadConfig(serverUrl) {
  return getJson(mediaUrl(serverUrl, 'config.json'));
}

// Global user settings — server-held single source of truth (FEAT-023),
// replacing the old per-browser localStorage 'grew-tv:captions'. GET defaults
// captions ON when unset (BUG-003); POST persists a toggle and echoes the state.
export function loadSettings(serverUrl) {
  return getJson(serverUrl + '/api/settings');
}

export function saveSettings(serverUrl, captionsOn) {
  return fetch(serverUrl + '/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ captionsOn: captionsOn })
  });
}

export function loadSeries(serverUrl, id) {
  return getJson(serverUrl + '/api/series/' + encodeURIComponent(id));
}

// Album detail (FEAT-018): same resolved-items shape as /api/series, with each
// track carrying artist / lyrics / ext. Distinct route so music has an explicit
// entry point and the two can diverge later (TASK-129).
export function loadAlbum(serverUrl, id) {
  return getJson(serverUrl + '/api/album/' + encodeURIComponent(id));
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
