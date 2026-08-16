// TASK-403 — filenames for the offline-download folder. Sanitized
// `{artist} - {title}.{ext}` for audio, same basename `.lrc` for lyrics
// (human-readable in the folder; "already downloaded" is a plain
// filename-exists check, not a track-id index — see the task spec).
//
// BUG-416 (Musicolet folder-per-playlist) — every track carries a
// zero-padded playlist-position prefix (`01 - `, `02 - `, ...) so a
// folder-view player that plays a directory in filename order matches the
// playlist's actual track order, not alphabetical. `index`/`total` are the
// track's 1-based position and the playlist's full queued length (not the
// count that actually succeeded) — the same pairing `downloads-sync.js`
// uses to name the file on disk and to reference it from the `.m3u`, so the
// two never disagree about what a track is called.

var ILLEGAL = /[\/\\:*?"<>|\x00-\x1f]/g;

function sanitize(s) {
  return s.replace(ILLEGAL, '_').trim();
}

function pad(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

function indexPrefix(index, total) {
  return pad(index, Math.max(2, String(total).length)) + ' - ';
}

function baseName(track) {
  return [track.artist].filter(Boolean).map(function(a) { return sanitize(a) + ' - '; }).concat([''])[0] + sanitize(track.title);
}

export function trackFilename(track, index, total) {
  return indexPrefix(index, total) + baseName(track) + '.' + track.ext;
}

export function lyricsFilename(track, index, total) {
  return indexPrefix(index, total) + baseName(track) + '.lrc';
}

export function playlistFolderName(playlistTitle) {
  return sanitize(playlistTitle);
}

export function playlistM3uFilename(playlistTitle) {
  return playlistFolderName(playlistTitle) + '.m3u';
}
