import { describe, it, expect } from 'vitest';
import { lastPlayedIndex, playNextIndex } from '../../core/series-detail.js';

function items(ids) { return ids.map(function(id) { return { video: { id: id, durationSec: 600 } }; }); }

describe('lastPlayedIndex', () => {
  it('returns -1 when nothing has been played', () => {
    expect(lastPlayedIndex(items(['a', 'b', 'c']), {})).toBe(-1);
  });
  it('picks the highest lastPlayed timestamp', () => {
    var progress = {
      a: { resumePositionSec: 10, lastPlayed: 1000 },
      c: { resumePositionSec: 10, lastPlayed: 5000 },
      b: { resumePositionSec: 10, lastPlayed: 3000 }
    };
    expect(lastPlayedIndex(items(['a', 'b', 'c']), progress)).toBe(2);
  });
  it('parses ISO-string lastPlayed', () => {
    var progress = {
      a: { lastPlayed: '2026-01-01T00:00:00Z' },
      b: { lastPlayed: '2026-06-01T00:00:00Z' }
    };
    expect(lastPlayedIndex(items(['a', 'b']), progress)).toBe(1);
  });
  it('ignores entries with no/zero timestamp', () => {
    var progress = { a: { lastPlayed: 0 }, b: { resumePositionSec: 5 } };
    expect(lastPlayedIndex(items(['a', 'b']), progress)).toBe(-1);
  });
});

describe('playNextIndex', () => {
  it('returns first episode with no history', () => {
    expect(playNextIndex(items(['a', 'b', 'c']), {})).toBe(0);
  });
  it('returns the episode after the last-played one', () => {
    var progress = { a: { lastPlayed: 5000 } };
    expect(playNextIndex(items(['a', 'b', 'c']), progress)).toBe(1);
  });
  it('wraps last->first', () => {
    var progress = { c: { lastPlayed: 5000 } };
    expect(playNextIndex(items(['a', 'b', 'c']), progress)).toBe(0);
  });
  it('returns -1 for an empty list', () => {
    expect(playNextIndex([], {})).toBe(-1);
  });
});
