import { buildRails, buildTabs, buildTabRails, clampIndex, cardRoute } from '../../core/home-rails.js';

const cards = [
  { kind: 'video', id: 'film-a', title: 'A', duration: 600 },
  { kind: 'video', id: 'film-b', title: 'B', duration: 600 },
  { kind: 'series', id: 'millie', title: 'Millie' },
  { kind: 'series', id: 'ollie', title: 'Ollie' }
];

describe('buildRails', () => {
  it('omits Continue Watching when nothing is mid-watch', () => {
    const rails = buildRails(cards, {});
    expect(rails.map(r => r.id)).toEqual(['series', 'films']);
  });

  it('leads with Continue Watching when a video is mid-watch', () => {
    const progress = { 'film-b': { resumePositionSec: 120, lastPlayed: 5000 } };
    const rails = buildRails(cards, progress);
    expect(rails.map(r => r.id)).toEqual(['continue', 'series', 'films']);
    expect(rails[0].title).toBe('Continue Watching');
    expect(rails[0].items.map(c => c.id)).toEqual(['film-b']);
  });

  it('orders Continue Watching most-recently-played first', () => {
    const progress = {
      'film-a': { resumePositionSec: 100, lastPlayed: 1000 },
      'film-b': { resumePositionSec: 100, lastPlayed: 9000 }
    };
    expect(buildRails(cards, progress)[0].items.map(c => c.id)).toEqual(['film-b', 'film-a']);
  });

  it('splits videos into Films and series into Series', () => {
    const rails = buildRails(cards, {});
    const films = rails.find(r => r.id === 'films');
    const series = rails.find(r => r.id === 'series');
    expect(films.items.map(c => c.id)).toEqual(['film-a', 'film-b']);
    expect(series.items.map(c => c.id)).toEqual(['millie', 'ollie']);
  });

  it('exposes durationSec on cards for the tile model', () => {
    const films = buildRails(cards, {}).find(r => r.id === 'films');
    expect(films.items[0].durationSec).toBe(600);
  });

  it('does not mutate the input cards', () => {
    buildRails(cards, {});
    expect(cards[0].durationSec).toBeUndefined();
  });

  it('returns no rails for empty content', () => {
    expect(buildRails([], {})).toEqual([]);
    expect(buildRails(null, null)).toEqual([]);
  });

  it('treats a card with no kind as a video', () => {
    const rails = buildRails([{ id: 'x', title: 'X', duration: 10 }], {});
    expect(rails.map(r => r.id)).toEqual(['films']);
  });
});

// FEAT-020 — content-type tabs + per-type rails (TASK-138/139).
const TYPED = [
  { kind: 'video',  id: 'toy-story',  title: 'Toy Story',  format: 'film',       genres: ['animation', 'comedy'] },
  { kind: 'video',  id: 'nemo',       title: 'Finding Nemo', format: 'film',     type: 'animation' },             // no genres -> fallback [type]
  { kind: 'series', id: 'bluey',      title: 'Bluey',      format: 'tv-series',  genres: ['animation'] },
  { kind: 'video',  id: 'm-walk',     title: 'Millie Walk', format: 'home-movie', people: ['millie', 'ollie'] },
  { kind: 'video',  id: 'm-park',     title: 'At The Park', format: 'home-movie', people: ['millie'] },
  { kind: 'video',  id: 'orphan',     title: 'Orphan Clip', format: 'home-movie' }                                // no people -> Other
];

describe('clampIndex', () => {
  it('clamps below, above, and within range', () => {
    expect(clampIndex(-2, 3)).toBe(0);
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(1, 3)).toBe(1);
    expect(clampIndex(0, 0)).toBe(0);
  });
});

describe('buildTabs', () => {
  it('shows a tab per content-type present, fixed order, no Continue tab (TASK-150)', () => {
    expect(buildTabs(TYPED).map(t => t.id)).toEqual(['series', 'films', 'home-movies']);
  });

  it('uses display titles', () => {
    const byId = Object.fromEntries(buildTabs(TYPED).map(t => [t.id, t.title]));
    expect(byId['home-movies']).toBe('Home Movies');
    expect(byId['films']).toBe('Films');
  });

  it('returns no tabs for empty content', () => {
    expect(buildTabs([])).toEqual([]);
    expect(buildTabs(null)).toEqual([]);
  });
});

// TASK-149 /api/continue-watching row shape: carries format + the owning
// collection (series for an episode; null for a standalone film/home movie).
const CW = [
  { item_id: 'toy-story', title: 'Toy Story', poster: 't.jpg', position_secs: 100, duration_secs: 600, format: 'film', collection_id: null, collection_title: null },
  { item_id: 'm-walk', title: 'Millie Walk', poster: 'm.jpg', position_secs: 5, duration_secs: 30, format: 'home-movie', collection_id: null, collection_title: null },
  { item_id: 'bluey-s1e01', title: 'Daddy Putdown', poster: 'b.jpg', position_secs: 200, duration_secs: 420, format: 'tv-series', collection_id: 'bluey', collection_title: 'Bluey' }
];

