// TASK-403 — offline playlist sync. Given a File System Access directory
// handle (from the picker API, owned by the ui layer) and a
// playlist's resolved tracks, writes each track's audio + .lrc (skipping a
// file already present by name — dedup-by-presence, no track-id index or
// staleness tracking, per the task spec) and rewrites the playlist's .m3u in
// full. Takes the dir handle as a plain object so this stays unit-testable
// with a fake implementing the same getFileHandle/createWritable shape — the
// real File System Access API is not available outside a browser.
import { mediaUrl, loadLyrics, loadPlaylist } from './app-api.js';
import { trackFilename, lyricsFilename, playlistM3uFilename } from './downloads-filename.js';
import { markSynced } from './downloads-synced.js';

async function fileExists(dirHandle, name) {
  try {
    await dirHandle.getFileHandle(name);
    return true;
  }
  // Stryker disable next-line BlockStatement: only ever read via `!fileExists(...)` — undefined negates the same as false, no observable difference.
  catch (e) {
    return false;
  }
}

async function writeFile(dirHandle, name, data) {
  var fileHandle = await dirHandle.getFileHandle(name, { create: true });
  var writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
}

async function fetchAudioBlob(serverUrl, track) {
  var res = await fetch(mediaUrl(serverUrl, track.id + '.' + track.ext));
  if (!res.ok) throw res.status;
  return res.blob();
}

// BUG-064 — a thrown HTTP status (fetchAudioBlob / loadLyrics reject with the
// bare `res.status` number) reads as "HTTP {status}"; a File System Access
// error (DOMException/Error) carries its own .message; anything else falls
// back to String(e) rather than an opaque "[object Object]".
function trackErrorReason(e) {
  if (typeof e === 'number') return 'HTTP ' + e;
  if (e && e.message) return e.message;
  return String(e);
}

// Write one track's audio (always) and .lrc (when it has lyrics), skipping
// each file that already exists in the folder. Returns whether the audio
// file was newly written (the m3u lists every track regardless).
export async function ensureTrackFiles(dirHandle, serverUrl, track) {
  var audioName = trackFilename(track);
  var audioPresent = await fileExists(dirHandle, audioName);
  if (!audioPresent) {
    var blob = await fetchAudioBlob(serverUrl, track);
    await writeFile(dirHandle, audioName, blob);
  }
  if (track.lyrics) {
    var lrcName = lyricsFilename(track);
    var lrcPresent = await fileExists(dirHandle, lrcName);
    if (!lrcPresent) {
      var text = await loadLyrics(serverUrl, track.lyrics);
      await writeFile(dirHandle, lrcName, text);
    }
  }
  return !audioPresent;
}

// #EXTM3U text for a playlist's tracks, in order, referencing the same
// filenames ensureTrackFiles writes — playable by a folder-based player.
export function m3uText(tracks) {
  var lines = ['#EXTM3U'];
  tracks.forEach(function(t) {
    var label = [t.artist].filter(Boolean).map(function(a) { return a + ' - '; }).concat([''])[0] + t.title;
    lines.push('#EXTINF:' + (t.duration || -1) + ',' + label);
    lines.push(trackFilename(t));
  });
  return lines.join('\n') + '\n';
}

// Sync one playlist's tracks into the folder, then (re)write its .m3u in
// full. `onTrack(i, total)` (optional) reports progress as each track
// finishes. BUG-064 — a single track's failure (fetch, FS write, lyrics
// fetch) no longer aborts the rest of the batch: each track is caught
// individually, and the .m3u lists only the tracks that actually have a file
// on disk (succeeded this run, or already present) so it never references a
// failed track's missing file. Returns a summary: how many tracks total,
// newly written, already present (dedup count), and which failed
// ({id, title, reason}) for the UI's status line.
export async function syncPlaylist(dirHandle, serverUrl, playlist, onTrack) {
  var report = [onTrack].filter(Boolean).concat([function() {}])[0];
  var tracks = [playlist.items].filter(Array.isArray).concat([[]])[0].map(function(item) { return item.video; });
  var written = 0;
  var ok = [];
  var failed = [];
  for (var i = 0; i < tracks.length; i++) {
    try {
      var wasWritten = await ensureTrackFiles(dirHandle, serverUrl, tracks[i]);
      if (wasWritten) written++;
      ok.push(tracks[i]);
    } catch (e) {
      failed.push({ id: tracks[i].id, title: tracks[i].title, reason: trackErrorReason(e) });
    }
    report(i + 1, tracks.length);
  }
  await writeFile(dirHandle, playlistM3uFilename(playlist.title), m3uText(ok));
  return { total: tracks.length, written: written, alreadyPresent: ok.length - written, failed: failed };
}

// Sync a batch of checked playlists, by id, in order — the ui layer's Sync
// tap is one call to this rather than a loop of its own (ui/** is
// cyclomatic-capped at 1, so any looping/sequencing logic belongs here,
// where core is exempt). `onProgress(playlistId, done, total)` (optional)
// reports as each playlist's tracks finish, keyed by id so a multi-playlist
// sync can update each row's own status line. Returns { [playlistId]: summary }.
export async function syncPlaylists(dirHandle, serverUrl, playlistIds, onProgress) {
  var report = [onProgress].filter(Boolean).concat([function() {}])[0];
  var results = {};
  for (var i = 0; i < playlistIds.length; i++) {
    var id = playlistIds[i];
    var playlist = await loadPlaylist(serverUrl, id);
    results[id] = await syncPlaylist(dirHandle, serverUrl, playlist, function(done, total) { report(id, done, total); });
  }
  return results;
}

// The ui layer's whole Sync-tap job in one call: sync every checked
// playlist, then mark each as synced (core/downloads-synced.js) so the
// status line flips without the caller doing its own bookkeeping. BUG-064 —
// a playlist with any failed track is NOT marked synced (its status line
// would otherwise read "Synced" over an incomplete folder).
export async function syncCheckedPlaylists(dirHandle, serverUrl, playlistIds, onProgress) {
  var results = await syncPlaylists(dirHandle, serverUrl, playlistIds, onProgress);
  playlistIds.filter(function(id) { return results[id].failed.length === 0; }).forEach(markSynced);
  return results;
}
