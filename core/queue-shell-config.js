// TASK-515 (FEAT-497) — everything the Queue UX shell needs to know about a
// media type, as DATA. core/queue-shell-view.js renders the design; this says
// what a clip is called, what glyph stands in for missing art, how the hero's
// source line and a row's muted second line resolve, and which engine a ＋Queue
// press posts to. A new media type is a new entry here, not new code — TASK-542
// added the fifth, TV series, by writing one.
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
//   add            — the ＋Queue map entry: which action, which body key, and
//                    the confirmation wording.
//
// Which media type a ＋ press addresses is NOT a per-screen decision: it comes
// from the item's own itemType through ITEM_MEDIA_TYPE below (BUG-531).
//
// ⛔ A difference discovered between two types is a defect to fix toward
// docs/QUEUE-UX-SHELL.md, not a precedent to codify as a new config field.

import { transportState, durationText } from './queue-shell-view.js';
import { homeMoviesSourceLabel } from './home-rails.js';
import { queuePlaybackAction } from './app-api.js';

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

// ＋Queue routing. TASK-505 cut the last media type over, so every ＋ press
// now lands the same way: the TASK-498 unified engine's append-only queue-item
// (FEAT-497's model — hence "Added to Queue"). Nothing routes to a
// pre-FEAT-497 engine any more, which is why there is no per-type engine
// field left to route on.
var APPEND = { action: 'queue-item', bodyKey: 'item_id', status: 'Added to Queue' };

// BUG-530 — the ＋ sheet's own top option, in the same words as the
// confirmation APPEND above hands back. It read "☰ Play Next" on all six track
// sheets long after TASK-504/505 had put the last type on the append, so the
// sheet promised the front of the Queue and the toast then confirmed the end
// of it. One constant, not a per-type field: every type appends, so the option
// says the same thing everywhere — a type that wanted its own word here would
// be the difference this file's ⛔ says to fix, not to codify. ☰ is the Queue
// glyph the shell already uses for the page this press fills.
export var QUEUE_ADD_LABEL = '☰ Add to Queue';

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

// TASK-542 (FEAT-541) — TV series, the fifth media type. The entry that makes
// the Queue page call its items EPISODES where the film entry above says
// "title": the shared empty/ends wording reads the noun, so "nothing plays
// after the last episode" needs no new copy, only this field. Its source is a
// series id — opaque, like a boxset's, so the caller supplies the title.
export var SERIES = {
  mediaType: 'series',
  noun: 'episode', nounPlural: 'episodes',
  glyph: '&#128250;',
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
  // TASK-504: music appends to the end of the Queue like every cut-over type,
  // where it used to jump the press to Play Next on its own engine.
  add: APPEND
};

export var MUSIC_VIDEO = {
  mediaType: 'music-video',
  noun: 'video', nounPlural: 'videos',
  glyph: '&#127916;',
  sourceSubtitle: suppliedSource,
  rowSub: artistSub,
  transport: transportState,
  // TASK-505: a music video appends to the end of the Queue like every other
  // cut-over type, where a ＋ press used to jump it to the front of the
  // playing head on the music-video engine's own queue-video.
  add: APPEND
};

export var QUEUE_SHELL_CONFIG = {
  'home-movie': HOME_MOVIE,
  film: FILM,
  series: SERIES,
  music: MUSIC,
  'music-video': MUSIC_VIDEO
};

// BUG-531 — which Queue a ＋ press fills, decided by the item's OWN itemType.
// Every ＋ producer holds the item or card it was pressed on, so this is the
// one thing it needs to ask; before this, eight producers named a media type
// from the screen's own assumption and three read the card's browse SECTION,
// whose sectionOf() falls back to 'films' for an unstamped card — either way a
// press could file an item under a Queue it doesn't belong to, and the engine
// took it.
//
// A MAP, not branches: FEAT-541 split TV series out of the film media type,
// and `episode` was the one entry that flipped ('film' -> 'series', TASK-542).
// One line here against thirteen producers otherwise — every ＋ press on an
// episode moved queue without a single producer changing. The backend keeps the
// same map at api/queue_playback.py (_MEDIA_TYPE_BY_ITEM_TYPE), which refuses a
// press that still names the wrong Queue.
export var ITEM_MEDIA_TYPE = {
  film: 'film',
  episode: 'series',
  'home-movie': 'home-movie',
  track: 'music',
  'music-video': 'music-video'
};

// The Queue an item belongs in, from its own itemType. undefined for a type
// this app has no Queue for — queueAdd() below turns that into a failed press
// rather than a silent one.
export function itemMediaType(itemType) {
  return ITEM_MEDIA_TYPE[itemType];
}

// THE ＋Queue producer. Every ＋ affordance — browse tile, rail-grid badge,
// clip/track list row, on either surface — routes through this instead of
// keeping its own dispatch table, which is how home movies' five producers
// ended up still posting to an engine its player had stopped reading.
// TASK-505 retired the per-engine dispatch this used to route through: with
// every media type on the unified engine, the only thing that varies is
// which media_type the POST names.
// BUG-531 — two ways a ＋ press can fail, and both must reach the producer's
// own .catch() so the person sees it:
//   * no media type resolved. A synchronous throw would skip that catch
//     entirely, so this REJECTS instead.
//   * the server refused the item — a cross-type press its own guard will not
//     file (api/queue_playback.py). fetch() resolves on a 400, so without this
//     every producer's .then() fired and confirmed "Added to Queue" over an
//     item that was never added, which is worse than the wrong queue: it says
//     the press worked.
export function queueAdd(serverUrl, mediaType, person, itemId) {
  var config = QUEUE_SHELL_CONFIG[mediaType];
  if (!config) return Promise.reject(new Error('no queue for media type: ' + mediaType));
  var body = {};
  body[config.add.bodyKey] = itemId;
  return queuePlaybackAction(serverUrl, config.mediaType, config.add.action, person, body)
    .then(function(res) {
      if (!res.ok) throw new Error('queue refused ' + itemId + ': ' + res.status);
      return res;
    });
}

// The confirmation a ＋Queue press shows once it lands.
export function queueAddStatus(mediaType) {
  return QUEUE_SHELL_CONFIG[mediaType].add.status;
}