describe('buildTabRails', () => {
  it('Films -> one genre rail per genre, A-Z by label, item in each matching rail', () => {
    const rails = buildTabRails('films', TYPED, [], {});
    expect(rails.map(r => r.title)).toEqual(['Animation', 'Comedy']);   // A-Z
    expect(rails[0].items.map(c => c.id)).toEqual(['nemo', 'toy-story']); // A-Z by title; nemo via [type] fallback
    expect(rails[1].items.map(c => c.id)).toEqual(['toy-story']);
  });

  it('applies genreLabels overrides, else title-cases the slug', () => {
    const labelled = [{ kind: 'video', id: 'x', title: 'X', format: 'film', genres: ['rom-com'] }];
    expect(buildTabRails('films', labelled, [], { 'rom-com': 'Rom-Com' })[0].title).toBe('Rom-Com');
    expect(buildTabRails('films', labelled, [], {})[0].title).toBe('Rom Com');
  });

  it('Series tab groups series cards by genre', () => {
    const rails = buildTabRails('series', TYPED, [], {});
    expect(rails.map(r => r.title)).toEqual(['Animation']);
    expect(rails[0].items.map(c => c.id)).toEqual(['bluey']);
  });

  it('Home Movies -> one rail per person + an Other rail for the untagged', () => {
    const rails = buildTabRails('home-movies', TYPED, [], {});
    expect(rails.map(r => r.title)).toEqual(['Millie', 'Ollie', 'Other']); // A-Z incl Other
    const byTitle = Object.fromEntries(rails.map(r => [r.title, r.items.map(c => c.id)]));
    expect(byTitle['Millie']).toEqual(['m-park', 'm-walk']);     // both, A-Z by title (At The Park, Millie Walk)
    expect(byTitle['Ollie']).toEqual(['m-walk']);
    expect(byTitle['Other']).toEqual(['orphan']);
  });

  it('does not mutate input cards', () => {
    buildTabRails('films', TYPED, CW, {});
    expect(TYPED[0].durationSec).toBeUndefined();
  });

  // TASK-150 — per-tab Continue Watching rail, built from the CW rows.
  it('prepends a Continue Watching rail of only this tab’s in-progress items', () => {
    const films = buildTabRails('films', TYPED, CW, {});
    expect(films[0].id).toBe('continue');
    expect(films[0].title).toBe('Continue Watching');
    expect(films[0].items.map(c => c.id)).toEqual(['toy-story']); // film only; m-walk + episode excluded

    const home = buildTabRails('home-movies', TYPED, CW, {});
    expect(home[0].id).toBe('continue');
    expect(home[0].items.map(c => c.id)).toEqual(['m-walk']);
  });

  it('Series CW rail shows the episode (not the series) labelled "{series} · {episode}"', () => {
    const rails = buildTabRails('series', TYPED, CW, {});
    expect(rails.map(r => r.id)).toEqual(['continue', 'genre:animation']); // CW rail leads, genre rail follows
    const cw = rails[0];
    expect(cw.items.map(c => c.id)).toEqual(['bluey-s1e01']);   // the episode id, not 'bluey'
    expect(cw.items[0].title).toBe('Bluey · Daddy Putdown');
    expect(cw.items[0].kind).toBe('video');                    // selecting plays the episode
    expect(cw.items[0].durationSec).toBe(420);                 // for the progress bar
  });

  it('keeps the backend newest-first CW order (does not re-sort A-Z)', () => {
    const cw = [
      { item_id: 'film-b', title: 'B', position_secs: 10, duration_secs: 100, format: 'film', collection_title: null },
      { item_id: 'film-a', title: 'A', position_secs: 10, duration_secs: 100, format: 'film', collection_title: null }
    ];
    const films = buildTabRails('films', [], cw, {});
    expect(films[0].items.map(c => c.id)).toEqual(['film-b', 'film-a']);
  });

  it('omits the Continue Watching rail when this tab has nothing in progress', () => {
    expect(buildTabRails('films', TYPED, [], {}).every(r => r.id !== 'continue')).toBe(true);
    expect(buildTabRails('films', TYPED, null, {}).every(r => r.id !== 'continue')).toBe(true);
  });
});

