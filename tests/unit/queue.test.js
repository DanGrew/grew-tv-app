import { albumOrder, shuffleOrder, neighborId, trackById } from '../../core/queue.js';

const ITEMS = [
  { episode: 1, video: { id: 't1', title: 'One' } },
  { episode: 2, video: { id: 't2', title: 'Two' } },
  { episode: 3, video: { id: 't3', title: 'Three' } }
];

describe('albumOrder', () => {
  it('returns track ids in items order', () => {
    expect(albumOrder(ITEMS)).toEqual(['t1', 't2', 't3']);
  });
  it('handles empty / null', () => {
    expect(albumOrder([])).toEqual([]);
    expect(albumOrder(null)).toEqual([]);
  });
});

describe('shuffleOrder', () => {
  it('is a permutation of the input (same ids, no loss)', () => {
    const out = shuffleOrder(['a', 'b', 'c', 'd'], makeRng([0.9, 0.1, 0.5]));
    expect(out.slice().sort()).toEqual(['a', 'b', 'c', 'd']);
  });
  it('does not mutate the input order (off restores album order)', () => {
    const ids = ['a', 'b', 'c'];
    shuffleOrder(ids, makeRng([0.9, 0.1]));
    expect(ids).toEqual(['a', 'b', 'c']);
  });
  it('is deterministic for a given rng', () => {
    expect(shuffleOrder(['a', 'b', 'c'], makeRng([0, 0]))).toEqual(shuffleOrder(['a', 'b', 'c'], makeRng([0, 0])));
  });
});

describe('neighborId', () => {
  const order = ['t1', 't2', 't3'];
  it('steps forward and back', () => {
    expect(neighborId(order, 't1', 1)).toBe('t2');
    expect(neighborId(order, 't2', -1)).toBe('t1');
  });
  it('wraps both ends', () => {
    expect(neighborId(order, 't3', 1)).toBe('t1');
    expect(neighborId(order, 't1', -1)).toBe('t3');
  });
  it('unknown current -> first; empty -> null', () => {
    expect(neighborId(order, 'nope', 1)).toBe('t1');
    expect(neighborId([], 't1', 1)).toBe(null);
  });
});

describe('trackById', () => {
  it('resolves the full record from the album items', () => {
    expect(trackById(ITEMS, 't2').title).toBe('Two');
  });
  it('null when absent', () => {
    expect(trackById(ITEMS, 'nope')).toBe(null);
    expect(trackById(null, 't1')).toBe(null);
  });
});

// A deterministic rng that yields the given fractions in turn, then 0.
function makeRng(values) {
  let i = 0;
  return function() { return i < values.length ? values[i++] : 0; };
}
