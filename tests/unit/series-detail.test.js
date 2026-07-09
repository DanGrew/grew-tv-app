import { describe, it, expect } from 'vitest';
import { lastPlayedIndex, playNextIndex, firstItem, playNextLabel, primaryAction, upNextParts } from '../../core/series-detail.js';

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
  it('treats an unparseable lastPlayed string as epoch 0', () => {
    expect(lastPlayedIndex(items(['a', 'b']), { a: { lastPlayed: 'nonsense' }, b: { lastPlayed: 2000 } })).toBe(1);
  });
  it('keeps the earlier index when a later entry has a smaller timestamp', () => {
    expect(lastPlayedIndex(items(['a', 'b']), { a: { lastPlayed: 5000 }, b: { lastPlayed: 3000 } })).toBe(0);
  });
  it('tolerates missing items and progress (returns -1)', () => {
    expect(lastPlayedIndex()).toBe(-1);
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
  it('tolerates missing inputs (no items -> -1)', () => {
    expect(playNextIndex(null, null)).toBe(-1);
  });
});

describe('firstItem (BUG-005 wrap target)', () => {
  it('returns the first item — where Next/auto-advance wraps after the last episode', () => {
    expect(firstItem(items(['a', 'b', 'c'])).video.id).toBe('a');
  });
  it('returns null for an empty or absent list', () => {
    expect(firstItem([])).toBeNull();
    expect(firstItem(null)).toBeNull();
  });
});

// Numbered episodes carrying titles + a duration, for the label/action helpers.
function eps(specs) {
  return specs.map(function(s) { return { episode: s.n, video: { id: s.id, title: s.title, duration: 600 } }; });
}

var LIST = eps([{ n: 1, id: 'a', title: 'First Steps' }, { n: 2, id: 'b', title: 'Garden Walk' }, { n: 3, id: 'c', title: 'Breakie Grab' }]);

describe('primaryAction', () => {
  it('is the first episode (next) with no history', () => {
    expect(primaryAction(LIST, {})).toEqual({ kind: 'next', index: 0 });
  });
  it('advances to the following episode once the last-played one is finished', () => {
    expect(primaryAction(LIST, { a: { resumePositionSec: 0, lastPlayed: 5000 } })).toEqual({ kind: 'next', index: 1 });
  });
  it('continues the most-recent episode while it is mid-watch', () => {
    expect(primaryAction(LIST, { b: { resumePositionSec: 120, lastPlayed: 5000 } })).toEqual({ kind: 'continue', index: 1 });
  });
  it('wraps to the first episode once the final one is finished', () => {
    expect(primaryAction(LIST, { c: { resumePositionSec: 0, lastPlayed: 5000 } })).toEqual({ kind: 'again', index: 0 });
  });
  it('is none for an empty collection', () => {
    expect(primaryAction([], {})).toEqual({ kind: 'none', index: -1 });
  });
  it('tolerates missing inputs (no items/progress -> none)', () => {
    expect(primaryAction()).toEqual({ kind: 'none', index: -1 });
  });
});

describe('playNextLabel', () => {
  it('names the first episode with no history', () => {
    expect(playNextLabel(LIST, {})).toBe('Play next — "First Steps" (1)');
  });
  it('names the next episode once the last-played one is finished', () => {
    expect(playNextLabel(LIST, { a: { resumePositionSec: 0, lastPlayed: 5000 } })).toBe('Play next — "Garden Walk" (2)');
  });
  it('reads "Continue" while the most-recent episode is mid-watch', () => {
    expect(playNextLabel(LIST, { b: { resumePositionSec: 120, lastPlayed: 5000 } })).toBe('Continue — "Garden Walk" (2)');
  });
  it('reads "Start again" once the final episode is finished', () => {
    expect(playNextLabel(LIST, { c: { resumePositionSec: 0, lastPlayed: 5000 } })).toBe('Start again');
  });
  it('omits the number when a membership carries none', () => {
    var unnumbered = [{ video: { id: 'x', title: 'Bath Time' } }, { video: { id: 'y', title: 'Nap' } }];
    expect(playNextLabel(unnumbered, {})).toBe('Play next — "Bath Time"');
  });
  it('is bare "Play next" for an empty collection', () => {
    expect(playNextLabel([], {})).toBe('Play next');
  });
  it('tolerates missing inputs (bare "Play next")', () => {
    expect(playNextLabel(null)).toBe('Play next');
  });
});

describe('upNextParts', () => {
  it('prefixes a resolved next episode title', () => {
    expect(upNextParts({ video: { title: 'Breakie Grab' } })).toEqual({ prefix: 'Up next: ', label: 'Breakie Grab' });
  });
  it('reads "Start again" at the wrapping end of a series', () => {
    expect(upNextParts(null)).toEqual({ prefix: '', label: 'Start again' });
  });
});
