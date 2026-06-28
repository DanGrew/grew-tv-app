import { screenPage, titleCase, skipLabel, displayTitle, displayLabel, getContentBasePath, filterByTitle, seriesIdFromSnap, tileHint, tvStatusText, queryString } from '../../core/companion-utils.js';

describe('tileHint', () => {
  it('returns the rounded resume percent for a mid-watch item', () => {
    expect(tileHint({ bluey: { resumePositionSec: 168 } }, { id: 'bluey', durationSec: 420 })).toBe('40%');
  });
  it('is blank for an item with no progress entry', () => {
    expect(tileHint({}, { id: 'bluey', durationSec: 420 })).toBe('');
  });
  it('is blank for a fresh (zero-position) item', () => {
    expect(tileHint({ bluey: { resumePositionSec: 0 } }, { id: 'bluey', durationSec: 420 })).toBe('');
  });
  it('is blank for a finished item (not mid-watch)', () => {
    expect(tileHint({ bluey: { resumePositionSec: 420 } }, { id: 'bluey', durationSec: 420 })).toBe('');
  });
  it('tolerates a null map and a duration-less card', () => {
    expect(tileHint(null, { id: 'x' })).toBe('');
  });
});

describe('seriesIdFromSnap', () => {
  it('returns the series id for an episode (itemId !== episodeId)', () => {
    expect(seriesIdFromSnap({ itemId: 'bluey', episodeId: 'bluey-s1e03' })).toBe('bluey');
  });
  it('returns undefined for a film (itemId === episodeId)', () => {
    expect(seriesIdFromSnap({ itemId: 'toy-story-main', episodeId: 'toy-story-main' })).toBeUndefined();
  });
});

describe('filterByTitle', () => {
  const cards = [
    { id: 'a', title: 'Toy Story' },
    { id: 'b', title: 'The Dark Knight' },
    { id: 'c', title: 'toy soldiers' }
  ];
  it('returns all cards for an empty query', () => {
    expect(filterByTitle(cards, '').map(c => c.id)).toEqual(['a', 'b', 'c']);
    expect(filterByTitle(cards, '   ').map(c => c.id)).toEqual(['a', 'b', 'c']);
  });
  it('matches a case-insensitive substring', () => {
    expect(filterByTitle(cards, 'toy').map(c => c.id)).toEqual(['a', 'c']);
    expect(filterByTitle(cards, 'KNIGHT').map(c => c.id)).toEqual(['b']);
  });
  it('returns empty when nothing matches', () => {
    expect(filterByTitle(cards, 'zzz')).toEqual([]);
  });
  it('tolerates null cards and missing titles', () => {
    expect(filterByTitle(null, 'x')).toEqual([]);
    expect(filterByTitle([{ id: 'n' }], 'x')).toEqual([]);
  });
});

describe('screenPage', () => {
  it('returns context_id unchanged for standard screens', () => {
    expect(screenPage('profile')).toBe('profile');
    expect(screenPage('browse')).toBe('browse');
    expect(screenPage('detail')).toBe('detail');
    expect(screenPage('video')).toBe('video');
    expect(screenPage('error')).toBe('error');
  });
});

describe('titleCase', () => {
  it('capitalizes single word', () => {
    expect(titleCase('profile')).toBe('Profile');
  });
  it('replaces underscores with spaces and capitalizes', () => {
    expect(titleCase('resume_prompt')).toBe('Resume Prompt');
  });
  it('handles multi-word strings', () => {
    expect(titleCase('hello_world_test')).toBe('Hello World Test');
  });
});

describe('displayTitle', () => {
  it('returns title from display object', () => {
    expect(displayTitle({ display: { title: 'My Film' } })).toBe('My Film');
  });
  it('returns empty string when no display', () => {
    expect(displayTitle({})).toBe('');
  });
  it('returns empty string when title missing', () => {
    expect(displayTitle({ display: {} })).toBe('');
  });
});

describe('displayLabel', () => {
  it('returns titleCase of context_id', () => {
    expect(displayLabel({ context_id: 'browse' })).toBe('Browse');
  });
  it('returns empty string when no context_id', () => {
    expect(displayLabel({})).toBe('');
  });
});

describe('getContentBasePath', () => {
  it('strips origin from contentBase', () => {
    expect(getContentBasePath({ contentBase: 'http://localhost:8080/media' })).toBe('/media');
  });
  it('returns empty string when no manifestCache', () => {
    expect(getContentBasePath(null)).toBe('');
  });
  it('returns empty string when no contentBase', () => {
    expect(getContentBasePath({})).toBe('');
  });
});

describe('skipLabel', () => {
  it('returns mapped label for known seconds', () => {
    expect(skipLabel('skip_back_10')).toBe('10s');
    expect(skipLabel('skip_fwd_30')).toBe('30s');
    expect(skipLabel('skip_back_120')).toBe('2 min');
    expect(skipLabel('skip_back_300')).toBe('5 min');
    expect(skipLabel('skip_back_900')).toBe('15 min');
    expect(skipLabel('skip_back_1800')).toBe('30 min');
  });
  it('falls back to Xs for unknown seconds', () => {
    expect(skipLabel('skip_back_45')).toBe('45s');
  });
});

describe('tvStatusText (desync TV status strip)', () => {
  it('shows a play icon + title when playing', () => {
    expect(tvStatusText({ display: { title: 'Bluey' }, playing: true })).toBe('TV: ▶ Bluey');
  });
  it('shows a pause icon + title when paused', () => {
    expect(tvStatusText({ display: { title: 'Bluey' }, playing: false })).toBe('TV: ❚❚ Bluey');
  });
  it('reads as idle with no title (menu) or no snapshot', () => {
    expect(tvStatusText({ display: { title: '' }, playing: false })).toBe('TV: —');
    expect(tvStatusText(null)).toBe('TV: —');
  });
});

describe('queryString', () => {
  it('returns empty for no/empty params', () => {
    expect(queryString()).toBe('');
    expect(queryString({})).toBe('');
  });
  it('builds and encodes a query', () => {
    expect(queryString({ id: 'film 1' })).toBe('?id=film%201');
    expect(queryString({ tab: 'music', rail: 'r1' })).toBe('?tab=music&rail=r1');
  });
});
