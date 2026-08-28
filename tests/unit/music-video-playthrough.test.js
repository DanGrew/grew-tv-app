import { describe, it, expect } from 'vitest';
import { entryMode, playlistTrackTarget } from '../../core/music-video-playthrough.js';

describe('entryMode', () => {
  // TASK-501 — browse's Continue press. Each of the four types video.html
  // plays resolves to its OWN mode, which is what lets the page key its engine
  // off `mode` like every other entry rather than branching on a media type.
  // TASK-542 — a series continue is a mode of its own for the same reason it is
  // a queue of its own: 'continueFilm' would advance the WRONG engine.
  it('is a per-type continue mode when a Continue press names its media type', () => {
    expect(entryMode({ continueType: 'series' })).toBe('continueSeries');
    expect(entryMode({ continueType: 'film' })).toBe('continueFilm');
    expect(entryMode({ continueType: 'home-movie' })).toBe('continueHomeMovie');
    expect(entryMode({ continueType: 'music-video' })).toBe('continueMusicVideo');
  });
  // A Continue press carries no collection id, so it must not be read as one:
  // 'continueSeries' and 'series' are different entries onto the same rail.
  it('separates continuing a series from opening one', () => {
    expect(entryMode({ continueType: 'series' })).not.toBe('series');
    expect(entryMode({ continueType: 'series', isSeries: true, collectionType: 'boxset' })).toBe('continueSeries');
  });
  it('wins over every other entry param', () => {
    expect(entryMode({ continueType: 'film', playQueue: true, mvPlaylist: 'pl1', mvAll: true, homeMoviesAll: true, isSeries: true })).toBe('continueFilm');
  });
  // music carries on in audio.html's own entry, never here, so its media type
  // is not a video.html mode — it falls through like any unknown value.
  it('ignores a continueType this page does not play', () => {
    expect(entryMode({ continueType: 'music' })).toBe('single');
    expect(entryMode({ continueType: 'music', isSeries: true })).toBe('series');
    expect(entryMode({ continueType: 'nonsense', playQueue: true })).toBe('queue');
  });
  it('is "queue" when a video Play Queue is requested, over everything else', () => {
    expect(entryMode({ playQueue: true, mvPlaylist: 'pl1', mvArtist: 'ELO', mvItem: 'mv1', isSeries: true })).toBe('queue');
  });
  it('is "mvPlaylist" when a music-video playlist id is given', () => {
    expect(entryMode({ mvPlaylist: 'pl1' })).toBe('mvPlaylist');
  });
  it('is "mvArtist" when a music-video artist is given (and no playlist)', () => {
    expect(entryMode({ mvArtist: 'ELO' })).toBe('mvArtist');
    expect(entryMode({ mvPlaylist: 'pl1', mvArtist: 'ELO' })).toBe('mvPlaylist');
  });
  it('is "mvItem" when a lone music video id is given (and no playlist/artist)', () => {
    expect(entryMode({ mvItem: 'mv1' })).toBe('mvItem');
    expect(entryMode({ mvArtist: 'ELO', mvItem: 'mv1' })).toBe('mvArtist');
  });
  it('is "mvAll" when Play All is requested (and no playlist/artist/item)', () => {
    expect(entryMode({ mvAll: true })).toBe('mvAll');
    expect(entryMode({ mvItem: 'mv1', mvAll: true })).toBe('mvItem');
  });
  it('is "homeMoviesAll" when the TASK-446 Home Movies Play All is requested (and no mv* param)', () => {
    expect(entryMode({ homeMoviesAll: true })).toBe('homeMoviesAll');
    expect(entryMode({ mvAll: true, homeMoviesAll: true })).toBe('mvAll');
  });
  it('is "homeMoviesPerson" when a TASK-486 Play All rail kid tile is tapped (and no All/mv* param)', () => {
    expect(entryMode({ homeMoviesPerson: 'Alice' })).toBe('homeMoviesPerson');
    expect(entryMode({ homeMoviesAll: true, homeMoviesPerson: 'Alice' })).toBe('homeMoviesAll');
    expect(entryMode({ mvAll: true, homeMoviesPerson: 'Alice' })).toBe('mvAll');
  });
  it('is "homeMoviesMonth" when a TASK-491 Play All by month tile is tapped (and no All/person/mv* param)', () => {
    expect(entryMode({ homeMoviesMonth: '2026-08' })).toBe('homeMoviesMonth');
    expect(entryMode({ homeMoviesPerson: 'Alice', homeMoviesMonth: '2026-08' })).toBe('homeMoviesPerson');
    expect(entryMode({ homeMoviesAll: true, homeMoviesMonth: '2026-08' })).toBe('homeMoviesAll');
    expect(entryMode({ mvAll: true, homeMoviesMonth: '2026-08' })).toBe('mvAll');
  });
  it('is a collection mode when a series id is flagged (and no music-video/home-movies param)', () => {
    expect(entryMode({ isSeries: true })).toBe('series');
    expect(entryMode({ mvItem: 'mv1', isSeries: true })).toBe('mvItem');
    expect(entryMode({ mvAll: true, isSeries: true })).toBe('mvAll');
    expect(entryMode({ homeMoviesAll: true, isSeries: true })).toBe('homeMoviesAll');
    expect(entryMode({ homeMoviesPerson: 'Alice', isSeries: true })).toBe('homeMoviesPerson');
    expect(entryMode({ homeMoviesMonth: '2026-08', isSeries: true })).toBe('homeMoviesMonth');
  });

  // TASK-542 — `?series=` carries a COLLECTION id, and detail.html has always
  // served a TV series and a film boxset through it identically. Which one it
  // is now decides the queue, so `collectionType` rides alongside. TASK-503
  // skipped threading it as "purely cosmetic"; this is the assertion that says
  // it isn't.
  it('splits a collection nav into a TV series and a boxset on collectionType', () => {
    expect(entryMode({ isSeries: true, collectionType: 'series' })).toBe('series');
    expect(entryMode({ isSeries: true, collectionType: 'boxset' })).toBe('boxset');
  });

  // Story 3: a boxset is films. Getting this branch wrong is where it shows.
  it('never calls a boxset a series', () => {
    expect(entryMode({ isSeries: true, collectionType: 'boxset' })).not.toBe('series');
  });

  // An old bookmark or a hand-typed URL carries no type. It reads as a TV
  // series — what the param was named for — rather than resolving to no mode.
  it('reads an unstamped collection nav as a TV series', () => {
    expect(entryMode({ isSeries: true })).toBe('series');
    expect(entryMode({ isSeries: true, collectionType: null })).toBe('series');
    expect(entryMode({ isSeries: true, collectionType: '' })).toBe('series');
    expect(entryMode({ isSeries: true, collectionType: 'album' })).toBe('series');
  });

  // collectionType alone is not an entry: it decides WHICH collection mode,
  // never that there is one. Without an id there is nothing to open.
  it('ignores collectionType when no series id is flagged', () => {
    expect(entryMode({ collectionType: 'boxset' })).toBe('single');
    expect(entryMode({ collectionType: 'series' })).toBe('single');
  });
  it('is "single" for a standalone film — the default with nothing set', () => {
    expect(entryMode({})).toBe('single');
    expect(entryMode(undefined)).toBe('single');
  });
});

describe('playlistTrackTarget', () => {
  var audioTarget = { page: 'audio.html', params: { playlist: 'pl-1', track: 'trk-1', from: 'detail-playlist' } };

  it('sends a music-video item to the video player, not the audio target', () => {
    var item = { video: { id: 'mv-1', itemType: 'music-video' } };
    expect(playlistTrackTarget(item, 'pl-1', audioTarget)).toEqual({
      page: 'video.html',
      params: { musicVideoPlaylist: 'pl-1', musicVideoTrack: 'mv-1', from: 'detail-playlist' }
    });
  });

  it('passes a track item straight through to the given audio target unchanged', () => {
    var item = { video: { id: 'trk-1', itemType: 'track' } };
    expect(playlistTrackTarget(item, 'pl-1', audioTarget)).toBe(audioTarget);
  });
});
