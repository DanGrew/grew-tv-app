// TASK-403 — the Downloads page's per-playlist status line: Not synced /
// Synced / Syncing — n/total. Pure text-building (core/tile-model.js
// pattern), kept out of ui/ so the screen module stays cyclomatic-1.
import { isSynced } from './downloads-synced.js';

var SYNCED_TEXT = { true: 'Synced', false: 'Not synced' };

export function playlistStatusText(playlistId, progress) {
  var TEXT = {
    true: function() { return 'Syncing — ' + progress.done + '/' + progress.total; },
    false: function() { return SYNCED_TEXT[isSynced(playlistId) + '']; }
  };
  return TEXT[Boolean(progress) + '']();
}

// BUG-064 — the Downloads page's post-sync status line naming what failed,
// built from syncCheckedPlaylists' { [playlistId]: { failed: [{title,
// reason}] } } result. Every failed track across every synced playlist in
// the batch, flattened (a playlistId isn't shown — the track title already
// identifies it, and a batch sync's failures read as one list regardless of
// which playlist each came from). null when nothing failed, so the caller
// can leave the line untouched on a clean sync.
function trackFailureText(f) { return f.title + ' (' + f.reason + ')'; }

export function syncFailureText(results) {
  var failed = Object.keys(results).reduce(function(acc, id) {
    return acc.concat(results[id].failed);
  }, []);
  if (failed.length === 0) return null;
  var noun = failed.length === 1 ? 'track' : 'tracks';
  return failed.length + ' ' + noun + ' failed — ' + failed.map(trackFailureText).join(', ');
}
