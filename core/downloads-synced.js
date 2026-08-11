// TASK-403 — which playlists have been synced at least once, for the
// Downloads page's plain synced/not-synced status (story 3). No staleness:
// this is a flat set of playlist ids, never diffed against track content —
// dropped deliberately, dedup-by-file-presence was judged enough on its own
// (see the task spec). `localStorage` is a browser global, not a DOM token,
// so it is allowed in core/ — same pattern as BUG-034's volume-store.

var KEY = 'grew-tv.downloads.synced';

function readIds() {
  try {
    var raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

export function syncedPlaylistIds() {
  return readIds();
}

export function isSynced(playlistId) {
  return readIds().indexOf(playlistId) !== -1;
}

export function markSynced(playlistId) {
  var ids = readIds().filter(function(id) { return id !== playlistId; });
  ids.push(playlistId);
  localStorage.setItem(KEY, JSON.stringify(ids));
}
