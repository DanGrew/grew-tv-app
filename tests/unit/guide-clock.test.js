import { describe, expect, it } from 'vitest';
import { STEP_HOURS, stepped, bandState, movedLabel, ticking,
         elapsedSeconds } from '../../core/guide-clock.js';

// TASK-604 — the Guide's moved clock. The deliverable is that a line-up can be
// looked at at 20:00 without waiting for 20:00, so these assert the arithmetic
// that gets there and the three rules that stop a moved clock lying about
// itself: it does not claim to be now, it does not tick, and it does not elapse.

describe('STEP_HOURS', () => {
  it('is one hour — one press, one hour (owner, 2026-09-12)', () => {
    expect(STEP_HOURS).toBe(1);
  });
});

describe('stepped', () => {
  it('moves an hour forward', () => {
    expect(stepped('2026-09-12T19:00:00', 1)).toBe('2026-09-12T20:00:00');
  });

  it('moves an hour back', () => {
    expect(stepped('2026-09-12T19:00:00', -1)).toBe('2026-09-12T18:00:00');
  });

  it('is RELATIVE, not snapped to the hour — 15:23 gives 16:23', () => {
    expect(stepped('2026-09-12T15:23:00', 1)).toBe('2026-09-12T16:23:00');
  });

  it('keeps the seconds it was given', () => {
    expect(stepped('2026-09-12T15:23:41', 1)).toBe('2026-09-12T16:23:41');
  });

  it('reads a stamp without seconds and writes them as :00', () => {
    expect(stepped('2026-09-12T15:23', 1)).toBe('2026-09-12T16:23:00');
  });

  it('crosses midnight forward onto the next day', () => {
    expect(stepped('2026-09-12T23:30:00', 1)).toBe('2026-09-13T00:30:00');
  });

  it('crosses midnight backward onto the previous day', () => {
    expect(stepped('2026-09-12T00:30:00', -1)).toBe('2026-09-11T23:30:00');
  });

  it('crosses a month end', () => {
    expect(stepped('2026-09-30T23:30:00', 1)).toBe('2026-10-01T00:30:00');
  });

  it('crosses a year end', () => {
    expect(stepped('2026-12-31T23:30:00', 1)).toBe('2027-01-01T00:30:00');
  });

  it('crosses a leap day', () => {
    expect(stepped('2028-02-28T23:30:00', 1)).toBe('2028-02-29T00:30:00');
  });

  it('steps more than one hour when asked', () => {
    expect(stepped('2026-09-12T19:00:00', 5)).toBe('2026-09-13T00:00:00');
  });

  it('stays put for a zero step', () => {
    expect(stepped('2026-09-12T19:00:00', 0)).toBe('2026-09-12T19:00:00');
  });

  it('carries NO timezone out, whatever the machine runs in — a stamp in is a '
     + 'wall clock and a stamp out is the same wall clock (grammar call 3)', () => {
    expect(stepped('2026-06-01T12:00:00', 1)).toBe('2026-06-01T13:00:00');
    expect(stepped('2026-01-01T12:00:00', 1)).toBe('2026-01-01T13:00:00');
  });

  it('is uncapped — a step years past the programme is still arithmetic, and '
     + 'the answer going off air is what says you left it (story 4)', () => {
    expect(stepped('2026-09-12T19:00:00', 24 * 365)).toBe('2027-09-12T19:00:00');
  });

  it('is null for a stamp it cannot read, so nothing is asked for', () => {
    expect(stepped('teatime', 1)).toBe(null);
    expect(stepped(null, 1)).toBe(null);
    expect(stepped(undefined, 1)).toBe(null);
    expect(stepped('', 1)).toBe(null);
  });

  it('is null for a date with no time in it', () => {
    expect(stepped('2026-09-12', 1)).toBe(null);
  });
});

describe('bandState', () => {
  it('is live on today with no moved clock', () => {
    expect(bandState(true, null)).toBe('live');
  });

  it('is quiet on a future day', () => {
    expect(bandState(false, null)).toBe('quiet');
  });

  it('is moved whenever a moment is being inspected — even on today, which is '
     + 'the case that would otherwise say NOW about 20:00', () => {
    expect(bandState(true, '2026-09-12T20:00:00')).toBe('moved');
  });

  it('is moved on a future day too — the moment beats the day', () => {
    expect(bandState(false, '2026-09-13T20:00:00')).toBe('moved');
  });
});

describe('movedLabel', () => {
  it('names the moment and does NOT say NOW', () => {
    expect(movedLabel('2026-09-12T20:00:00')).toBe('AT · 20:00');
  });

  it('keeps the minutes of an off-hour moment', () => {
    expect(movedLabel('2026-09-12T16:23:00')).toBe('AT · 16:23');
  });

  it('falls back to a bare AT for a moment it cannot read, rather than a '
     + 'half-written label', () => {
    expect(movedLabel(null)).toBe('AT');
    expect(movedLabel('teatime')).toBe('AT');
  });
});

describe('ticking', () => {
  it('ticks on today with the real clock', () => {
    expect(ticking(true, null)).toBe(true);
  });

  it('does NOT tick while the clock is moved — a moment parked at 20:00 that '
     + 'crept away from 20:00 would read as a bug', () => {
    expect(ticking(true, '2026-09-12T20:00:00')).toBe(false);
  });

  it('does not tick on a future day, moved or not', () => {
    expect(ticking(false, null)).toBe(false);
    expect(ticking(false, '2026-09-13T20:00:00')).toBe(false);
  });
});

describe('elapsedSeconds', () => {
  it('is real seconds since the fetch on the live clock', () => {
    expect(elapsedSeconds(1000, 31000, null)).toBe(30);
  });

  it('is zero the moment the strip lands', () => {
    expect(elapsedSeconds(1000, 1000, null)).toBe(0);
  });

  it('is zero while the clock is moved, however long the page has been up — '
     + 'the server already answered for the moment asked about', () => {
    expect(elapsedSeconds(1000, 9999000, '2026-09-12T20:00:00')).toBe(0);
  });
});
