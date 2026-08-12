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
