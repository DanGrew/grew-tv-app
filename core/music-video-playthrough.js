// TASK-374 — the "third, small" playthrough for a single music video, a
// music-video playlist, or an artist's music videos: order + current index
// live HERE, client-owned, never on a server engine. grew-tv already has two
// server-authoritative playback engines (the video source/queue engine,
// core/video-player-router.js; the music queue engine) — the owner
// deliberately ruled out routing a music video through either, so this module
// is its own small sequence, not a third view-model over one of theirs.
// No repeat/wrap (a playthrough stops cleanly at its last item) and no resume
// (every item always starts at 0 — TASK-373 already keeps a music video out of
// watch_progress backend-side; this module never reads or models a position).

// seq: { items: [{id, title, ...}], index }. items is never mutated here — the
// page builds a fresh seq (from a single pick, a resolved playlist or a
// filtered artist list) and this module only reads it.
function itemsOf(seq) { return (seq && seq.items) || []; }
function indexOf(seq) { return (seq && seq.index) || 0; }

// The item the player should be showing right now, or null for an empty seq.
export function currentItem(seq) {
  return itemsOf(seq)[indexOf(seq)] || null;
}

// True while a later item exists to step/advance to.
export function hasNext(seq) {
  return indexOf(seq) < itemsOf(seq).length - 1;
}

// True while an earlier item exists to step back to.
export function hasPrev(seq) {
  return indexOf(seq) > 0;
}

// The item one place ahead of current, or null at the end (or for a lone
// item) — drives the inline "Up next" line, mirroring video-player-router's
// upNextItem but with no queue/repeat-wrap to fold in.
export function upNextItem(seq) {
  return hasNext(seq) ? itemsOf(seq)[indexOf(seq) + 1] : null;
}

// True once a seq holds more than one item — the ⏮/⏭ transport is only
// meaningful then (mirrors video-player-router.seriesMode).
export function isMulti(seq) {
  return itemsOf(seq).length > 1;
}

// Which entry function should run for a video.html load, in priority order:
// the durable video Play Queue wins if requested, then a music-video source
// (playlist beats artist beats a lone item pick — the three are mutually
// exclusive in practice; the priority is a defensive fallback, not a real
// choice), then a series, else a standalone single. Kept in core (not the
// page) because it branches — ui/** must stay cyclomatic-1.
export function entryMode(p) {
  var params = p || {};
  if (params.playQueue) return 'queue';
  if (params.mvPlaylist) return 'mvPlaylist';
  if (params.mvArtist) return 'mvArtist';
  if (params.mvItem) return 'mvItem';
  if (params.isSeries) return 'series';
  return 'single';
}

// An artist's music videos (A-Z by title) from the full /api/browse catalog —
// the same "standalone card, section-filtered" read musicRails uses for the
// Music tab's artist grouping, scoped to the music-videos section (TASK-373's
// itemType/section; TASK-376 builds that section's own rails — this only
// resolves the PLAY order behind wherever an artist trigger ends up living).
function titleOf(c) { return c.title || ''; }
// Exported (not just used internally) so a unit test can assert its -1/0/1
// verdict directly — Array.prototype.sort's own comparator-call pattern is
// engine-internal and not a reliable thing to pin a mutation test on.
export function compareByTitle(a, b) {
  var ta = titleOf(a);
  var tb = titleOf(b);
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}
export function musicVideosByArtist(cards, artist) {
  if (!cards) return [];
  var mine = cards.filter(function(c) { return c.section === 'music-videos' && c.artist === artist; });
  return mine.sort(compareByTitle);
}

// Where a playthrough should start within a resolved item list, given the id
// of the item that was actually tapped (e.g. a track row inside a music-video
// playlist's own detail screen, TASK-374/376) — 0 (the playlist's own order)
// when no id was tapped, or the tapped id isn't found in the list.
export function startIndex(items, id) {
  if (!items) return 0;
  var i = items.findIndex(function(it) { return it.id === id; });
  return i === -1 ? 0 : i;
}

// Where a playlist-detail row tap sends you (TASK-374/376/377): a playlist may
// hold audio tracks or, for a music-video playlist, music-video items — the
// TAPPED item's own itemType decides the target, not the playlist's
// collectionType, so a row never needs to know what kind of playlist it's in.
// A music-video item always opens the video player's own client-owned
// playthrough (never resume/restart — a music video never resumes, TASK-373);
// anything else keeps the existing audio-player target as given.
export function playlistTrackTarget(item, playlistId, audioTarget) {
  if (item.video.itemType === 'music-video') {
    return { page: 'video.html',
      params: { musicVideoPlaylist: playlistId, musicVideoTrack: item.video.id, from: 'detail-playlist' } };
  }
  return audioTarget;
}
