import { describe, it, expect } from 'vitest';
import { firstRailId, isHorizontalDrag, shouldActivateDrag, pageOffset, swipeTarget, stepIndex, arrowDisabled, didPageRail } from '../../core/rail-pager.js';

describe('firstRailId', () => {
  it('the first rail\'s id', () => {
    expect(firstRailId([{ id: 'playlists' }, { id: 'albums' }])).toBe('playlists');
  });
  it('undefined for an empty list', () => {
    expect(firstRailId([])).toBe(undefined);
  });
});

describe('isHorizontalDrag', () => {
  it('true when |dx| beats |dy|', () => {
    expect(isHorizontalDrag(30, 5)).toBe(true);
  });
  it('false when |dy| beats |dx|', () => {
    expect(isHorizontalDrag(5, 30)).toBe(false);
  });
  it('false on an exact tie', () => {
    expect(isHorizontalDrag(10, 10)).toBe(false);
  });
});

describe('shouldActivateDrag', () => {
  it('stays active once already active, even if the drift is now vertical', () => {
    expect(shouldActivateDrag(true, 1, 50)).toBe(true);
  });
  it('stays false under the noise floor in both axes', () => {
    expect(shouldActivateDrag(false, 5, 5)).toBe(false);
  });
  it('activates once past the noise floor and horizontal', () => {
    expect(shouldActivateDrag(false, 20, 2)).toBe(true);
  });
  it('does not activate past the noise floor but vertical', () => {
    expect(shouldActivateDrag(false, 2, 20)).toBe(false);
  });
  it('right at the noise floor counts as past it', () => {
    expect(shouldActivateDrag(false, 8, 0)).toBe(true);
  });
  it('under the floor stays false even though dx already beats dy', () => {
    expect(shouldActivateDrag(false, 5, 2)).toBe(false);
  });
});

describe('pageOffset', () => {
  it('passes the raw delta through mid-list', () => {
    expect(pageOffset(-25, 1, 3)).toBe(-25);
    expect(pageOffset(25, 1, 3)).toBe(25);
  });
  it('damps a positive drag (toward prev) at the first rail', () => {
    expect(pageOffset(40, 0, 3)).toBeCloseTo(12);
  });
  it('damps a negative drag (toward next) at the last rail', () => {
    expect(pageOffset(-40, 2, 3)).toBeCloseTo(-12);
  });
  it('does not damp a negative drag at the first rail (still room to go next)', () => {
    expect(pageOffset(-40, 0, 3)).toBe(-40);
  });
  it('does not damp a positive drag at the last rail (still room to go prev)', () => {
    expect(pageOffset(40, 2, 3)).toBe(40);
  });
  it('damps in both directions on a single-rail list', () => {
    expect(pageOffset(40, 0, 1)).toBeCloseTo(12);
    expect(pageOffset(-40, 0, 1)).toBeCloseTo(-12);
  });
  it('a zero delta is untouched at either end', () => {
    expect(pageOffset(0, 0, 3)).toBe(0);
    expect(pageOffset(0, 2, 3)).toBe(0);
  });
});

describe('swipeTarget', () => {
  it('under threshold snaps back to the same index', () => {
    expect(swipeTarget(10, 1, 3)).toBe(1);
    expect(swipeTarget(-10, 1, 3)).toBe(1);
  });
  it('a leftward swipe over threshold advances one', () => {
    expect(swipeTarget(-50, 1, 3)).toBe(2);
  });
  it('a rightward swipe over threshold goes back one', () => {
    expect(swipeTarget(50, 1, 3)).toBe(0);
  });
  it('clamps at the last rail', () => {
    expect(swipeTarget(-50, 2, 3)).toBe(2);
  });
  it('clamps at the first rail', () => {
    expect(swipeTarget(50, 0, 3)).toBe(0);
  });
  it('clamps to 0 on an empty list', () => {
    expect(swipeTarget(-50, 0, 0)).toBe(0);
  });
  it('right at the swipe threshold counts as a completed swipe', () => {
    expect(swipeTarget(40, 1, 3)).toBe(0);
    expect(swipeTarget(-40, 1, 3)).toBe(2);
  });
});

describe('didPageRail (TASK-421)', () => {
  it('false under the swipe threshold — ordinary tap jitter never pages', () => {
    expect(didPageRail(9, 1, 3)).toBe(false);
  });
  it('true once a swipe crosses the threshold and actually lands elsewhere', () => {
    expect(didPageRail(-50, 1, 3)).toBe(true);
  });
  it('false when a swipe crosses the threshold but clamps back to the same rail (already at the end)', () => {
    expect(didPageRail(-50, 2, 3)).toBe(false);
  });
});

describe('stepIndex', () => {
  it('prev steps back one', () => {
    expect(stepIndex(1, 3, 'prev')).toBe(0);
  });
  it('next steps forward one', () => {
    expect(stepIndex(1, 3, 'next')).toBe(2);
  });
  it('prev clamps at 0', () => {
    expect(stepIndex(0, 3, 'prev')).toBe(0);
  });
  it('next clamps at the last index', () => {
    expect(stepIndex(2, 3, 'next')).toBe(2);
  });
  it('next clamps to 0 on an empty list', () => {
    expect(stepIndex(0, 0, 'next')).toBe(0);
  });
});

describe('arrowDisabled', () => {
  it('prev disabled at the first rail', () => {
    expect(arrowDisabled(0, 3, 'prev')).toBe(true);
  });
  it('prev enabled mid-list', () => {
    expect(arrowDisabled(1, 3, 'prev')).toBe(false);
  });
  it('next disabled at the last rail', () => {
    expect(arrowDisabled(2, 3, 'next')).toBe(true);
  });
  it('next enabled mid-list', () => {
    expect(arrowDisabled(1, 3, 'next')).toBe(false);
  });
  it('both disabled on an empty list', () => {
    expect(arrowDisabled(0, 0, 'prev')).toBe(true);
    expect(arrowDisabled(0, 0, 'next')).toBe(true);
  });
  it('both disabled on a single-rail list', () => {
    expect(arrowDisabled(0, 1, 'prev')).toBe(true);
    expect(arrowDisabled(0, 1, 'next')).toBe(true);
  });
});
