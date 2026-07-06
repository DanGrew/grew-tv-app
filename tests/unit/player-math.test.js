import { progressPct, clampTime, wrapIndex, frameDrop } from '../../core/player-math.js';

describe('progressPct', () => {
  it('is 0 at the start', () => expect(progressPct(0, 200)).toBe(0));
  it('is 50 at the halfway point', () => expect(progressPct(100, 200)).toBe(50));
  it('is 100 at the end', () => expect(progressPct(200, 200)).toBe(100));
  it('reports a fractional percentage', () => expect(progressPct(30, 120)).toBe(25));
});

describe('clampTime', () => {
  it('adds a forward skip', () => expect(clampTime(50, 10, 200)).toBe(60));
  it('applies a backward skip', () => expect(clampTime(50, -30, 200)).toBe(20));
  it('floors at 0 when a back-skip runs past the start', () => expect(clampTime(5, -30, 200)).toBe(0));
  it('caps at the duration when a forward skip runs past the end', () => expect(clampTime(190, 30, 200)).toBe(200));
  it('lands exactly on the duration', () => expect(clampTime(200, 30, 200)).toBe(200));
  it('lands exactly on 0', () => expect(clampTime(0, -10, 200)).toBe(0));
});

describe('wrapIndex', () => {
  it('steps forward within the ring', () => expect(wrapIndex(0, 1, 4)).toBe(1));
  it('steps backward within the ring', () => expect(wrapIndex(2, -1, 4)).toBe(1));
  it('wraps past the end to the start', () => expect(wrapIndex(3, 1, 4)).toBe(0));
  it('wraps before the start to the end', () => expect(wrapIndex(0, -1, 4)).toBe(3));
  it('is identity for a zero step', () => expect(wrapIndex(2, 0, 4)).toBe(2));
});

describe('frameDrop', () => {
  it('is the difference between successive totals', () => expect(frameDrop(12, 5)).toBe(7));
  it('is 0 when nothing new dropped', () => expect(frameDrop(5, 5)).toBe(0));
  it('is the full total on the first sample', () => expect(frameDrop(4, 0)).toBe(4));
});
