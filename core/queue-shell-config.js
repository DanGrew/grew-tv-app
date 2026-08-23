// TASK-515 (FEAT-497) — everything the Queue UX shell needs to know about a
// media type, as DATA. core/queue-shell-view.js renders the design; this says
// what a clip is called, what glyph stands in for missing art, how the hero's
// source line and a row's muted second line resolve, and which engine a ＋Queue
// press posts to. A fifth media type is a new entry here, not new code.
//
// The per-type shape:
//   mediaType      — the queue engine's own media_type key ('film' &c.)
//   noun/nounPlural— the media noun the shared empty/ends wording reads with
//   glyph          — the fallback for missing artwork
//   sourceSubtitle — (snap, sourceTitle) -> the hero's muted source line. A
//                    type whose source name is derivable from the snapshot
//                    resolves it here; one whose source id is opaque (a
//                    series/boxset, an album/playlist) reads the caller's own
//                    lookup, passed in as sourceTitle.
//   rowSub         — (entry) -> a row's muted second line
//   transport      — (snap) -> which transport controls are live. Every type
//                    uses the shell's ONE rule; the field exists so a genuine
//                    per-type need has somewhere to go, not as an invitation.
//   add            — the ＋Queue map entry: which engine, which action, which
//                    body key, and the confirmation wording.
//
// ⛔ A difference discovered between two types is a defect to fix toward
// docs/QUEUE-UX-SHELL.md, not a precedent to codify as a new config field.

import { transportState, durationText } from './queue-shell-view.js';
import { homeMoviesSourceLabel } from './home-rails.js';
import { queuePlaybackAction, musicVideoPlaybackAction, playbackAction } from './app-api.js';

// Home movies' source is a person or a month — both derivable from the
// snapshot's own source_type/source_id slugs, so no caller lookup.
function homeMovieSource(snap) {
  return homeMoviesSourceLabel(snap.source_type, snap.source_id);
}

// Films/music/music videos all key their source on an opaque catalog id (a
// series or boxset, an album, a playlist, an artist), so the caller fetches
// the title and passes it in. A standalone item has no source to name.
function suppliedSource(snap, sourceTitle) {
  return sourceTitle || '';
}

// The default row sub-line: the item's own duration, the one field every
// media type carries.
function durationSub(entry) {
  return durationText(entry.duration);
}

// Music and music videos carry an artist, which says more than a runtime;
// a track with none still gets its duration rather than a blank line.
function artistSub(entry) {
  return entry.artist || durationText(entry.duration);
}

// ＋Queue routing. 'queue' is the TASK-498 unified engine (append-only, per
// FEAT-497's model — hence "Added to Queue"); music and music videos are
// still on their own pre-FEAT-497 engines until TASK-504/505 cut them over,
// where a queue press still means play-next, and the wording stays honest
// about that.
var APPEND = { engine: 'queue', action: 'queue-item', bodyKey: 'item_id', status: 'Added to Queue' };

export var HOME_MOVIE = {
  mediaType: 'home-movie',
  noun: 'clip', nounPlural: 'clips',
  glyph: '&#127916;',
  sourceSubtitle: homeMovieSource,
  rowSub: durationSub,
  transport: transportState,
  add: APPEND
};

export var FILM = {
  mediaType: 'film',
  noun: 'title', nounPlural: 'titles',
  glyph: '&#127916;',
  sourceSubtitle: suppliedSource,
  rowSub: durationSub,
  transport: transportState,
  add: APPEND
};

export var MUSIC = {
  mediaType: 'music',
  noun: 'track', nounPlural: 'tracks',
  glyph: '&#127925;',
  sourceSubtitle: suppliedSource,
  rowSub: artistSub,
  transport: transportState,
  add: { engine: 'music', action: 'queue-track', bodyKey: 'track_id', status: 'Queued to Play Next' }
};

export var MUSIC_VIDEO = {
  mediaType: 'music-video',
  noun: 'video', nounPlural: 'videos',
  glyph: '&#127916;',
  sourceSubtitle: suppliedSource,
  rowSub: artistSub,
  transport: transportState,
  add: { engine: 'music-video', action: 'queue-video', bodyKey: 'video_id', status: 'Queued to Play Next' }
};

export var QUEUE_SHELL_CONFIG = {
  'home-movie': HOME_MOVIE,
  film: FILM,
  music: MUSIC,
  'music-video': MUSIC_VIDEO
};

// Browse/rail screens name their sections, not media types; this is the one
// place the two vocabularies meet. cardRoute() collapses a film and a home
// movie to the same nav route, so a ＋Queue press keys off the section.
export var SECTION_MEDIA_TYPE = {
  films: 'film',
  'home-movies': 'home-movie',
  'music-videos': 'music-video',
  music: 'music'
};

var POST = {
  queue: function(serverUrl, config, person, body) { return queuePlaybackAction(serverUrl, config.mediaType, config.add.action, person, body); },
  'music-video': function(serverUrl, config, person, body) { return musicVideoPlaybackAction(serverUrl, config.add.action, person, body); },
  music: function(serverUrl, config, person, body) { return playbackAction(serverUrl, config.add.action, person, body); }
};

// THE ＋Queue producer. Every ＋ affordance — browse tile, rail-grid badge,
// clip/track list row, on either surface — routes through this instead of
// keeping its own dispatch table, which is how home movies' five producers
// ended up still posting to an engine its player had stopped reading.
export function queueAdd(serverUrl, mediaType, person, itemId) {
  var config = QUEUE_SHELL_CONFIG[mediaType];
  var body = {};
  body[config.add.bodyKey] = itemId;
  return POST[config.add.engine](serverUrl, config, person, body);
}

// The confirmation a ＋Queue press shows once it lands.
export function queueAddStatus(mediaType) {
  return QUEUE_SHELL_CONFIG[mediaType].add.status;
}
