import { describe, it, expect } from 'vitest';
import { lastPlayedIndex, playNextIndex, playNextLabel, upNextParts, episodeNumOf, episodeText, playerTitle } from '../../core/series-detail.js';

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

// Numbered episodes carrying titles, for the label helpers.
function eps(specs) {
  return specs.map(function(s) { return { episode: s.n, video: { id: s.id, title: s.title } }; });
}

describe('playNextLabel', () => {
  var list = eps([{ n: 1, id: 'a', title: 'First Steps' }, { n: 2, id: 'b', title: 'Garden Walk' }, { n: 3, id: 'c', title: 'Breakie Grab' }]);

  it('names the first episode with no history', () => {
    expect(playNextLabel(list, {})).toBe('Play next — "First Steps" (1)');
  });
  it('names the episode after the last-played one', () => {
    expect(playNextLabel(list, { a: { lastPlayed: 5000 } })).toBe('Play next — "Garden Walk" (2)');
  });
  it('reads "Start again" once the final episode is the last-played', () => {
    expect(playNextLabel(list, { c: { lastPlayed: 5000 } })).toBe('Start again');
  });
  it('omits the number when a membership carries none', () => {
    var unnumbered = [{ video: { id: 'x', title: 'Bath Time' } }, { video: { id: 'y', title: 'Nap' } }];
    expect(playNextLabel(unnumbered, {})).toBe('Play next — "Bath Time"');
  });
  it('is bare "Play next" for an empty collection', () => {
    expect(playNextLabel([], {})).toBe('Play next');
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

describe('episodeNumOf', () => {
  var series = { items: eps([{ n: 1, id: 'a', title: 'A' }, { n: 2, id: 'b', title: 'B' }]) };
  it('finds the episode number for a member', () => {
    expect(episodeNumOf(series, 'b')).toBe(2);
  });
  it('is null for a non-member or absent series', () => {
    expect(episodeNumOf(series, 'z')).toBe(null);
    expect(episodeNumOf(null, 'a')).toBe(null);
  });
});

describe('episodeText', () => {
  it('uses the episode title when present', () => {
    expect(episodeText('Camping', 4)).toBe('Camping');
  });
  it('falls back to "Episode {N}" when the title is empty', () => {
    expect(episodeText('', 3)).toBe('Episode 3');
    expect(episodeText(null, 3)).toBe('Episode 3');
  });
});

describe('playerTitle', () => {
  it('joins series and episode for an episode', () => {
    expect(playerTitle('Bluey', 'Camping')).toBe('Bluey · Camping');
  });
  it('is the bare title for a standalone film (no series)', () => {
    expect(playerTitle(null, 'Toy Story')).toBe('Toy Story');
  });
});
