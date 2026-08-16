// TASK-403 — the Downloads page's per-playlist status line: Not synced /
// Synced / Syncing — n/total. Pure text-building (core/tile-model.js
// pattern), kept out of ui/ so the screen module stays cyclomatic-1.
import { isSynced } from './downloads-synced.js';

var SYNCED_TEXT = { true: 'Synced', false: 'Not synced' };
var TRACK_WORD = { true: 'track', false: 'tracks' };

// BUG-066 — "1 track"/"N tracks" ahead of the Synced state, the same wording
// tile-model.js's playlist sub-label already established (always "tracks":
// a Downloads playlist is always music, never a clip collection). No
// clipCount (older caller / not yet loaded) drops the prefix — pre-BUG-066
// text, a safe degrade rather than "undefined tracks".
function trackCountPrefix(clipCount) {
  var known = [clipCount].filter(function(n) { return n != null; });
  return known.map(function(n) { return n + ' ' + TRACK_WORD[(n === 1) + '']; })[0];
}

function statusLine(playlistId, clipCount) {
  var parts = [trackCountPrefix(clipCount), SYNCED_TEXT[isSynced(playlistId) + '']].filter(Boolean);
  return parts.join(' — ');
}

export function playlistStatusText(playlistId, progress, clipCount) {
  var TEXT = {
    true: function() { return 'Syncing — ' + progress.done + '/' + progress.total; },
    false: function() { return statusLine(playlistId, clipCount); }
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

function trackFailureText_(failed) {
  var noun = failed.length === 1 ? 'track' : 'tracks';
  return failed.length + ' ' + noun + ' failed — ' + failed.map(trackFailureText).join(', ');
}

// BUG-416 — a playlist can land every track and still not be "complete" if
// its .m3u failed to write; name that shortfall too, distinct from a
// per-track failure, rather than reading a clean track count as "nothing
// went wrong".
export function syncFailureText(results) {
  var ids = Object.keys(results);
  var failed = ids.reduce(function(acc, id) { return acc.concat(results[id].failed); }, []);
  var fileErrors = ids.map(function(id) { return results[id].playlistFileError; }).filter(Boolean);
  var trackPart = [failed.length > 0].filter(Boolean).map(function() { return trackFailureText_(failed); });
  var parts = trackPart.concat(fileErrors);
  return parts.length === 0 ? null : parts.join(' — ');
}
