import { parseLrc, indexAt, windowAt } from '../../core/lrc.js';

const SAMPLE = [
  '[ti:Mr. Blue Sky]',
  '[ar:ELO]',
  '[00:00.00]',
  '[00:06.00]Sun is shinin in the sky',
  '[00:10.50]There aint a cloud in sight',
  '[00:14.00]Its stopped rainin'
].join('\n');

describe('parseLrc', () => {
  it('parses [mm:ss.xx] cues to {t, text}, sorted by time', () => {
    const cues = parseLrc(SAMPLE);
    expect(cues).toEqual([
      { t: 0, text: null },
      { t: 6, text: 'Sun is shinin in the sky' },
      { t: 10.5, text: 'There aint a cloud in sight' },
      { t: 14, text: 'Its stopped rainin' }
    ]);
  });
  it('skips metadata tags (no numeric mm:ss) and blank lines', () => {
    expect(parseLrc('[ar:ELO]\n[ti:x]\n\n[00:03.00]hi')).toEqual([{ t: 3, text: 'hi' }]);
  });
  it('treats an empty lyric line as an instrumental beat (text:null)', () => {
    expect(parseLrc('[00:05.00]   ')).toEqual([{ t: 5, text: null }]);
  });
  it('emits one cue per timestamp on a multi-stamp line', () => {
    expect(parseLrc('[00:01.00][00:09.00]chorus')).toEqual([
      { t: 1, text: 'chorus' },
      { t: 9, text: 'chorus' }
    ]);
  });
  it('handles minutes and sorts out-of-order input', () => {
    expect(parseLrc('[01:05.00]b\n[00:30.00]a')).toEqual([
      { t: 30, text: 'a' },
      { t: 65, text: 'b' }
    ]);
  });
  it('null / empty / undefined input -> []', () => {
    expect(parseLrc(null)).toEqual([]);
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc(undefined)).toEqual([]);
  });
});

describe('indexAt', () => {
  const cues = parseLrc(SAMPLE);
  it('returns the last cue with t <= time', () => {
    expect(indexAt(cues, 7)).toBe(1);
    expect(indexAt(cues, 13)).toBe(2);
    expect(indexAt(cues, 99)).toBe(3);
  });
  it('-1 before the first cue and for an empty list', () => {
    expect(indexAt(parseLrc('[00:06.00]x'), 2)).toBe(-1);
    expect(indexAt([], 5)).toBe(-1);
  });
  it('is inclusive at the cue boundary', () => {
    expect(indexAt(cues, 6)).toBe(1);
    expect(indexAt(cues, 10.5)).toBe(2);
  });
});

describe('windowAt', () => {
  const cues = parseLrc(SAMPLE);
  it('gives the active line plus its ±1 neighbours', () => {
    expect(windowAt(cues, 7)).toEqual({
      prev: '♪',
      cur: 'Sun is shinin in the sky',
      next: 'There aint a cloud in sight'
    });
  });
  it('blanks out-of-range neighbours at the ends', () => {
    expect(windowAt(cues, 99)).toEqual({
      prev: 'There aint a cloud in sight',
      cur: 'Its stopped rainin',
      next: ''
    });
  });
  it('current line is ♪ for an instrumental cue', () => {
    expect(windowAt(cues, 1).cur).toBe('♪');
  });
  it('current line is ♪ before the first cue (pre-vocal)', () => {
    expect(windowAt(parseLrc('[00:06.00]x'), 2)).toEqual({ prev: '', cur: '♪', next: 'x' });
  });
  it('no lyrics -> ♪ with blank neighbours', () => {
    expect(windowAt([], 5)).toEqual({ prev: '', cur: '♪', next: '' });
  });
});
