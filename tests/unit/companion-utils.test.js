import { screenPage, titleCase, skipLabel, displayTitle, displayLabel, getContentBasePath, filterByTitle } from '../../core/companion-utils.js';

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
  it('maps resume_prompt to video', () => {
    expect(screenPage('resume_prompt')).toBe('video');
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
