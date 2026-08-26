// TASK-501 (FEAT-497) — browse's Continue cluster, as DATA. Browse offers one
// Continue button per media type; pressing one carries on with that type — the
// front of its queue, or, with nothing queued, the next item of the source this
// person was last playing.
//
// That rule is the queue engine's own advance(), fired as its `next` action by
// the player's continue entry (screen-video-page.js / screen-audio-page.js), so
// nothing here does queue maths — and whether a button is live is
// queue-shell-view.js's own transportState().next, the same rule ⏭ lights from,
// read off the same read-only snapshot. The only per-type facts left are the
// button's identity, its label and which player page a press lands on.
//
// ⛔ A fifth media type is an entry in CONTINUE_TYPES, not a fifth hand-written
// button on each of two surfaces.

// Which player page carries on with a type. Films, home movies and music
// videos all play in the video player; music in the audio player. Both pages
// read `continueType` and fire `next` on that media type's engine.
var PLAYER_PAGE = {
  film: 'video.html',
  'home-movie': 'video.html',
  music: 'audio.html',
  'music-video': 'video.html'
};

// The four buttons, in home-rails.js SECTION_ORDER order, so the menu reads
// down in the same order as the browse tabs. TV Series has no entry of its own:
// an episode is a film-engine item, so Films carries on with a series too.
export var CONTINUE_TYPES = [
  { mediaType: 'film', id: 'btn-continue-film', label: 'Films' },
  { mediaType: 'home-movie', id: 'btn-continue-home-movie', label: 'Home Movies' },
  { mediaType: 'music', id: 'btn-continue-music', label: 'Music' },
  { mediaType: 'music-video', id: 'btn-continue-music-video', label: 'Music Videos' }
];

// Where a press goes — the { page, params } shape both surfaces' nav funnels
// already take (the TV navigates itself; the companion sends it as a `navigate`
// intent, so the TV does exactly what its own button does).
export function continueTarget(mediaType) {
  return { page: PLAYER_PAGE[mediaType], params: { continueType: mediaType, from: 'browse' } };
}

// The button's face — one wording, four types, so neither surface spells it out
// and the two cannot drift.
export function continueLabel(entry) {
  return '▶ Continue ' + entry.label;
}
