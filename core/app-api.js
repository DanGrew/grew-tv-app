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
// The active `person` (FEAT-026 TASK-155) keys progress per person: CW reflects
// who is watching, not the device. The backend 400s when person is absent.
export function loadContinueWatching(serverUrl, profile, person) {
  return getJson(serverUrl + '/api/continue-watching?profile=' + encodeURIComponent(profile) + '&person=' + encodeURIComponent(person || ''));
}

// Persist a resume position to the backend — the sole progress store (FEAT-017).
// The legacy localStorage copy was retired in TASK-119; this is the only writer.
// `person` (FEAT-026 TASK-155) keys the write per person — progress follows the
// person to any screen. The backend 400s when person is absent.
export function saveProgress(serverUrl, id, positionSec, durationSec, person) {
  return fetch(serverUrl + '/api/progress/' + encodeURIComponent(id) + '?person=' + encodeURIComponent(person || ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ position_secs: positionSec, duration_secs: durationSec })
  });
}

// Wipe the backend watch progress for one video, for the active person
// (TASK-142). Single-video reset — DELETEs the per-person progress row so the
// resume bar / RESUME tag clear. Idempotent server-side; the backend 400s when
// person is absent. `person` (FEAT-026) keys the delete to the active viewer.
export function resetProgress(serverUrl, id, person) {
  return fetch(serverUrl + '/api/progress/' + encodeURIComponent(id) + '?person=' + encodeURIComponent(person || ''), {
    method: 'DELETE'
  });
}

export function loadVideo(serverUrl, id) {
  return getJson(serverUrl + '/api/video/' + encodeURIComponent(id));
}

// Backend watch progress for one video (FEAT-017 source of truth). Returns the
// zero-state record ({position_secs:0,...}) when nothing is saved, so the player
// resumes by default without the old localStorage resume/restart prompt. The
// active `person` (FEAT-026 TASK-155) keys the read per person — resume is the
// active person's, not a global value. The backend 400s when person is absent.
export function loadProgress(serverUrl, id, person) {
  return getJson(serverUrl + '/api/progress/' + encodeURIComponent(id) + '?person=' + encodeURIComponent(person || ''));
}

// Profiles + Adults PIN config (TASK-120). Lives on the media-manager content
// root as config.json, fetched via the same /media/ route as posters. Callers
// catch and fall back to profile-config defaults when it is absent/unreadable.
export function loadConfig(serverUrl) {
  return getJson(mediaUrl(serverUrl, 'config.json'));
}

// Global user settings — server-held single source of truth (FEAT-023),
// replacing the old per-browser localStorage 'grew-tv:captions'. GET returns
// {captionsOn, lyricsOn}, defaulting each ON when unset (BUG-003). POST takes a
// partial patch (either/both keys) and echoes the stored state.
export function loadSettings(serverUrl) {
  return getJson(serverUrl + '/api/settings');
}

export function saveSettings(serverUrl, patch) {
  return fetch(serverUrl + '/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
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

// Fetch a track's `.lrc` lyric sidecar (TASK-129 serves it as text/plain) by
// bare name, resolved through the same /media/ route as posters. Resolves to the
// raw LRC text; rejects on a missing/!ok response so the ambient screen falls
// back to the no-lyrics art view (FEAT-018 TASK-131).
export function loadLyrics(serverUrl, filename) {
  return fetch(mediaUrl(serverUrl, filename), { cache: 'no-store' })
    .then(function(r) { return r.ok ? r.text() : Promise.reject(r.status); });
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