// FEAT-018 (TASK-130) — music: an Albums tab; albums = series cards
// format:"album"; standalone singles = video cards mediaType:"audio". `format`
// is NULL on audio rows, so routing is by these flags + collection membership.
const MUSIC = [
  { kind: 'video',  id: 'toy-story', title: 'Toy Story', format: 'film', genres: ['animation'] },
  { kind: 'series', id: 'ootb',      title: 'Out of the Blue', format: 'album', artist: 'ELO' },
  { kind: 'series', id: 'rumours',   title: 'Rumours',         format: 'album', artist: 'Fleetwood Mac' },
  { kind: 'video',  id: 'dancing-queen', title: 'Dancing Queen', mediaType: 'audio', artist: 'ABBA' }
];

describe('music tab routing (FEAT-018)', () => {
  it('adds an Albums tab when albums or singles are present, after the video tabs', () => {
    // MUSIC has a film + albums + a single (no tv-series), so: Films then Albums.
    expect(buildTabs(MUSIC).map(t => t.id)).toEqual(['films', 'albums']);
    expect(Object.fromEntries(buildTabs(MUSIC).map(t => [t.id, t.title]))['albums']).toBe('Albums');
  });

  it('keeps album series off the Series tab (an album series isn’t a series-tab card)', () => {
    const withSeries = MUSIC.concat([{ kind: 'series', id: 'bluey', title: 'Bluey', format: 'tv-series', genres: ['animation'] }]);
    expect(buildTabs(withSeries).map(t => t.id)).toEqual(['series', 'films', 'albums']);
    expect(buildTabRails('series', withSeries, [], {}).some(r => r.items.some(c => c.id === 'ootb'))).toBe(false);
  });

  it('keeps audio singles out of the Films tab', () => {
    expect(buildTabRails('films', MUSIC, [], {}).some(r => r.items.some(c => c.id === 'dancing-queen'))).toBe(false);
  });

  it('Albums tab -> Albums rail (A-Z) + Singles rail', () => {
    const rails = buildTabRails('albums', MUSIC, [], {});
    expect(rails.map(r => r.id)).toEqual(['albums', 'singles']);
    expect(rails[0].items.map(c => c.id)).toEqual(['ootb', 'rumours']); // A-Z: Out of the Blue, Rumours
    expect(rails[1].items.map(c => c.id)).toEqual(['dancing-queen']);
  });
});

// Album track CW rows carry the album as their collection (NULL format); a
// single's CW row is the single itself.
const MUSIC_CW = [
  { item_id: 'ootb-02', title: 'Mr. Blue Sky', position_secs: 110, duration_secs: 245, format: null, collection_id: 'ootb', collection_title: 'Out of the Blue' },
  { item_id: 'ootb-05', title: 'Wild West Hero', position_secs: 30, duration_secs: 300, format: null, collection_id: 'ootb', collection_title: 'Out of the Blue' },
  { item_id: 'dancing-queen', title: 'Dancing Queen', position_secs: 40, duration_secs: 230, format: null, collection_id: null, collection_title: null },
  { item_id: 'toy-story', title: 'Toy Story', position_secs: 100, duration_secs: 600, format: 'film', collection_id: null, collection_title: null }
];

describe('Continue Listening (collection-level, FEAT-018)', () => {
  it('rolls in-progress album tracks up to ONE album tile, not per track', () => {
    const rails = buildTabRails('albums', MUSIC, MUSIC_CW, {});
    expect(rails[0].id).toBe('continue');
    expect(rails[0].title).toBe('Continue Listening');
    // ootb has two in-progress tracks -> a single album tile; single keeps its own.
    expect(rails[0].items.map(c => c.id)).toEqual(['ootb', 'dancing-queen']);
    expect(rails[0].items[0].kind).toBe('series'); // album tile opens album detail
  });

  it('excludes music rows from the video tabs Continue Watching (no track leaks into Films)', () => {
    const films = buildTabRails('films', MUSIC, MUSIC_CW, {});
    expect(films[0].id).toBe('continue');
    expect(films[0].items.map(c => c.id)).toEqual(['toy-story']); // only the film, no track/single
  });

  it('omits Continue Listening when nothing music is in progress', () => {
    const rails = buildTabRails('albums', MUSIC, [{ item_id: 'toy-story', position_secs: 100, duration_secs: 600, format: 'film', collection_id: null }], {});
    expect(rails.every(r => r.id !== 'continue')).toBe(true);
  });
});

describe('cardRoute (browse navigation, FEAT-018)', () => {
  it('routes albums, singles, then falls back to kind', () => {
    expect(cardRoute({ kind: 'series', format: 'album' })).toBe('album');
    expect(cardRoute({ kind: 'video', mediaType: 'audio' })).toBe('single');
    expect(cardRoute({ kind: 'video', format: 'film' })).toBe('video');
    expect(cardRoute({ kind: 'series', format: 'tv-series' })).toBe('series');
    expect(cardRoute({ id: 'x' })).toBe('video'); // no kind -> video
  });
});
