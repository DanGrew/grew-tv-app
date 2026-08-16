// TASK-403 — which playlists are currently synced, for the Downloads page's
// plain synced/not-synced status (story 3): a flat set of playlist ids, never
// diffed against track content — dedup-by-file-presence was judged enough on
// its own (see the task spec). BUG-416 — the set reflects the latest sync
// run's outcome, not "synced at some point": markSynced/unmarkSynced are both
// needed so a playlist that fails a later resync stops reading Synced.
// `localStorage` is a browser global, not a DOM token, so it is allowed in
// core/ — same pattern as BUG-034's volume-store.

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

// BUG-416 — the flag must track the latest sync run's outcome, not "synced
// at some point": a playlist that synced cleanly once and later fails a
// resync (e.g. a track added since, now missing) must stop reading Synced.
export function unmarkSynced(playlistId) {
  var ids = readIds().filter(function(id) { return id !== playlistId; });
  localStorage.setItem(KEY, JSON.stringify(ids));
}
