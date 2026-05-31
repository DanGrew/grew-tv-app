import { pad, fmt } from '../../core/time.js';

describe('pad', () => {
  it('zero-pads single digit', () => expect(pad(3)).toBe('03'));
  it('leaves two digits unchanged', () => expect(pad(10)).toBe('10'));
  it('zero case', () => expect(pad(0)).toBe('00'));
});

describe('fmt', () => {
  it('formats seconds under a minute', () => expect(fmt(45)).toBe('0:45'));
  it('formats minutes and seconds', () => expect(fmt(125)).toBe('2:05'));
  it('formats hours minutes seconds', () => expect(fmt(3661)).toBe('1:01:01'));
  it('formats zero', () => expect(fmt(0)).toBe('0:00'));
});
