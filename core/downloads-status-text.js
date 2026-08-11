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
