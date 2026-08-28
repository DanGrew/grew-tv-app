import {
  MUSIC_VIDEO_PAGE, HOME_MOVIE_PAGE, FILM_PAGE, SERIES_PAGE,
  VIDEO_PAGE_CONFIG, MODE_ENGINE, SOURCE_TYPE, SOURCE_ID_PARAM,
  sourceIdFor, videoContext, videoRecord
} from '../../core/video-page-config.js';
import { HOME_MOVIE, FILM, SERIES, MUSIC_VIDEO } from '../../core/queue-shell-config.js';
import { entryMode } from '../../core/music-video-playthrough.js';

// TASK-524 — the video page drives three media types through ONE set of engine
// plumbing, and everything that genuinely differs between them lives here as
// data. These assert the DATA, because the data is the behaviour now: flip
// `resumes` and a film stops resuming; flip `countdown` and one grows a 5s gap
// between clips.

function fakeFetch(body) {
  var calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => body, text: async () => '' };
  };
  return calls;
}

describe('the per-type configs', () => {
  it('registers every rail under the key the page resolves off entryMode', () => {
    expect(VIDEO_PAGE_CONFIG).toEqual({ mv: MUSIC_VIDEO_PAGE, hm: HOME_MOVIE_PAGE, film: FILM_PAGE, series: SERIES_PAGE });
    Object.keys(VIDEO_PAGE_CONFIG).forEach(function(key) {
      expect(VIDEO_PAGE_CONFIG[key].engine).toBe(key);
    });
  });

  it('names each rail with the queue engine\'s own media_type', () => {
    expect(MUSIC_VIDEO_PAGE.mediaType).toBe('music-video');
    expect(HOME_MOVIE_PAGE.mediaType).toBe('home-movie');
    expect(FILM_PAGE.mediaType).toBe('film');
    expect(SERIES_PAGE.mediaType).toBe('series');
  });

  it('hands each rail its own Queue shell entry', () => {
    expect(MUSIC_VIDEO_PAGE.shell).toBe(MUSIC_VIDEO);
    expect(HOME_MOVIE_PAGE.shell).toBe(HOME_MOVIE);
    expect(FILM_PAGE.shell).toBe(FILM);
    expect(SERIES_PAGE.shell).toBe(SERIES);
    // The shell entry and the page entry must agree on which engine they post
    // to, or the Queue View and the player would drive different queues.
    Object.keys(VIDEO_PAGE_CONFIG).forEach(function(key) {
      expect(VIDEO_PAGE_CONFIG[key].shell.mediaType).toBe(VIDEO_PAGE_CONFIG[key].mediaType);
    });
  });

  it('points each rail at its own pair of player-row pills', () => {
    expect([MUSIC_VIDEO_PAGE.shuffleId, MUSIC_VIDEO_PAGE.repeatId]).toEqual(['btn-mv-shuffle', 'btn-mv-repeat']);
    expect([HOME_MOVIE_PAGE.shuffleId, HOME_MOVIE_PAGE.repeatId]).toEqual(['btn-hm-shuffle', 'btn-hm-repeat']);
    expect([FILM_PAGE.shuffleId, FILM_PAGE.repeatId]).toEqual(['btn-film-shuffle', 'btn-film-repeat']);
    expect([SERIES_PAGE.shuffleId, SERIES_PAGE.repeatId]).toEqual(['btn-series-shuffle', 'btn-series-repeat']);
  });

  // TASK-542 — every rail's pill pair is its own, because two rails sharing a
  // pair would leave one of them toggling the other's engine.
  it('gives no two rails the same pill', () => {
    var ids = Object.keys(VIDEO_PAGE_CONFIG)
      .map(function(k) { return [VIDEO_PAGE_CONFIG[k].shuffleId, VIDEO_PAGE_CONFIG[k].repeatId]; })
      .reduce(function(a, b) { return a.concat(b); }, []);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // TASK-373: a music video always starts at 0. A film and a home movie both
  // resume mid-watch from watch_progress.
  it('resumes a film, a series episode and a home movie, never a music video', () => {
    expect(FILM_PAGE.resumes).toBe(true);
    expect(SERIES_PAGE.resumes).toBe(true);
    expect(HOME_MOVIE_PAGE.resumes).toBe(true);
    expect(MUSIC_VIDEO_PAGE.resumes).toBe(false);
  });

  // TASK-487 / docs/QUEUE.md rows 29/33: a film counts down, and TASK-542 kept
  // the series rail on the same default — the countdown suits an episode as
  // much as a boxset film, so the split changed no transport default.
  it('runs the 5s "Up next" countdown for a film and a series episode', () => {
    expect(FILM_PAGE.countdown).toBe(true);
    expect(SERIES_PAGE.countdown).toBe(true);
    expect(HOME_MOVIE_PAGE.countdown).toBe(false);
    expect(MUSIC_VIDEO_PAGE.countdown).toBe(false);
  });

  // Home movies derive their hero source line from the snapshot's own slugs
  // (core/queue-shell-config.js), so they neither fetch a title nor need the
  // shell re-rendered when a fetch lands.
  it('fetches a source title only where the source id is opaque', () => {
    expect(FILM_PAGE.fetchesSourceTitle).toBe(true);
    expect(SERIES_PAGE.fetchesSourceTitle).toBe(true);
    expect(MUSIC_VIDEO_PAGE.fetchesSourceTitle).toBe(true);
    expect(HOME_MOVIE_PAGE.fetchesSourceTitle).toBe(false);
    expect(HOME_MOVIE_PAGE.sourceTitle).toBeNull();
  });

  // TASK-422: a music video's breadcrumb names its playback SOURCE; the other
  // two name the series/film chain (FEAT-021).
  it('names the playback source in the crumb for a music video alone', () => {
    expect(MUSIC_VIDEO_PAGE.sourceCrumbs).toBe(true);
    expect(HOME_MOVIE_PAGE.sourceCrumbs).toBe(false);
    expect(FILM_PAGE.sourceCrumbs).toBe(false);
    expect(SERIES_PAGE.sourceCrumbs).toBe(false);
  });

  // TASK-378: "＋ Playlist" is a music-video affordance only.
  it('reveals "＋ Playlist" on a music-video entry alone', () => {
    expect(MUSIC_VIDEO_PAGE.addsToPlaylist).toBe(true);
    expect(HOME_MOVIE_PAGE.addsToPlaylist).toBe(false);
    expect(FILM_PAGE.addsToPlaylist).toBe(false);
    expect(SERIES_PAGE.addsToPlaylist).toBe(false);
  });

  // ⛔ TASK-524 — the four things that are NOT fields, because collapsing the
  // copies turned each of them up as drift and the answer was to bring the
  // rails into line. Naming them here keeps a later "just add a config bit"
  // from quietly reopening one.
  it('keeps no per-rail bit for the entry shape, the stale guard, the transport rule or the record', () => {
    Object.keys(VIDEO_PAGE_CONFIG).forEach(function(key) {
      var config = VIDEO_PAGE_CONFIG[key];
      expect(config.staleGuard).toBeUndefined();
      expect(config.sharedTransport).toBeUndefined();
      expect(config.record).toBeUndefined();
      // Every rail pushes a resolved transport to the companion — home movies
      // used to push none and leave the phone showing every control live.
      expect(typeof config.context.transport).toBe('string');
    });
  });
});

// TASK-524 — ONE record for every video type. A music video used to send `ext`
// alone and a film/home movie `itemType` alone, so a non-.mp4 home movie could
// not play and a music video's itemType never reached the caption rule; the
// engine's own _resolve_item puts BOTH on every entry of every media type.
describe('the play record', () => {
  it('carries the file extension AND the item type, whichever rail asked', () => {
    var np = { item_id: 'mv-1', title: 'Mr Blue Sky', subtitles: 'mv-1.vtt', ext: 'webm', itemType: 'music-video', poster: 'IGNORED' };
    expect(videoRecord(np)).toEqual({ id: 'mv-1', title: 'Mr Blue Sky', subtitles: 'mv-1.vtt', ext: 'webm', itemType: 'music-video' });
  });

  // A .mov home movie is the case the old typedRecord dropped on the floor:
  // the player falls back to .mp4 when no ext rides the record.
  it('carries a home movie\'s own extension, which used to be dropped', () => {
    var clip = { item_id: 'beach-day', title: 'Beach Day', subtitles: null, ext: 'mov', itemType: 'home-movie' };
    expect(videoRecord(clip)).toEqual({ id: 'beach-day', title: 'Beach Day', subtitles: null, ext: 'mov', itemType: 'home-movie' });
  });
});

describe('the source-title lookup', () => {
  it('reads a film source through /api/series', async () => {
    var calls = fakeFetch({ title: 'Bluey' });
    expect(await FILM_PAGE.sourceTitle('http://s', { source_type: 'series', source_id: 'bluey' })).toBe('Bluey');
    expect(calls[0].url).toBe('http://s/api/series/bluey');
  });

  // A music video's source is one of three kinds, so the lookup dispatches on
  // the snapshot's own source_type — an artist source records the NAME as its
  // id, and Play All has no record to name at all.
  it('dispatches a music-video source on its source_type', async () => {
    expect(await MUSIC_VIDEO_PAGE.sourceTitle('http://s', { source_type: 'mv-artist', source_id: 'ELO' })).toBe('ELO');
    expect(await MUSIC_VIDEO_PAGE.sourceTitle('http://s', { source_type: 'mv-all', source_id: null })).toBe('All Music Videos');
    var calls = fakeFetch({ title: 'Saturday Videos' });
    expect(await MUSIC_VIDEO_PAGE.sourceTitle('http://s', { source_type: 'mv-playlist', source_id: 'sat' })).toBe('Saturday Videos');
    expect(calls[0].url).toBe('http://s/api/playlist/sat');
  });
});

describe('the entry-mode tables', () => {
  // TASK-501 added the Continue answers, one per video media type.
  // TASK-542 added 'boxset': a collection nav answers one of two modes now.
  // TASK-542 added 'continueSeries' too — a fifth media type's Continue button.
  var MODES = ['queue', 'mvPlaylist', 'mvArtist', 'mvItem', 'mvAll', 'homeMoviesAll', 'homeMoviesPerson', 'homeMoviesMonth', 'series', 'boxset', 'single',
               'continueSeries', 'continueFilm', 'continueHomeMovie', 'continueMusicVideo'];

  // The same totality argument TASK-525 used to prove the fourth rail dead:
  // entryMode is total over these answers, and every one maps to a rail that
  // exists — so no load can resolve to a rail this page cannot drive.
  it('maps every entryMode answer onto a rail that exists', () => {
    expect(Object.keys(MODE_ENGINE).sort()).toEqual(MODES.slice().sort());
    MODES.forEach(function(mode) {
      expect(VIDEO_PAGE_CONFIG[MODE_ENGINE[mode]]).toBeTruthy();
    });
  });

  it('resolves each rail\'s own modes', () => {
    expect(MODE_ENGINE.mvPlaylist).toBe('mv');
    expect(MODE_ENGINE.mvArtist).toBe('mv');
    expect(MODE_ENGINE.mvItem).toBe('mv');
    expect(MODE_ENGINE.mvAll).toBe('mv');
    expect(MODE_ENGINE.homeMoviesAll).toBe('hm');
    expect(MODE_ENGINE.homeMoviesPerson).toBe('hm');
    expect(MODE_ENGINE.homeMoviesMonth).toBe('hm');
    expect(MODE_ENGINE.single).toBe('film');
    expect(MODE_ENGINE.queue).toBe('film');
  });

  // TASK-542 — the split this task is. Both modes arrive on the same `?series=`
  // collection id, and sending a boxset to the series rail (or the reverse) is
  // exactly the coupling FEAT-541 ended.
  it('drives a TV series on its own rail and a boxset on the film one', () => {
    expect(MODE_ENGINE.series).toBe('series');
    expect(MODE_ENGINE.boxset).toBe('film');
  });

  // TASK-501 — a Continue press advances the engine of the type whose button
  // was pressed, so each continue mode sits on that type's OWN rail. Films and
  // home movies both play through video.html, and getting these two crossed is
  // exactly how a Continue Home Movies press would advance the film queue.
  it('puts each Continue answer on its own type\'s rail', () => {
    expect(MODE_ENGINE.continueSeries).toBe('series');
    expect(MODE_ENGINE.continueFilm).toBe('film');
    expect(MODE_ENGINE.continueHomeMovie).toBe('hm');
    expect(MODE_ENGINE.continueMusicVideo).toBe('mv');
  });

  // entryMode() itself must not answer something MODE_ENGINE has no row for.
  it('covers what entryMode actually returns for every param shape', () => {
    var SHAPES = [
      { playQueue: true }, { mvPlaylist: 'sat' }, { mvArtist: 'ELO' }, { mvItem: 'mv-1' }, { mvAll: '1' },
      { homeMoviesAll: '1' }, { homeMoviesPerson: 'millie' }, { homeMoviesMonth: '2026-01' },
      { isSeries: true }, { isSeries: true, collectionType: 'series' }, { isSeries: true, collectionType: 'boxset' },
      { isSeries: true, collectionType: 'nonsense' }, {},
      { continueType: 'series' }, { continueType: 'film' }, { continueType: 'home-movie' }, { continueType: 'music-video' }
    ];
    SHAPES.forEach(function(shape) {
      expect(MODE_ENGINE[entryMode(shape)]).toBeTruthy();
    });
  });

  it('names the engine source each source-driven mode plays', () => {
    expect(SOURCE_TYPE).toEqual({
      mvPlaylist: 'mv-playlist', mvArtist: 'mv-artist', mvAll: 'mv-all',
      homeMoviesAll: 'home-movies-all', homeMoviesPerson: 'home-movies-by-person', homeMoviesMonth: 'home-movie-month',
      series: 'series', boxset: 'boxset'
    });
  });

  // TASK-542 — a boxset used to open as source_type 'series' too, both names
  // resolving the identical catalog query. api/queue_playback.py allows
  // 'boxset' under `film` and 'series' under `series` alone now, so the name
  // is what keeps a boxset's films out of the TV Series Queue (story 3).
  it('opens a boxset as a boxset and a series as a series', () => {
    expect(SOURCE_TYPE.boxset).toBe('boxset');
    expect(SOURCE_TYPE.series).toBe('series');
    // Both read the same nav param — the collection id — which is why the
    // source TYPE is the only thing separating them.
    expect(SOURCE_ID_PARAM.boxset).toBe('seriesId');
    expect(SOURCE_ID_PARAM.series).toBe('seriesId');
  });

  // A standalone entry (a single film, a lone music-video pick) plays through
  // play-standalone and names no source at all, so it has no row here.
  it('gives a standalone entry no source at all', () => {
    expect(SOURCE_TYPE.single).toBeUndefined();
    expect(SOURCE_TYPE.mvItem).toBeUndefined();
    expect(SOURCE_TYPE.queue).toBeUndefined();
  });
});

describe('sourceIdFor', () => {
  var params = { mvPlaylist: 'sat', mvArtist: 'ELO', homeMoviesPerson: 'millie', homeMoviesMonth: '2026-01', seriesId: 'bluey' };

  it('reads the id out of each mode\'s own nav param', () => {
    expect(sourceIdFor('mvPlaylist', params)).toBe('sat');
    expect(sourceIdFor('mvArtist', params)).toBe('ELO');
    expect(sourceIdFor('homeMoviesPerson', params)).toBe('millie');
    expect(sourceIdFor('homeMoviesMonth', params)).toBe('2026-01');
    expect(sourceIdFor('series', params)).toBe('bluey');
  });

  // A whole-catalog Play All is a REAL source that carries no id — null, not
  // undefined, because the engine is sent the field either way.
  it('is null for a whole-catalog Play All, which has no id to send', () => {
    expect(sourceIdFor('mvAll', params)).toBeNull();
    expect(sourceIdFor('homeMoviesAll', params)).toBeNull();
    expect(SOURCE_ID_PARAM.mvAll).toBeNull();
    expect(SOURCE_ID_PARAM.homeMoviesAll).toBeNull();
  });

  it('is null for a mode with no source at all', () => {
    expect(sourceIdFor('single', params)).toBeNull();
    expect(sourceIdFor('mvItem', params)).toBeNull();
  });

  it('is null when the param the mode names is absent', () => {
    expect(sourceIdFor('homeMoviesPerson', { homeMoviesPerson: null })).toBeNull();
  });
});

describe('videoContext', () => {
  var DEAD = { previous: false, next: false, shuffle: false, repeat: false };
  var display = { id: 'x', title: 'X' };
  // A source with something ahead of it — every transport control live.
  var live = { shuffle: 1, repeat: 1, source_type: 'series', source_id: 'bluey', next: [{ item_id: 'b' }] };

  it('pushes a film\'s own keys, and leaves every other type\'s empty', () => {
    expect(videoContext('film', live, null, display)).toEqual({
      context_id: 'video',
      display: display,
      musicVideo: false, musicVideoShuffle: false, musicVideoRepeat: false,
      musicVideoSource: null, musicVideoTransport: DEAD,
      homeMovie: false, homeMovieShuffle: false, homeMovieRepeat: false, homeMovieTransport: DEAD,
      film: true, filmShuffle: true, filmRepeat: true,
      filmTransport: { previous: true, next: true, shuffle: true, repeat: true },
      series: false, seriesShuffle: false, seriesRepeat: false, seriesTransport: DEAD
    });
  });

  // TASK-542 — the series rail's own push. Asserted as an exact object for the
  // same reason the home-movie one is: a series that pushed `film: true` would
  // leave the phone's transport driving /api/queue/film while the TV played
  // /api/queue/series, and the mirror would be silently wrong rather than blank.
  it('pushes a series\' own keys, and leaves the film ones empty', () => {
    expect(videoContext('series', live, null, display)).toEqual({
      context_id: 'video',
      display: display,
      musicVideo: false, musicVideoShuffle: false, musicVideoRepeat: false,
      musicVideoSource: null, musicVideoTransport: DEAD,
      homeMovie: false, homeMovieShuffle: false, homeMovieRepeat: false, homeMovieTransport: DEAD,
      film: false, filmShuffle: false, filmRepeat: false, filmTransport: DEAD,
      series: true, seriesShuffle: true, seriesRepeat: true,
      seriesTransport: { previous: true, next: true, shuffle: true, repeat: true }
    });
  });

  it('pushes a music video\'s own keys, its source crumb included', () => {
    var crumb = { label: 'ELO', page: 'artist.html', params: { artist: 'ELO' } };
    expect(videoContext('mv', live, crumb, display)).toEqual({
      context_id: 'video',
      display: display,
      musicVideo: true, musicVideoShuffle: true, musicVideoRepeat: true,
      musicVideoSource: crumb,
      musicVideoTransport: { previous: true, next: true, shuffle: true, repeat: true },
      homeMovie: false, homeMovieShuffle: false, homeMovieRepeat: false, homeMovieTransport: DEAD,
      film: false, filmShuffle: false, filmRepeat: false, filmTransport: DEAD,
      series: false, seriesShuffle: false, seriesRepeat: false, seriesTransport: DEAD
    });
  });

  // TASK-524 — a home movie pushes a RESOLVED transport like the other two,
  // where it used to push none and leave the phone showing every control live
  // beside a Queue hero that dimmed them. Asserted as an exact object so an
  // accidental extra key fails.
  it('pushes a home movie\'s own keys, resolved transport included', () => {
    expect(videoContext('hm', live, null, display)).toEqual({
      context_id: 'video',
      display: display,
      musicVideo: false, musicVideoShuffle: false, musicVideoRepeat: false,
      musicVideoSource: null, musicVideoTransport: DEAD,
      homeMovie: true, homeMovieShuffle: true, homeMovieRepeat: true,
      homeMovieTransport: { previous: true, next: true, shuffle: true, repeat: true },
      film: false, filmShuffle: false, filmRepeat: false, filmTransport: DEAD,
      series: false, seriesShuffle: false, seriesRepeat: false, seriesTransport: DEAD
    });
  });

  // The end of a home-movie list: the source is still loaded, so Shuffle/Repeat
  // and ⏮ stay live, but ⏭ has nothing ahead of it and dims. That dimming is
  // the whole of the change — the row used to show it live regardless.
  it('dims ⏭ at the end of a home-movie list, where nothing used to dim', () => {
    var last = { shuffle: false, repeat: false, source_type: 'home-movies-by-person', source_id: 'millie', next: [], queue: [], coming_up: [] };
    expect(videoContext('hm', last, null, display).homeMovieTransport)
      .toEqual({ previous: true, next: false, shuffle: true, repeat: true });
  });

  // The empty snapshot the page holds before its first push: every flag off
  // bar the rail's own, every control dead.
  it('reads an empty snapshot as a dead transport with the rail still named', () => {
    var context = videoContext('film', {}, null, null);
    expect(context.film).toBe(true);
    expect(context.filmShuffle).toBe(false);
    expect(context.filmRepeat).toBe(false);
    expect(context.filmTransport).toEqual(DEAD);
    expect(context.display).toBeNull();
  });

  // ⏭ is live whenever ANYTHING is ahead, from the override queue as much as
  // the source — the one rule the Queue hero and the player row both read.
  it('lights ⏭ for a standalone item with something queued behind it', () => {
    var queued = { source_type: null, source_id: null, queue: [{ item_id: 'q' }] };
    expect(videoContext('film', queued, null, display).filmTransport)
      .toEqual({ previous: false, next: true, shuffle: false, repeat: false });
  });
});
