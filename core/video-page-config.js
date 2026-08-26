// TASK-524 (FEAT-497) — everything ui/screens/screen-video-page.js needs to
// know about a VIDEO media type, as DATA. The page used to carry three
// parallel copies of the same engine plumbing — sendMv/sendHm/sendFmAction,
// applyMv/applyHm/applyFmSnapshot, and an mv/hm/film entry in every one of its
// dispatch tables — so a fix for one type had to be made three times (and
// twice was drifted apart before anyone noticed). It now runs ONE sender, ONE
// snapshot apply and ONE entry path, and each type is an entry here.
//
// Follows core/queue-shell-config.js's precedent exactly: a per-type
// difference is a field, never a branch. A fourth video type is an entry here,
// not new code.
//
// The per-type shape:
//   engine        — the page's own rail key ('mv'/'hm'/'film'), which
//                   core/music-video-playthrough.js's entryMode() resolves to
//   mediaType     — the queue engine's own media_type ('music-video' &c.), the
//                   one thing every POST/GET and the WS push filter key on
//   shell         — this type's core/queue-shell-config.js entry, handed to
//                   the Queue shell
//   shuffleId /
//   repeatId      — the player control row's own pill ids. app/homeview/
//                   video.html carries three identical pairs, one per rail, of
//                   which exactly one is ever unhidden
//   resumes       — does an item resume from watch_progress, or always start
//                   at 0? A music video never resumes, by design (TASK-373)
//   countdown     — does the end of an item run the 5s "Up next" overlay, or
//                   advance straight away? Films count down; a short clip or a
//                   music video would read as a gap (TASK-487, docs/QUEUE.md
//                   rows 29/33)
//   fetchesSourceTitle / sourceTitle
//                 — a type whose source id is opaque (a series/boxset, a
//                   playlist/artist) fetches its display name; home movies
//                   derive theirs from the snapshot's own slugs, so they
//                   neither fetch nor need the Queue hero re-rendered when a
//                   fetch lands
//   sourceCrumbs  — does the breadcrumb name the playback SOURCE (a music
//                   video, TASK-422) or the series/film chain (FEAT-021)?
//   addsToPlaylist— does entry reveal "＋ Playlist"? Music-video-only
//                   (TASK-378)
//   context       — which keys of the companion context push this type owns.
//                   Every other type's keys go out at their empty values, the
//                   same as when three snapshot vars sat side by side and two
//                   of them were always {}
//
// ⛔ FOUR things that LOOK like they belong here are deliberately NOT fields.
// Collapsing the copies turned each of them up as a divergence — three rails
// answering the same question three ways, none of them on purpose — and the
// owner's call was to bring all three into line rather than freeze the drift
// as data (TASK-524):
//
//   the entry shape — a source entry names its tapped item with a follow-up
//                     play-item, on every rail. play-source has never read a
//                     body item_id (api/queue_playback.py), so films and music
//                     videos had been starting sources from the top; see
//                     ui/screens/screen-video-page.js's startSource.
//   the stale guard — every rail discards an entry-time recovery GET that
//                     predates its own play POST. Closes
//                     BUG-522-STALE-RESYNC-REMAINING-TYPES, which was the home
//                     movie rail alone.
//   the transport   — every rail's player control row runs
//                     core/queue-shell-view.js's ONE transportState rule
//                     (every control visible, dimmed when it has nothing to
//                     act on), which home movies alone never applied at the
//                     player row despite their own Queue hero applying it.
//   the record      — ONE videoRecord below, carrying both `ext` and
//                     `itemType`. A music video used to send `ext` alone and a
//                     film/home movie `itemType` alone; the engine's own
//                     _resolve_item puts BOTH on every snapshot entry for every
//                     media type, so a non-.mp4 home movie now plays and a
//                     music video's itemType now reaches the caption rule.

import { transportState } from './queue-shell-view.js';
import { HOME_MOVIE, FILM, MUSIC_VIDEO } from './queue-shell-config.js';
import { loadSeriesTitle, loadMusicVideoSourceTitle } from './app-api.js';

// (now_playing) -> the record player.playVideo() loads, for every video media
// type. `ext` picks the file (a music video's are not all .mp4, and neither is
// every home movie); `itemType` is what the player's caption rule reads to keep
// subtitles off a home movie. queue_engine's _resolve_item supplies both on
// every entry, so neither depends on which rail asked.
export function videoRecord(np) {
  return { id: np.item_id, title: np.title, subtitles: np.subtitles, ext: np.ext, itemType: np.itemType };
}

function seriesTitle(server, snap) {
  return loadSeriesTitle(server, snap.source_id);
}

// A music video's source is one of three kinds (playlist, artist, the whole
// catalog), so the lookup needs the snapshot's own source_type too.
function musicVideoTitle(server, snap) {
  return loadMusicVideoSourceTitle(server, snap.source_id, snap.source_type);
}

