import {
  HOME_MOVIE, FILM, MUSIC, MUSIC_VIDEO,
  QUEUE_SHELL_CONFIG, ITEM_MEDIA_TYPE, itemMediaType, queueAdd, queueAddStatus,
  QUEUE_ADD_LABEL
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

// BUG-531 — which Queue a ＋ press fills is decided by the ITEM's own type,
// never by the screen it was pressed on. The map is the whole rule: FEAT-541
// splits TV series out of the film media type and `episode` is the one entry
// that flips, which is a one-line change here and thirteen producers otherwise.
describe('the item-type → media-type map', () => {
  it('maps every catalog item type onto the Queue it belongs to', () => {
    expect(ITEM_MEDIA_TYPE).toEqual({
      film: 'film',
      episode: 'film',
      'home-movie': 'home-movie',
      track: 'music',
      'music-video': 'music-video'
    });
  });

  it('only ever names a media type the queue engine actually serves', () => {
    Object.keys(ITEM_MEDIA_TYPE).forEach(function(itemType) {
      expect(QUEUE_SHELL_CONFIG[ITEM_MEDIA_TYPE[itemType]]).toBeTruthy();
    });
  });

  it('resolves each item type to its own Queue', () => {
    expect(itemMediaType('film')).toBe('film');
    expect(itemMediaType('episode')).toBe('film');
    expect(itemMediaType('home-movie')).toBe('home-movie');
    expect(itemMediaType('track')).toBe('music');
    expect(itemMediaType('music-video')).toBe('music-video');
  });

  it('names no Queue for an item type it does not know', () => {
    expect(itemMediaType('podcast')).toBeUndefined();
    expect(itemMediaType(null)).toBeUndefined();
    expect(itemMediaType(undefined)).toBeUndefined();
    expect(itemMediaType('')).toBeUndefined();
  });
});

describe('the ＋Queue map', () => {
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

  // TASK-505 — the last type to move: a ＋ press appends to the end of the
  // unified queue instead of front-inserting on the music-video engine's own
  // queue-video, so nothing jumps the line any more.
  it('posts a music video to the SAME unified engine, not the retired music-video engine', async () => {
    var calls = fakeFetch();
    await queueAdd('http://s', 'music-video', 'millie', 'mv-1');
    expect(calls[0].url).toBe('http://s/api/queue/music-video/queue-item?person=millie');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ item_id: 'mv-1' });
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

  // BUG-531 — a press whose media type never resolved must FAIL, visibly, in
  // the producer's own .catch(). Throwing synchronously would skip that catch
  // and the person would see nothing at all.
  // The rejection names the media type that failed to resolve — the one thing a
  // producer's .catch() has to go on when a press lands nowhere.
  it('fails the press rather than posting when no media type resolved', async () => {
    var calls = fakeFetch();
    await expect(queueAdd('http://s', undefined, 'millie', 'mystery'))
      .rejects.toThrow('no queue for media type: undefined');
    expect(calls).toEqual([]);
  });

  it('fails the press for a media type the engine does not serve', async () => {
    var calls = fakeFetch();
    await expect(queueAdd('http://s', 'podcast', 'millie', 'ep-1'))
      .rejects.toThrow('no queue for media type: podcast');
    expect(calls).toEqual([]);
  });

  // BUG-531 — the server REFUSING an item (a cross-type press it will not file)
  // is a failed press, not a quiet one. fetch resolves on a 400, so without
  // this every producer's .then() fired and toasted "Added to Queue" over an
  // item that was never added.
  // The refusal names the item AND the status the server answered with — a
  // cross-type press and a server fault read differently in the console.
  it('fails the press when the server refuses the item', async () => {
    global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'wrong type' }), text: async () => '' });
    await expect(queueAdd('http://s', 'music-video', 'millie', 'toy-story-main'))
      .rejects.toThrow('queue refused toy-story-main: 400');
  });

  it('lands the press on any 2xx the server answers with', async () => {
    global.fetch = async () => ({ ok: true, status: 204, json: async () => ({}), text: async () => '' });
    await expect(queueAdd('http://s', 'film', 'millie', 'toy-story-main')).resolves.toBeTruthy();
  });

  // BUG-530 — the ＋ sheet's own option offered "☰ Play Next" long after every
  // type had stopped front-inserting, so the sheet promised one thing and the
  // toast that followed confirmed another. The option names the append now, in
  // the same words as the confirmation.
  it('offers the append, not a jump to the front, on the ＋ sheet', () => {
    expect(QUEUE_ADD_LABEL).toBe('☰ Add to Queue');
  });

  it('says the same thing on the option as in the confirmation that follows', () => {
    expect(QUEUE_ADD_LABEL).toContain('Add to Queue');
    expect(queueAddStatus('music')).toContain('Added to Queue');
  });

  // Every media type is on the unified engine now, so every ＋ press confirms
  // the same thing — and says what it actually does.
  it('confirms an append for every media type', () => {
    expect(queueAddStatus('film')).toBe('Added to Queue');
    expect(queueAddStatus('home-movie')).toBe('Added to Queue');
    expect(queueAddStatus('music')).toBe('Added to Queue');
    expect(queueAddStatus('music-video')).toBe('Added to Queue');
  });
});
