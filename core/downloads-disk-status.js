// BUG-437 — re-derives a playlist's Synced status from what's actually in
// grew-tv/<title>/ on disk, instead of only ever trusting the flag
// downloads-synced.js persisted at the *last* sync run. That flag goes
// stale the moment the folder changes independently of this browser (a sync
// from a different profile/device sharing the same picked folder, or files
// removed by hand) — see the task spec's story 1/2. Reuses the exact "audio
// file count matches the queued length AND the .m3u is present" contract
// downloads-sync.js's syncPlaylist itself writes to, and reuses
// markSynced/unmarkSynced (BUG-416) as the single place "Synced" is decided
// — no second status source next to isSynced().
//
// Read-only by design (never `{create: true}` on getDirectoryHandle) — a
// missing grew-tv/ or playlist folder is a normal, expected outcome of the
// check (nothing synced there yet), not an error, so it resolves `false`
// rather than throwing. A genuine FS error (permission revoked mid-check,
// I/O failure) rejects instead, so the caller can leave today's
// localStorage-only status alone rather than wrongly unmarking a playlist
// the check never actually got to look at.
import { playlistFolderName, playlistM3uFilename } from './downloads-filename.js';
import { markSynced, unmarkSynced } from './downloads-synced.js';

var GREW_TV_ROOT_FOLDER = 'grew-tv';

async function dirOrNull(dirHandle, name) {
  try {
    return await dirHandle.getDirectoryHandle(name);
  } catch (e) {
    if (e && e.name === 'NotFoundError') return null;
    throw e;
  }
}

async function fileExists(dirHandle, name) {
  try {
    await dirHandle.getFileHandle(name);
    return true;
  } catch (e) {
    if (e && e.name === 'NotFoundError') return false;
    throw e;
  }
}

// Counts plain files in the playlist folder that aren't the .m3u or a .lrc
// sidecar — the same "one audio file per queued track" shape
// downloads-sync.js writes, without needing each track's own resolved
// filename (the disk check only has clipCount, not the resolved playlist).
async function audioFileCount(dirHandle, m3uName) {
  var count = 0;
  for await (var entry of dirHandle.values()) {
    var isAudio = entry.kind === 'file' && entry.name !== m3uName && entry.name.slice(-4) !== '.lrc';
    if (isAudio) count++;
  }
  return count;
}

async function playlistOnDisk(rootDirHandle, playlist) {
  var grewTvDir = await dirOrNull(rootDirHandle, GREW_TV_ROOT_FOLDER);
  if (!grewTvDir) return false;
  var playlistDir = await dirOrNull(grewTvDir, playlistFolderName(playlist.title));
  if (!playlistDir) return false;
  var m3uName = playlistM3uFilename(playlist.title);
  var m3uPresent = await fileExists(playlistDir, m3uName);
  var count = await audioFileCount(playlistDir, m3uName);
  return m3uPresent && count === playlist.clipCount;
}

// Checks one playlist ({id, title, clipCount}) against the real folder and
// updates the persisted flag to match, returning the resolved status. Never
// resolves on a real FS error — rejects instead, so the caller's own
// per-playlist `.catch` can leave the row exactly as it was rather than
// have this call itself decide silently.
export async function refreshPlaylistSyncStatus(rootDirHandle, playlist) {
  var synced = await playlistOnDisk(rootDirHandle, playlist);
  (synced ? markSynced : unmarkSynced)(playlist.id);
  return synced;
}
