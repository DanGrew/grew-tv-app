import {
  HOME_MOVIE, FILM, MUSIC, MUSIC_VIDEO,
  QUEUE_SHELL_CONFIG, SECTION_MEDIA_TYPE, queueAdd, queueAddStatus
} from '../../core/queue-shell-config.js';
import { transportState } from '../../core/queue-shell-view.js';

function fakeFetch() {
  var calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 204, json: async () => ({}), text: async () => '' }; };
  return calls;
}

describe('the per-type configs', () => {
  it('registers every media type under the engine key the queue engine uses', () => {
    expect(QUEUE_SHELL_CONFIG).toEqual({
      'home-movie': HOME_MOVIE, film: FILM, music: MUSIC, 'music-video': MUSIC_VIDEO
    });
    expect(Object.keys(QUEUE_SHELL_CONFIG).map(k => QUEUE_SHELL_CONFIG[k].mediaType)).toEqual(Object.keys(QUEUE_SHELL_CONFIG));
  });

  it('names each type with its own media noun', () => {
    expect([HOME_MOVIE.noun, HOME_MOVIE.nounPlural]).toEqual(['clip', 'clips']);
    expect([FILM.noun, FILM.nounPlural]).toEqual(['title', 'titles']);
    expect([MUSIC.noun, MUSIC.nounPlural]).toEqual(['track', 'tracks']);
    expect([MUSIC_VIDEO.noun, MUSIC_VIDEO.nounPlural]).toEqual(['video', 'videos']);
  });

  it('gives each type a fallback glyph', () => {
    expect(HOME_MOVIE.glyph).toBe('&#127916;');
    expect(FILM.glyph).toBe('&#127916;');
    expect(MUSIC.glyph).toBe('&#127925;');
    expect(MUSIC_VIDEO.glyph).toBe('&#127916;');
  });

  // The design's single-shared-design clause: no type carries its own rule.
  it('puts every type on the shell transport rule, none of its own', () => {
    expect(HOME_MOVIE.transport).toBe(transportState);
    expect(FILM.transport).toBe(transportState);
    expect(MUSIC.transport).toBe(transportState);
    expect(MUSIC_VIDEO.transport).toBe(transportState);
  });
});

describe('sourceSubtitle', () => {
  it('derives home movies from the snapshot: person, month, and the whole catalog', () => {
    expect(HOME_MOVIE.sourceSubtitle({ source_type: 'home-movies-by-person', source_id: 'millie' }, 'IGNORED')).toBe('Millie');
    expect(HOME_MOVIE.sourceSubtitle({ source_type: 'home-movie-month', source_id: '2026-01' }, 'IGNORED')).toBe('Jan 2026');
    expect(HOME_MOVIE.sourceSubtitle({ source_type: 'home-movies-all', source_id: null }, 'IGNORED')).toBe('All');
  });

  it('reads the caller lookup for a type whose source id is opaque', () => {
    expect(FILM.sourceSubtitle({ source_type: 'series', source_id: 'toy-story' }, 'Toy Story Collection')).toBe('Toy Story Collection');
    expect(MUSIC.sourceSubtitle({ source_type: 'album', source_id: 'ootb' }, 'Out of the Blue')).toBe('Out of the Blue');
    expect(MUSIC_VIDEO.sourceSubtitle({ source_type: 'artist', source_id: 'elo' }, 'ELO')).toBe('ELO');
  });

  it('names nothing for a standalone item with no source to name', () => {
    expect(FILM.sourceSubtitle({ source_type: null, source_id: null }, null)).toBe('');
    expect(FILM.sourceSubtitle({ source_type: null, source_id: null }, undefined)).toBe('');
    expect(FILM.sourceSubtitle({ source_type: null, source_id: null }, '')).toBe('');
  });
});

describe('rowSub', () => {
  it('is the item duration for films and home movies', () => {
    expect(HOME_MOVIE.rowSub({ duration: 61, artist: 'IGNORED' })).toBe('1:01');
    expect(FILM.rowSub({ duration: 5760 })).toBe('1:36:00');
  });

  it('is the artist for music and music videos', () => {
    expect(MUSIC.rowSub({ duration: 245, artist: 'ELO' })).toBe('ELO');
    expect(MUSIC_VIDEO.rowSub({ duration: 245, artist: 'ELO' })).toBe('ELO');
  });

  it('falls back to the duration when a track carries no artist', () => {
    expect(MUSIC.rowSub({ duration: 245, artist: null })).toBe('4:05');
    expect(MUSIC.rowSub({ duration: 245 })).toBe('4:05');
    expect(MUSIC.rowSub({ duration: 245, artist: '' })).toBe('4:05');
  });

  it('is empty when there is neither', () => {
    expect(MUSIC.rowSub({})).toBe('');
    expect(HOME_MOVIE.rowSub({})).toBe('');
  });
});

describe('the ＋Queue map', () => {
  it('maps every browse section name onto its media type', () => {
    expect(SECTION_MEDIA_TYPE).toEqual({
      films: 'film', 'home-movies': 'home-movie', 'music-videos': 'music-video', music: 'music'
    });
    Object.keys(SECTION_MEDIA_TYPE).forEach(function(section) {
      expect(QUEUE_SHELL_CONFIG[SECTION_MEDIA_TYPE[section]]).toBeTruthy();
    });
  });

  it('posts a film to the unified engine, appending to the queue', async () => {
    var calls = fakeFetch();
    await queueAdd('http://s', 'film', 'millie', 'toy-story-main');
    expect(calls[0].url).toBe('http://s/api/queue/film/queue-item?person=millie');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ item_id: 'toy-story-main' });
  });

  // The exact producer bug TASK-499 left behind: home movies posted to an
  // engine its own player had stopped reading.
  it('posts a home movie to the SAME unified engine, not the retired video engine', async () => {
    var calls = fakeFetch();
    await queueAdd('http://s', 'home-movie', 'millie', 'beach-day');
    expect(calls[0].url).toBe('http://s/api/queue/home-movie/queue-item?person=millie');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ item_id: 'beach-day' });
  });

  it('leaves music videos on their own engine until TASK-505 cuts them over', async () => {
    var calls = fakeFetch();
    await queueAdd('http://s', 'music-video', 'millie', 'mv-1');
    expect(calls[0].url).toBe('http://s/api/music-video-playback/queue-video?person=millie');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ video_id: 'mv-1' });
  });

  // TASK-504 — music joined them: a ＋ press appends to the unified queue
  // instead of jumping to Play Next on playback_engine.py's own list.
  it('posts a track to the SAME unified engine, not the retired music engine', async () => {
    var calls = fakeFetch();
    await queueAdd('http://s', 'music', 'millie', 'ootb-02');
    expect(calls[0].url).toBe('http://s/api/queue/music/queue-item?person=millie');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ item_id: 'ootb-02' });
  });

  it('POSTs JSON', async () => {
    var calls = fakeFetch();
    await queueAdd('http://s', 'film', 'millie', 'up');
    expect(calls[0].opts.method).toBe('POST');
    expect(calls[0].opts.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('confirms an append for the types on the unified engine, play-next for the one still migrating', () => {
    expect(queueAddStatus('film')).toBe('Added to Queue');
    expect(queueAddStatus('home-movie')).toBe('Added to Queue');
    expect(queueAddStatus('music')).toBe('Added to Queue');
    expect(queueAddStatus('music-video')).toBe('Queued to Play Next');
  });
});
