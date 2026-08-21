// TASK-374 — the music-video routing helpers: which video.html entry mode a
// load resolves to, and the playlist-row dispatch a music-video track needs
// (both TASK-374/376/421). BUG-485 retired this module's OTHER half — the
// client-owned `seq` playthrough (order + index, Shuffle/Repeat, TASK-374/407)
// that used to drive the actual <video> element directly — in favour of the
// music-video engine (media-manager/db/music_video_playback_engine.py) being
// server-authoritative the same way film/series already are; that logic now
// lives in core/music-video-playback-router.js over the engine's own
// `music_video_playback` snapshot.

// Which entry function should run for a video.html load, in priority order:
// the durable video Play Queue wins if requested, then a music-video source
// (playlist beats artist beats a lone item pick beats the TASK-445 whole-
// catalog Play All — the four are mutually exclusive in practice; the
// priority is a defensive fallback, not a real choice), then the TASK-446
// Home Movies whole-catalog Play All / TASK-486 per-kid Play All (both
// SERVER-authoritative — the video engine's own `home-movies-all` /
// `home-movies-by-person` sources, not the mv* modes above — those route
// through the music-video engine instead; the two are mutually exclusive,
// one Play All rail tile sets exactly one param), then a series, else a
// standalone single. Kept in core (not the page) because it branches —
// ui/** must stay cyclomatic-1.
export function entryMode(p) {
  var params = p || {};
  if (params.playQueue) return 'queue';
  if (params.mvPlaylist) return 'mvPlaylist';
  if (params.mvArtist) return 'mvArtist';
  if (params.mvItem) return 'mvItem';
  if (params.mvAll) return 'mvAll';
  if (params.homeMoviesAll) return 'homeMoviesAll';
  if (params.homeMoviesPerson) return 'homeMoviesPerson';
  if (params.isSeries) return 'series';
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

// TASK-421 (story 3) — the twin dispatch key for a playlist row's "☰ Play Next":
// a music-video row POSTs to its OWN engine (FEAT-418), never the audio
// engine's queue-track, so the two Play Next lists stay apart. Same itemType
// signal playlistTrackTarget already reads, kept in core (both the TV
// playlist-detail page and its companion mirror call this — ui/** stays
// cyclomatic-1/pure-DOM-only).
export function playlistQueueKey(itemType) {
  return [itemType].filter(Boolean).concat(['track'])[0];
}

// The Shuffle/Repeat visibility split for the video page + its companion
// mirror (story 4/5 — both surfaces must agree): Shuffle only ever applies to
// a multi-item music-video playthrough; Repeat already exists for a
// film/series (unaffected — always visible there) and additionally applies to
// a multi-item music-video playthrough, hiding only for a single pick.
export function mvTransportVisibility(isMusicVideo, isMultiSeq) {
  var multi = !!isMusicVideo && !!isMultiSeq;
  return { shuffle: multi, repeat: multi || !isMusicVideo };
}
