// TASK-501 (FEAT-497) — browse's Continue cluster, as DATA. Browse offers one
// Continue button per media type; pressing one carries on with that type —
// TASK-555: the item this person was on if they stopped part-way through one,
// else the front of its queue, else the next item of the source they were last
// playing.
//
// That rule is the queue engine's own resume(), fired as its `continue` action
// by the player's continue entry (screen-video-page.js / screen-audio-page.js),
// so nothing here does queue maths — and whether a button is live is
// queue-shell-view.js's own transportState().next, which stays the ⏭ rule: a
// type with something playing has something to carry on with either way, so the
// two never disagree about the lit/dim state. The only per-type facts left are
// the button's identity, its label and which player page a press lands on.
//
// ⛔ A further media type is an entry in CONTINUE_TYPES, not a hand-written
// button on each of two surfaces — which is all TASK-542's fifth type took.

// Which player page carries on with a type. TV series, films, home movies and
// music videos all play in the video player; music in the audio player. Both
// pages read `continueType` and fire `continue` on that media type's engine.
var PLAYER_PAGE = {
  series: 'video.html',
  film: 'video.html',
  'home-movie': 'video.html',
  music: 'audio.html',
  'music-video': 'video.html'
};

// The five buttons, in home-rails.js SECTION_ORDER order, so the menu reads
// down in the same order as the browse tabs. TV Series earned its own entry in
// TASK-542: an episode used to be a film-engine item, so Films carried on with
// a series too — now that an episode advances on its own engine, Films can no
// longer reach one, and without this entry a part-watched series would have no
// Continue at all.
export var CONTINUE_TYPES = [
  { mediaType: 'series', id: 'btn-continue-series', label: 'TV Series' },
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

// The button's face — one wording, every type, so neither surface spells it out
// and the two cannot drift.
export function continueLabel(entry) {
  return '▶ Continue ' + entry.label;
}
