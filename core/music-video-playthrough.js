// TASK-374 — the "third, small" playthrough for a single music video, a
// music-video playlist, or an artist's music videos: order + current index
// live HERE, client-owned, never on a server engine. grew-tv already has two
// server-authoritative playback engines (the video source/queue engine,
// core/video-player-router.js; the music queue engine) — the owner
// deliberately ruled out routing a music video through either, so this module
// is its own small sequence, not a third view-model over one of theirs.
// No resume (every item always starts at 0 — TASK-373 already keeps a music
// video out of watch_progress backend-side; this module never reads or models
// a position). TASK-407 adds Shuffle + Repeat, still client-owned.

// seq: { items: [{id, title, ...}], index, order, shuffle, repeat }. items is
// never mutated here — the page builds a fresh seq (from a single pick, a
// resolved playlist or a filtered artist list, via initSeq) and this module
// only reads it or returns a fresh one. `order` is the playthrough's own
// resolved order, captured once at initSeq so toggling shuffle off can
// re-anchor to it; `shuffle`/`repeat` default falsy so every pre-TASK-407
// caller (a bare {items, index} literal) is unaffected.
function itemsOf(seq) { return (seq && seq.items) || []; }
function indexOf(seq) { return (seq && seq.index) || 0; }
function orderOf(seq) { return (seq && seq.order) || itemsOf(seq); }

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

// TASK-407 — Shuffle + Repeat. Gated everywhere on isMulti (story 4: a lone
// pick has nothing to shuffle or repeat).

// The seq a playthrough starts from — `order` is the playlist/artist's own
// resolved order, captured once so a later shuffle-off can return to it.
// Shuffle + Repeat both default ON (owner call): the tapped/first item still
// plays first — a start never jumps you away from the item you picked, same
// as toggleShuffle's own anchor rule — then a fresh fair shuffle of the rest
// follows behind it. An empty/not-yet-loaded seq (the pre-fetch placeholder)
// stays empty rather than anchoring a null.
export function initSeq(items, index, rng) {
  var current = items[index] || null;
  var shuffled = current === null ? items : [current].concat(fairShuffle(items.filter(function(it) { return it !== current; }), rng));
  return { items: shuffled, index: 0, order: items, shuffle: true, repeat: true };
}

// Fisher-Yates over an injectable rng (defaults to Math.random) — mirrors the
// shipped audio engine's fair_shuffle (grew-tv's
// media-manager/db/playback_engine.py): every element appears exactly once
// before any repeat. Returns a new array; `items` is untouched. The
// injectable rng keeps a test deterministic.
export function fairShuffle(items, rng) {
  var pick = rng || Math.random;
  var a = items.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(pick() * (i + 1));
    var tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

// Flip shuffle and rebuild the current pass — mirrors the shipped engine's
// toggle_shuffle wrap rule: ON anchors the CURRENTLY PLAYING item first
// (unchanged — a shuffle toggle never jumps mid-track), then lays a fresh
// fair shuffle of the rest of the base order behind it; OFF re-anchors to the
// base order at the playing item's own position, so ordered playback resumes
// from where you are, not the top.
export function toggleShuffle(seq, rng) {
  if (!seq) return seq;
  var on = !seq.shuffle;
  var base = orderOf(seq);
  var current = currentItem(seq);
  var items = on ? [current].concat(fairShuffle(base.filter(function(it) { return it !== current; }), rng)) : base;
  var index = on ? 0 : Math.max(0, base.indexOf(current));
  return Object.assign({}, seq, { shuffle: on, items: items, index: index });
}

// Flip repeat only — no rebuild (mirrors the shipped engine's toggle_repeat).
export function toggleRepeat(seq) {
  if (!seq) return seq;
  return Object.assign({}, seq, { repeat: !seq.repeat });
}

// True while a later item exists in the CURRENT pass, or (repeat on) the
// playthrough would wrap into a fresh one — the ⏭/auto-advance gate that
// replaces a bare hasNext check once repeat can keep a multi-item playthrough
// going past its last item.
export function canAdvance(seq) {
  return hasNext(seq) || (isMulti(seq) && !!seq.repeat);
}

// The playthrough after moving forward one step: a later item in the current
// pass advances the index; exhausting a repeating pass wraps to a fresh one —
// freshly shuffled when shuffle is on (story 2), the same base order from the
// top when it's off (story 3) — mirroring the shipped engine's advance()
// exhaustion branch. Returns `seq` unchanged when canAdvance is false
// (repeat-off exhaustion) — the caller's cue to stop instead.
export function nextSeq(seq, rng) {
  if (hasNext(seq)) return Object.assign({}, seq, { index: indexOf(seq) + 1 });
  if (!canAdvance(seq)) return seq;
  var base = orderOf(seq);
  var items = seq.shuffle ? fairShuffle(base, rng) : base;
  return Object.assign({}, seq, { items: items, index: 0 });
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

// Which entry function should run for a video.html load, in priority order:
// the durable video Play Queue wins if requested, then a music-video source
// (playlist beats artist beats a lone item pick beats the TASK-445 whole-
// catalog Play All — the four are mutually exclusive in practice; the
// priority is a defensive fallback, not a real choice), then the TASK-446
// Home Movies whole-catalog Play All (SERVER-authoritative — the video
// engine's own `home-movies-all` source, not a client-owned seq like the mv*
// modes above; screen-video-page.js's isMusicVideo stays false for it, so it
// gets the exact same snapshot-driven treatment a series already does), then
// a series, else a standalone single. Kept in core (not the page) because it
// branches — ui/** must stay cyclomatic-1.
export function entryMode(p) {
  var params = p || {};
  if (params.playQueue) return 'queue';
  if (params.mvPlaylist) return 'mvPlaylist';
  if (params.mvArtist) return 'mvArtist';
  if (params.mvItem) return 'mvItem';
  if (params.mvAll) return 'mvAll';
  if (params.homeMoviesAll) return 'homeMoviesAll';
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

// TASK-445 — every available music video across every artist (the Play All
// source), artist-then-title order: mirrors both the backend's own mv-all
// source (media-manager/db/content_store.get_all_music_video_ids, "ORDER BY
// artist, title") and the Music Videos tab's own A-Z artist rails
// (core/home-rails.js musicVideoRails), so Play All's order matches what the
// owner already sees browsing. Excludes playlist cards the same way
// musicVideoRails' own `videos` filter does (a playlist has no `artist`).
function artistOf(c) { return c.artist || ''; }
export function compareByArtistThenTitle(a, b) {
  var aa = artistOf(a);
  var ba = artistOf(b);
  if (aa < ba) return -1;
  if (aa > ba) return 1;
  return compareByTitle(a, b);
}
export function musicVideosAll(cards) {
  if (!cards) return [];
  var mine = cards.filter(function(c) { return c.section === 'music-videos' && c.artist; });
  return mine.sort(compareByArtistThenTitle);
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

// TASK-421 (story 3) — the twin dispatch key for a playlist row's "☰ Play Next":
// a music-video row POSTs to its OWN engine (FEAT-418), never the audio
// engine's queue-track, so the two Play Next lists stay apart. Same itemType
// signal playlistTrackTarget already reads, kept in core (both the TV
// playlist-detail page and its companion mirror call this — ui/** stays
// cyclomatic-1/pure-DOM-only).
export function playlistQueueKey(itemType) {
  return [itemType].filter(Boolean).concat(['track'])[0];
}
