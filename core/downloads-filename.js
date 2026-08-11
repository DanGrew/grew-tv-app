// TASK-403 — filenames for the offline-download folder. Sanitized
// `{artist} - {title}.{ext}` for audio, same basename `.lrc` for lyrics
// (human-readable in the folder; "already downloaded" is a plain
// filename-exists check, not a track-id index — see the task spec).

var ILLEGAL = /[\/\\:*?"<>|\x00-\x1f]/g;

function sanitize(s) {
  return s.replace(ILLEGAL, '_').trim();
}

function baseName(track) {
  return [track.artist].filter(Boolean).map(function(a) { return sanitize(a) + ' - '; }).concat([''])[0] + sanitize(track.title);
}

export function trackFilename(track) {
  return baseName(track) + '.' + track.ext;
}

export function lyricsFilename(track) {
  return baseName(track) + '.lrc';
}

export function playlistM3uFilename(playlistTitle) {
  return sanitize(playlistTitle) + '.m3u';
}