export var MUSIC_VIDEO_PAGE = {
  engine: 'mv',
  mediaType: 'music-video',
  shell: MUSIC_VIDEO,
  shuffleId: 'btn-mv-shuffle',
  repeatId: 'btn-mv-repeat',
  resumes: false,
  countdown: false,
  fetchesSourceTitle: true,
  sourceTitle: musicVideoTitle,
  sourceCrumbs: true,
  addsToPlaylist: true,
  context: { flag: 'musicVideo', shuffle: 'musicVideoShuffle', repeat: 'musicVideoRepeat', transport: 'musicVideoTransport' }
};

export var HOME_MOVIE_PAGE = {
  engine: 'hm',
  mediaType: 'home-movie',
  shell: HOME_MOVIE,
  shuffleId: 'btn-hm-shuffle',
  repeatId: 'btn-hm-repeat',
  resumes: true,
  countdown: false,
  fetchesSourceTitle: false,
  sourceTitle: null,
  sourceCrumbs: false,
  addsToPlaylist: false,
  context: { flag: 'homeMovie', shuffle: 'homeMovieShuffle', repeat: 'homeMovieRepeat', transport: 'homeMovieTransport' }
};

export var FILM_PAGE = {
  engine: 'film',
  mediaType: 'film',
  shell: FILM,
  shuffleId: 'btn-film-shuffle',
  repeatId: 'btn-film-repeat',
  resumes: true,
  countdown: true,
  fetchesSourceTitle: true,
  sourceTitle: seriesTitle,
  sourceCrumbs: false,
  addsToPlaylist: false,
  context: { flag: 'film', shuffle: 'filmShuffle', repeat: 'filmRepeat', transport: 'filmTransport' }
};

export var VIDEO_PAGE_CONFIG = { mv: MUSIC_VIDEO_PAGE, hm: HOME_MOVIE_PAGE, film: FILM_PAGE };

// Which rail an entryMode() answer drives. Mutually exclusive per page load,
// never a live switch — resolved once and used to key everything else.
//
// TASK-501 — the three Continue entries (browse's per-type Continue buttons)
// are rows here like any other entry: each names the media type its button was
// pressed for, so it advances that type's OWN engine and nothing downstream
// needs a continue branch of its own.
export var MODE_ENGINE = {
  mvPlaylist: 'mv', mvArtist: 'mv', mvItem: 'mv', mvAll: 'mv', continueMusicVideo: 'mv',
  homeMoviesAll: 'hm', homeMoviesPerson: 'hm', homeMoviesMonth: 'hm', continueHomeMovie: 'hm',
  series: 'film', single: 'film', queue: 'film', continueFilm: 'film'
};

// The engine's own registered source names, per entry mode — one table where
// music videos and home movies each kept their own (TASK-505/499), plus the
// series/boxset one startSeries used to pass inline. `series` covers a TV
// series AND a boxset: queue_engine.py registers them as two names for the
// identical catalog query, and the old engine tagged either 'series' too.
export var SOURCE_TYPE = {
  mvPlaylist: 'mv-playlist', mvArtist: 'mv-artist', mvAll: 'mv-all',
  homeMoviesAll: 'home-movies-all', homeMoviesPerson: 'home-movies-by-person', homeMoviesMonth: 'home-movie-month',
  series: 'series'
};

// Which nav param carries the source id for each of those modes. A
// whole-catalog Play All ('mv-all'/'home-movies-all') is a real source with no
// id at all, which is why the value is null rather than absent.
export var SOURCE_ID_PARAM = {
  mvPlaylist: 'mvPlaylist', mvArtist: 'mvArtist', mvAll: null,
  homeMoviesAll: null, homeMoviesPerson: 'homeMoviesPerson', homeMoviesMonth: 'homeMoviesMonth',
  series: 'seriesId'
};

// The source id for a mode, read out of the page's own resolved params.
export function sourceIdFor(mode, params) {
  var key = SOURCE_ID_PARAM[mode];
  if (!key) return null;
  return params[key];
}

// The companion context push (FEAT-017/TASK-499/503/505/517). The page drives
// exactly ONE rail per load, so the other two types' keys go out at their
// empty values — which is what three snapshot vars, two of them permanently
// {}, used to produce by accident. Building it from one live snapshot makes
// that explicit instead.
export function videoContext(engine, snapshot, sourceCrumb, display) {
  var config = VIDEO_PAGE_CONFIG[engine];
  var empty = transportState({});
  var context = {
    context_id: 'video',
    display: display,
    musicVideo: false,
    musicVideoShuffle: false,
    musicVideoRepeat: false,
    // Only ever set in music-video mode, so it rides the push unconditionally
    // exactly as it did when it was a bare var read straight off the closure.
    musicVideoSource: sourceCrumb,
    musicVideoTransport: empty,
    homeMovie: false,
    homeMovieShuffle: false,
    homeMovieRepeat: false,
    homeMovieTransport: empty,
    film: false,
    filmShuffle: false,
    filmRepeat: false,
    filmTransport: empty
  };
  context[config.context.flag] = true;
  context[config.context.shuffle] = !!snapshot.shuffle;
  context[config.context.repeat] = !!snapshot.repeat;
  // TASK-524 — home movies push a resolved transport too, where they used to
  // push none and leave the phone showing every control live. All three rails
  // now hand the companion the same resolved booleans off the same rule.
  context[config.context.transport] = transportState(snapshot);
  return context;
}
