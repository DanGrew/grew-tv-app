import { describe, it, expect } from 'vitest';
import { nowPlaying, isSwap, upNextItem, upNextLine, isMulti } from '../../core/music-video-playback-router.js';

function mv(id, title) { return { video_id: id, title: title }; }
function snap(fields) {
  return Object.assign({ now_playing: null, play_next: [], from_source: [], then: [], item_count: 0 }, fields);
}

describe('nowPlaying', () => {
  it('is the snapshot\'s now_playing', () => {
    expect(nowPlaying(snap({ now_playing: mv('a', 'A') })).video_id).toBe('a');
  });
  it('is null for an empty/absent snapshot', () => {
    expect(nowPlaying(snap({}))).toBe(null);
    expect(nowPlaying(null)).toBe(null);
  });
});

describe('isSwap', () => {
  it('is true when now_playing differs from the loaded id', () => {
    expect(isSwap('a', snap({ now_playing: mv('b', 'B') }))).toBe(true);
  });
  it('is false when now_playing matches the loaded id — no re-swap of the same item', () => {
    expect(isSwap('a', snap({ now_playing: mv('a', 'A') }))).toBe(false);
  });
  it('is false when there is no now_playing', () => {
    expect(isSwap('a', snap({}))).toBe(false);
    expect(isSwap(null, snap({}))).toBe(false);
  });
});

describe('upNextItem', () => {
  it('prefers the front of play_next (an explicit queue pick) over from_source', () => {
    expect(upNextItem(snap({ play_next: [mv('q', 'Q')], from_source: [mv('s', 'S')] })).video_id).toBe('q');
  });
  it('falls back to the front of from_source when play_next is empty', () => {
    expect(upNextItem(snap({ from_source: [mv('s', 'S')], then: [mv('t', 'T')] })).video_id).toBe('s');
  });
  it('falls back to the front of then (the repeat-wrap preview) when both are empty', () => {
    expect(upNextItem(snap({ then: [mv('t', 'T')] })).video_id).toBe('t');
  });
  it('is null when all three are empty — nothing plays after this', () => {
    expect(upNextItem(snap({}))).toBe(null);
    expect(upNextItem(null)).toBe(null);
  });
});

describe('upNextLine', () => {
  it('is "Up next: <title>" for the resolved up-next item', () => {
    expect(upNextLine(snap({ from_source: [mv('s', 'Next Song')] }))).toEqual({ prefix: 'Up next: ', label: 'Next Song' });
  });
  it('is null when there is no up-next item', () => {
    expect(upNextLine(snap({}))).toBe(null);
  });
});

describe('isMulti', () => {
  it('is true for more than one item', () => {
    expect(isMulti(snap({ item_count: 2 }))).toBe(true);
  });
  it('is false for exactly one item', () => {
    expect(isMulti(snap({ item_count: 1 }))).toBe(false);
  });
  it('is false for zero items or an absent snapshot', () => {
    expect(isMulti(snap({ item_count: 0 }))).toBe(false);
    expect(isMulti(null)).toBe(false);
  });
});
