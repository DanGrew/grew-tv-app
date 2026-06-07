import { buildRails, buildTabs, buildTabRails, clampIndex } from '../../core/home-rails.js';

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
  it('shows a tab per content-type present, fixed order, no Continue when nothing mid-watch', () => {
    expect(buildTabs(TYPED, {}).map(t => t.id)).toEqual(['series', 'films', 'home-movies']);
  });

  it('leads with Continue when a video is mid-watch', () => {
    const progress = { nemo: { resumePositionSec: 100, lastPlayed: 1 } };
    expect(buildTabs(TYPED, progress).map(t => t.id)).toEqual(['continue', 'series', 'films', 'home-movies']);
  });

  it('uses display titles', () => {
    const byId = Object.fromEntries(buildTabs(TYPED, {}).map(t => [t.id, t.title]));
    expect(byId['home-movies']).toBe('Home Movies');
    expect(byId['films']).toBe('Films');
  });

  it('returns no tabs for empty content', () => {
    expect(buildTabs([], {})).toEqual([]);
    expect(buildTabs(null, null)).toEqual([]);
  });
});

describe('buildTabRails', () => {
  it('Films -> one genre rail per genre, A-Z by label, item in each matching rail', () => {
    const rails = buildTabRails('films', TYPED, {}, {});
    expect(rails.map(r => r.title)).toEqual(['Animation', 'Comedy']);   // A-Z
    expect(rails[0].items.map(c => c.id)).toEqual(['nemo', 'toy-story']); // A-Z by title; nemo via [type] fallback
    expect(rails[1].items.map(c => c.id)).toEqual(['toy-story']);
  });

  it('applies genreLabels overrides, else title-cases the slug', () => {
    const labelled = [{ kind: 'video', id: 'x', title: 'X', format: 'film', genres: ['rom-com'] }];
    expect(buildTabRails('films', labelled, {}, { 'rom-com': 'Rom-Com' })[0].title).toBe('Rom-Com');
    expect(buildTabRails('films', labelled, {}, {})[0].title).toBe('Rom Com');
  });

  it('Series tab groups series cards by genre', () => {
    const rails = buildTabRails('series', TYPED, {}, {});
    expect(rails.map(r => r.title)).toEqual(['Animation']);
    expect(rails[0].items.map(c => c.id)).toEqual(['bluey']);
  });

  it('Home Movies -> one rail per person + an Other rail for the untagged', () => {
    const rails = buildTabRails('home-movies', TYPED, {}, {});
    expect(rails.map(r => r.title)).toEqual(['Millie', 'Ollie', 'Other']); // A-Z incl Other
    const byTitle = Object.fromEntries(rails.map(r => [r.title, r.items.map(c => c.id)]));
    expect(byTitle['Millie']).toEqual(['m-park', 'm-walk']);     // both, A-Z by title (At The Park, Millie Walk)
    expect(byTitle['Ollie']).toEqual(['m-walk']);
    expect(byTitle['Other']).toEqual(['orphan']);
  });

  it('Continue tab is the resume feed, empty when nothing mid-watch', () => {
    expect(buildTabRails('continue', TYPED, {}, {})).toEqual([]);
    const progress = { nemo: { resumePositionSec: 100, lastPlayed: 1 } };
    const rails = buildTabRails('continue', TYPED, progress, {});
    expect(rails[0].id).toBe('continue');
    expect(rails[0].items.map(c => c.id)).toEqual(['nemo']);
  });

  it('does not mutate input cards', () => {
    buildTabRails('films', TYPED, {}, {});
    expect(TYPED[0].durationSec).toBeUndefined();
  });
});
