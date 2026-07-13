import { screenPage, titleCase, skipLabel, displayTitle, displayLabel, getContentBasePath, seriesIdFromSnap, tileHint, queryString } from '../../core/companion-utils.js';

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
  it('is blank when suppressed, even mid-watch (music — no mid-song resume, TASK-276)', () => {
    expect(tileHint({ bluey: { resumePositionSec: 168 } }, { id: 'bluey', durationSec: 420 }, true)).toBe('');
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

describe('screenPage', () => {
  it('returns context_id unchanged for a real leaf screen', () => {
    expect(screenPage('profile')).toBe('profile');
    expect(screenPage('detail')).toBe('detail');
    expect(screenPage('audio')).toBe('audio');
    expect(screenPage('video')).toBe('video');
    expect(screenPage('artist')).toBe('artist');
    expect(screenPage('playlist')).toBe('playlist');
    expect(screenPage('error')).toBe('error');
  });
  // BUG-052 — the companion has no rail-grid.html (the drill level lives in
  // browse.html), so the 'rail-grid' drill context must resolve to 'browse', not a
  // non-existent 'rail-grid.html' page. 'browse' already resolves to itself.
  it('maps the rail-grid drill context to browse (no rail-grid.html exists)', () => {
    expect(screenPage('rail-grid')).toBe('browse');
  });
  it('leaves the browse drill context as browse', () => {
    expect(screenPage('browse')).toBe('browse');
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
  it('only strips a LEADING origin (the regex is anchored to the start)', () => {
    // An http:// that is not at the start is part of the path and must survive —
    // the ^ anchor is load-bearing.
    expect(getContentBasePath({ contentBase: '/local/http://cdn/z' })).toBe('/local/http://cdn/z');
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
