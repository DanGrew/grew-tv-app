import {
  FINISHED_EPSILON_SEC,
  percent,
  isFinished,
  isMidWatch,
  resumeAfter,
  continueWatching,
  seriesProgressPercent,
  seriesIsMidWatch
} from '../../core/progress.js';

describe('percent', () => {
  it('is 0 when duration missing or zero', () => {
    expect(percent(50, 0)).toBe(0);
    expect(percent(50, null)).toBe(0);
  });
  it('computes a percentage', () => expect(percent(30, 120)).toBe(25));
  it('clamps to 0..100', () => {
    expect(percent(-5, 120)).toBe(0);
    expect(percent(200, 120)).toBe(100);
  });
});

describe('isFinished', () => {
  it('true within epsilon of the end', () => {
    expect(isFinished(600 - FINISHED_EPSILON_SEC, 600)).toBe(true);
    expect(isFinished(600, 600)).toBe(true);
  });
  it('false mid-watch', () => expect(isFinished(300, 600)).toBe(false));
  it('false with no duration', () => expect(isFinished(10, 0)).toBe(false));
});

describe('isMidWatch', () => {
  it('false at zero / unstarted', () => {
    expect(isMidWatch(0, 600)).toBe(false);
    expect(isMidWatch(null, 600)).toBe(false);
  });
  it('true partway through', () => expect(isMidWatch(120, 600)).toBe(true));
  it('false once finished', () => expect(isMidWatch(599, 600)).toBe(false));
});

describe('resumeAfter', () => {
  it('keeps a mid-watch position', () => expect(resumeAfter(120, 600)).toBe(120));
  it('clears to 0 when finished', () => expect(resumeAfter(599, 600)).toBe(0));
  it('never negative', () => expect(resumeAfter(-3, 600)).toBe(0));
});

describe('continueWatching', () => {
  const videos = [
    { id: 'a', durationSec: 600 },
    { id: 'b', durationSec: 600 },
    { id: 'c', durationSec: 600 },
    { id: 'd', durationSec: 600 }
  ];
  const progress = {
    a: { resumePositionSec: 100, lastPlayed: 1000 },
    b: { resumePositionSec: 200, lastPlayed: 3000 },
    c: { resumePositionSec: 599, lastPlayed: 5000 },   // finished -> excluded
    d: { resumePositionSec: 0, lastPlayed: 9000 }      // unstarted -> excluded
  };
  it('returns only mid-watch videos, newest first', () => {
    expect(continueWatching(videos, progress).map(v => v.id)).toEqual(['b', 'a']);
  });
  it('handles ISO lastPlayed strings', () => {
    const iso = {
      a: { resumePositionSec: 100, lastPlayed: '2026-06-01T00:00:00Z' },
      b: { resumePositionSec: 100, lastPlayed: '2026-06-05T00:00:00Z' }
    };
    expect(continueWatching(videos, iso).map(v => v.id)).toEqual(['b', 'a']);
  });
  it('empty when no progress', () => expect(continueWatching(videos, {})).toEqual([]));
  it('tolerates null inputs', () => expect(continueWatching(null, null)).toEqual([]));
});

describe('series progress', () => {
  const episodes = [
    { id: 'e1', durationSec: 600 },
    { id: 'e2', durationSec: 600 },
    { id: 'e3', durationSec: 600 }
  ];
  it('percent is the furthest mid-watch episode', () => {
    const prog = { e1: { resumePositionSec: 150 }, e2: { resumePositionSec: 300 } };
    expect(seriesProgressPercent(episodes, prog)).toBe(50);
  });
  it('ignores finished and unstarted episodes', () => {
    const prog = { e1: { resumePositionSec: 599 }, e3: { resumePositionSec: 0 } };
    expect(seriesProgressPercent(episodes, prog)).toBe(0);
  });
  it('seriesIsMidWatch true only when an episode is mid-watch', () => {
    expect(seriesIsMidWatch(episodes, { e2: { resumePositionSec: 60 } })).toBe(true);
    expect(seriesIsMidWatch(episodes, {})).toBe(false);
  });
});
