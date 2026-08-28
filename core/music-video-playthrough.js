// TASK-374 — the music-video ROUTING helpers, and only those: which video.html
// entry mode a load resolves to, and where a playlist row's tap sends you
// (TASK-374/376). Three earlier halves of this module are gone. BUG-485
// retired the client-owned `seq` playthrough (order + index, Shuffle/Repeat,
// TASK-374/407) that used to drive the <video> element directly, in favour of
// a server-authoritative engine. TASK-505 then retired `mvTransportVisibility`,
// the show/hide gate that paired with it: music videos run on the TASK-498
// unified queue engine now, where core/queue-shell-view.js's transportState is
// the ONE rule deciding ⏮⏭🔀🔁 for every media type, and a control with
// nothing to act on is dimmed rather than hidden. BUG-531 retired
// `playlistQueueKey`, the TASK-421 ＋Queue dispatch key: which Queue an item
// enters is now one map for every producer, in core/queue-shell-config.js.

// TASK-501 — browse's Continue lands here: `continueType` names the media type
// to carry on with, and video.html serves the four that play in it (music
// carries on in audio.html's own entry). It wins outright — a Continue press
// carries no other entry param, and resolving to a distinct mode per type is
// what lets the page key its engine off `mode` like every other entry does.
// TASK-542 — `series` is the fourth: an episode advances on its own engine now,
// so continuing one can no longer ride in on `continueFilm`.
var CONTINUE_MODE = {
  series: 'continueSeries',
  film: 'continueFilm',
  'home-movie': 'continueHomeMovie',
  'music-video': 'continueMusicVideo'
};

// Which entry function should run for a video.html load, in priority order:
// a Continue press wins if requested, then the durable video Play Queue, then a music-video source
// (playlist beats artist beats a lone item pick beats the TASK-445 whole-
// catalog Play All — the four are mutually exclusive in practice; the
// priority is a defensive fallback, not a real choice), then the TASK-446
// Home Movies whole-catalog Play All / TASK-486 per-kid Play All / TASK-491
// month-rail Play All (all three SERVER-authoritative — the video engine's
// own `home-movies-all` / `home-movies-by-person` / `home-movie-month`
// sources, not the mv* modes above — those route through the music-video
// engine instead; the three are mutually exclusive, one Play All rail tile
// sets exactly one param), then a collection — a TV series or a boxset — else
// a standalone single. Kept in core (not the page) because it branches — ui/**
// must stay cyclomatic-1.
//
// TASK-542 — the `?series=` param carries a COLLECTION id, and detail.html /
// loadSeries have always served a TV series and a film boxset through it
// identically. That was fine while both played as films; now that TV series is
// its own media type, the collection's own `collectionType` decides which
// queue the collection opens under, so it rides the nav param beside the id.
// TASK-503 skipped threading it as "purely cosmetic" — this is where it stops
// being cosmetic.
//
// An unstamped `?series=` — an old bookmark, a hand-typed URL — reads as a TV
// series, which is what the param was named for and what the overwhelming
// majority of them are; a boxset nav from any of this app's own screens
// carries the field.
var COLLECTION_MODE = { boxset: 'boxset', series: 'series' };

// The table answers for every type it lists; the default is for a nav it has
// no answer for at all, so listing a type and omitting it are never the same
// thing (a `|| 'series'` fallback would make the `series:` entry dead weight).
function collectionMode(collectionType) {
  var stamped = COLLECTION_MODE[collectionType];
  return stamped === undefined ? 'series' : stamped;
}

export function entryMode(p) {
  var params = p || {};
  if (CONTINUE_MODE[params.continueType]) return CONTINUE_MODE[params.continueType];
  if (params.playQueue) return 'queue';
  if (params.mvPlaylist) return 'mvPlaylist';
  if (params.mvArtist) return 'mvArtist';
  if (params.mvItem) return 'mvItem';
  if (params.mvAll) return 'mvAll';
  if (params.homeMoviesAll) return 'homeMoviesAll';
  if (params.homeMoviesPerson) return 'homeMoviesPerson';
  if (params.homeMoviesMonth) return 'homeMoviesMonth';
  if (params.isSeries) return collectionMode(params.collectionType);
  return 'single';
}

// Where a playlist-detail row tap sends you (TASK-374/376/377): a playlist may
// hold audio tracks or, for a music-video playlist, music-video items — the
// TAPPED item's own itemType decides the target, not the playlist's
// collectionType, so a row never needs to know what kind of playlist it's in.
// A music-video item always opens the video player's own engine-driven
// playthrough (never resume/restart — a music video never resumes, TASK-373);
// anything else keeps the existing audio-player target as given.
export function playlistTrackTarget(item, playlistId, audioTarget) {
  if (item.video.itemType === 'music-video') {
    return { page: 'video.html',
      params: { musicVideoPlaylist: playlistId, musicVideoTrack: item.video.id, from: 'detail-playlist' } };
  }
  return audioTarget;
}
