import { CLEAR_PROMPT, hasProgress, minusAction, withoutProgress } from '../../core/minus-clear.js';

var ROWS = [
  { item_id: 'film-a', position_secs: 600 },
  { item_id: 'ep-1', position_secs: 120 }
];

describe('CLEAR_PROMPT', () => {
  it('is the words the armed tile reads, the player button\'s own', () => {
    expect(CLEAR_PROMPT).toBe('Clear progress?');
  });
});

describe('hasProgress', () => {
  it('is true for an id the Continue Watching rows carry', () => {
    expect(hasProgress(ROWS, 'film-a')).toBe(true);
    expect(hasProgress(ROWS, 'ep-1')).toBe(true);
  });

  it('is false for an id they do not — a series tile, or a tile never started', () => {
    expect(hasProgress(ROWS, 'series-x')).toBe(false);
  });

  it('is false with no rows at all', () => {
    expect(hasProgress([], 'film-a')).toBe(false);
  });
});

describe('minusAction', () => {
  it('does nothing on a tile with no progress, armed or not', () => {
    expect(minusAction(false, false)).toBe('none');
    expect(minusAction(true, false)).toBe('none');
  });

  it('arms on the first press', () => {
    expect(minusAction(false, true)).toBe('arm');
  });

  it('clears on the second', () => {
    expect(minusAction(true, true)).toBe('clear');
  });
});

describe('withoutProgress', () => {
  it('drops the cleared row and keeps the rest in order', () => {
    expect(withoutProgress(ROWS, 'film-a')).toEqual([{ item_id: 'ep-1', position_secs: 120 }]);
  });

  it('leaves the rows alone for an id they do not carry', () => {
    expect(withoutProgress(ROWS, 'series-x')).toEqual(ROWS);
  });

  it('does not change the rows it was given', () => {
    withoutProgress(ROWS, 'film-a');
    expect(ROWS.length).toBe(2);
  });

  it('is empty with no rows at all', () => {
    expect(withoutProgress([], 'film-a')).toEqual([]);
  });
});
