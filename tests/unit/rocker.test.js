import { ROCKER_ACTIONS, ROCKER_BUTTONS, rockerTarget } from '../../core/rocker.js';

// TASK-602 — the rocker's two tables and the one rule for where a press lands.
describe('ROCKER_ACTIONS', () => {
  test('− is previous and + is next, and no other key is claimed', () => {
    expect(ROCKER_ACTIONS).toEqual({ '-': 'previous', '=': 'next' });
  });
});

describe('ROCKER_BUTTONS', () => {
  test('each action presses the player row\'s own drawn control', () => {
    expect(ROCKER_BUTTONS).toEqual({ previous: 'btn-prev', next: 'btn-next' });
  });
});

describe('rockerTarget', () => {
  test('nothing open lands on the player row', () => {
    expect(rockerTarget(false, false)).toBe('player');
  });

  test('the Queue overlay open lands on its own hero', () => {
    expect(rockerTarget(true, false)).toBe('queue');
  });

  test('an overlay over the player swallows the press', () => {
    expect(rockerTarget(false, true)).toBe('none');
  });

  test('an overlay wins even if the Queue reads open too', () => {
    expect(rockerTarget(true, true)).toBe('none');
  });
});
