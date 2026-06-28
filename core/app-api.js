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
// (TASK-142). Single-video reset from the player — DELETEs the per-person
// progress row so the resume position clears. Idempotent server-side; the
// backend 400s when person is absent. `person` (FEAT-026) keys the delete.
export function resetProgress(serverUrl, id, person) {
  return fetch(serverUrl + '/api/progress/' + encodeURIComponent(id) + '?person=' + encodeURIComponent(person || ''), {
    method: 'DELETE'
  });
}

// FEAT-031 (TASK-187): server-authoritative playback. The app sends an action to
// the TASK-186 endpoint (play-source / play-track / next / previous /
// toggle-shuffle / toggle-repeat / position / queue-track / remove-queue-entry /
// move-queue-entry); the server applies the pure engine transition, persists, and
// broadcasts the resolved `playback` snapshot over the per-person relay — the UI
// repaints from that snapshot, never from a local queue. Contract: 204 accept /
// 400 bad input / never 500. `person` (FEAT-026) keys the per-person state.
export function playbackAction(serverUrl, action, person, body) {
  return fetch(serverUrl + '/api/playback/' + encodeURIComponent(action) + '?person=' + encodeURIComponent(person || ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
}

// FEAT-037 (TASK-221/222): server-authoritative VIDEO playback, the video twin of
// playbackAction. Posts an action to the separate /api/video-playback endpoint
// (play-source / next / previous / toggle-repeat / position); the server applies
// the pure video engine transition, persists the per-person playback-state, and
// broadcasts the resolved `video_playback` snapshot over the per-person relay — the
// persistent player swaps media in place from that snapshot, never reloading the
// page. Contract: 204 accept / 400 bad input / never 500. `person` (FEAT-026) keys
// the per-person state. (Position still rides the existing /api/progress path —
// both land in watch_progress, the single source of truth for per-item position.)
export function videoPlaybackAction(serverUrl, action, person, body) {
  return fetch(serverUrl + '/api/video-playback/' + encodeURIComponent(action) + '?person=' + encodeURIComponent(person || ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
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

// Playlist detail (FEAT-036/TASK-204): a user playlist is state-DB-resident, so
// it has its own route (not /api/album), but the backend projects it into the
// same resolved-items shape so the album-detail layout renders it unchanged.
export function loadPlaylist(serverUrl, id) {
  return getJson(serverUrl + '/api/playlist/' + encodeURIComponent(id));
}

// Create a user playlist (FEAT-036/TASK-208). POST /api/playlists/create takes a
// name + profile (kids|adults); the SERVER generates the slug id, so — unlike the
// 204 delete/add/remove actions — create returns 200 + the created record. The
// caller reads the new `id` to open its detail. Rejects on a non-2xx (e.g. a
// blank/over-long name 400s) so the screen can show an error.
export function createPlaylist(serverUrl, name, profile) {
  return fetch(serverUrl + '/api/playlists/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, profile: profile })
  }).then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); });
}

// Append a track to a playlist (FEAT-036/TASK-206). POST /api/playlists/add-track
// takes {playlist_id, track_id}; the server appends in order, gated catalog-known
// AND profile-match (a mismatch / unknown track 400s, never 500). Contract is 204
// on success — resolve only on a 2xx so the Add sheet can confirm vs. error.
export function addToPlaylist(serverUrl, playlistId, trackId) {
  return fetch(serverUrl + '/api/playlists/add-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist_id: playlistId, track_id: trackId })
  }).then(function(r) { return r.ok ? r : Promise.reject(r.status); });
}

// Bulk-add a whole album or another playlist into a playlist as a SNAPSHOT
// (FEAT-036/TASK-212). POST /api/playlists/add-source takes {playlist_id,
// source_type:'album'|'playlist', source_id}; the server resolves the source's
// track ids AT ADD-TIME, profile-filters them against the target playlist, and
// appends in order (flat track_ids[] — no live link, so later edits to the source
// never ripple). A per-member profile mismatch is dropped server-side, not
// rejected; the action 400s only on an unknown playlist/source, bad source_type,
// or a self-add. 204 on success — resolve only on a 2xx (mirrors addToPlaylist).
export function addSourceToPlaylist(serverUrl, playlistId, sourceType, sourceId) {
  return fetch(serverUrl + '/api/playlists/add-source', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist_id: playlistId, source_type: sourceType, source_id: sourceId })
  }).then(function(r) { return r.ok ? r : Promise.reject(r.status); });
}

// Reorder a track within a playlist (FEAT-036/TASK-211). POST
// /api/playlists/move-track takes {playlist_id, index, direction:'up'|'down'} and
// swaps the entry at `index` with its neighbour — BY POSITION, so duplicates stay
// individually addressable (reuses the FEAT-031 move_queue_entry idiom). A move
// off either end is a server no-op. 204 on success / 400 on bad input, never 500;
// resolves only on a 2xx so the caller reloads on success and leaves the list put
// on error (mirrors addToPlaylist / renamePlaylist).
export function movePlaylistTrack(serverUrl, playlistId, index, direction) {
  return fetch(serverUrl + '/api/playlists/move-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist_id: playlistId, index: index, direction: direction })
  }).then(function(r) { return r.ok ? r : Promise.reject(r.status); });
}

// Remove the track at a position from a playlist (FEAT-036/TASK-211). POST
// /api/playlists/remove-track takes {playlist_id, index} and drops the entry at
// `index` — BY POSITION (the TASK-201 action; 211 is the first UI to wire it).
// 204 on success / 400 on bad input, never 500; resolves only on a 2xx.
export function removeFromPlaylist(serverUrl, playlistId, index) {
  return fetch(serverUrl + '/api/playlists/remove-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist_id: playlistId, index: index })
  }).then(function(r) { return r.ok ? r : Promise.reject(r.status); });
}

// Delete a user playlist (FEAT-036/TASK-208). POST /api/playlists/delete takes the
// playlist_id; the contract is 204 on success / 400 on bad input, never 500.
export function deletePlaylist(serverUrl, id) {
  return fetch(serverUrl + '/api/playlists/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist_id: id })
  });
}

// Rename a user playlist (FEAT-036/TASK-210). POST /api/playlists/rename takes the
// playlist_id + the new name; like delete/add/remove it is 204 on success / 400 on
// bad input (a blank or over-long name), never 500. The id is PERMANENT (the server
// does not re-slug it), so the caller keeps using the same id afterwards. Rejects on
// a non-2xx so the screen can show an error (mirrors createPlaylist / addToPlaylist).
export function renamePlaylist(serverUrl, id, name) {
  return fetch(serverUrl + '/api/playlists/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlist_id: id, name: name })
  }).then(function(r) { return r.ok ? r : Promise.reject(r.status); });
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
