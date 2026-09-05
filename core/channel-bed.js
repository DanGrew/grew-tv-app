// The music bed (FEAT-560/TASK-565, decision 13) — what a channel plays under
// its cards and its dead air, and WHERE IN THE ALBUM that is.
//
// ⚠️ THE BED RUNS ON ITS OWN WALL CLOCK, NEVER RESTARTED PER CARD. Start it at
// zero each time and you hear the first eight seconds of the same track forever,
// which is the jingle problem wearing the schedule's clothes. So the bed is
// modelled as a clock exactly like the channel itself: the album loops
// continuously against real time, and asking "what is playing right now" is a
// lookup, not a position anybody has to carry.
//
// That makes story 4 true by construction rather than by remembering: two cards
// seven minutes apart land seven minutes apart in the album, whether or not the
// same page, the same tab, or the same television is asking. It also survives a
// channel flip and a page reload, neither of which a remembered position does.
//
// A channel may name an album as its bed; a channel without one is legal and
// shows a silent card (the spec is explicit — don't require it), which is what
// every null answer below is for.

// The tracks a bed can actually play, from an /api/album detail.
//
// A track is dropped unless it can be both PLACED and FETCHED: a clock needs a
// length to walk, and a src needs an id and an extension. Dropping is right
// rather than defaulting — a track with no stated length would either stall the
// walk or need a made-up duration, and a made-up duration puts every later track
// at the wrong time for as long as the album loops.
// An absent album is read as an album with nothing in it rather than defaulted
// to an empty list: `[album].filter(Boolean)` drops the absence before anything
// asks it for items, so there is no `|| []` standing in for a case that never
// reaches the map. A default nobody can observe is a branch nothing can test.
export function bedTracks(album) {
  return [album]
    .filter(Boolean)
    .flatMap(function(entry) { return entry.items; })
    .map(function(item) { return (item || {}).video; })
    .filter(Boolean)
    .filter(function(video) { return video.id && video.ext && Number(video.duration) > 0; })
    .map(function(video) {
      return { id: video.id, title: video.title, artist: video.artist,
               ext: video.ext, duration: Number(video.duration) };
    });
}

// How long one pass through the bed takes.
export function bedTotal(tracks) {
  return (tracks || []).reduce(function(sum, track) { return sum + track.duration; }, 0);
}

// What the bed is playing at a given moment, as { track, offset }.
//
// `epochSeconds` is real time — the album is treated as looping continuously
// since the epoch, so any two callers asking at the same moment get the same
// answer and nothing has to be handed between them.
//
// Null with nothing playable, which is the silent card an album-less channel
// shows. A negative clock folds back into the loop rather than answering null:
// it cannot happen from Date.now(), and answering "no bed" for an arithmetic
// slip would silence the card for a reason nobody could see.
//
// Absence is read through bedTotal, which is the ONE place that tolerates it —
// no list to walk means no length, and no length is already the silent answer.
// Defaulting here as well would be a second guard on the same case, and a guard
// standing behind another guard can never be shown to do anything.
export function bedAt(tracks, epochSeconds) {
  var total = bedTotal(tracks);
  if (!(total > 0)) return null;
  var seconds = Number(epochSeconds);
  if (!isFinite(seconds)) return null;
  var into = ((seconds % total) + total) % total;
  // The LAST track that has already started by `into`. Written as one pass over
  // every track rather than an early return, so the answer is always one of the
  // tracks that made `total` and there is no "fell off the end" case to invent a
  // return value for — `into` is inside the loop by construction, and a branch
  // that can only be reached by breaking that construction is a branch nothing
  // can ever test.
  var found = tracks[0];
  var offset = into;
  var starts = 0;
  for (var i = 0; i < tracks.length; i++) {
    if (into >= starts) {
      found = tracks[i];
      offset = into - starts;
    }
    starts += tracks[i].duration;
  }
  return { track: found, offset: offset };
}

// The credit in the bottom-right corner (story 3). "What's this song" is a real
// question and the bed is playing anyway, so the answer is on screen.
//
// Title alone when the track names no artist — half the credit still answers the
// question, where a trailing separator with nothing after it just looks broken.
export function bedCredit(track) {
  var name = (track || {}).title;
  if (!name) return null;
  var artist = track.artist;
  return artist ? name + ' · ' + artist : name;
}

// The bare content name the /media/ route resolves — the same `{id}.{ext}` shape
// every other audio play in the app builds, off the track's OWN ext rather than a
// hardcoded one (an Apple Music export stays .m4a, and a hardcoded guess 404s).
export function bedSrcName(track) {
  var t = track || {};
  if (!t.id || !t.ext) return null;
  return t.id + '.' + t.ext;
}
