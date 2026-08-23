import { describe, it, expect } from 'vitest';
import { nowPlaying, isSwap, upNextItem, upNextLine } from '../../core/queue-playback-router.js';

function item(id, title) { return { item_id: id, title: title }; }
function snap(fields) {
  return Object.assign({ now_playing: null, queue: [], next: [], coming_up: [] }, fields);
}

describe('nowPlaying', () => {
  it('is the snapshot\'s now_playing', () => {
    expect(nowPlaying(snap({ now_playing: item('a', 'A') })).item_id).toBe('a');
  });
  it('is null for an empty/absent snapshot', () => {
    expect(nowPlaying(snap({}))).toBe(null);
    expect(nowPlaying(null)).toBe(null);
  });
});

describe('isSwap', () => {
  it('is true when now_playing differs from the loaded id', () => {
    expect(isSwap('a', snap({ now_playing: item('b', 'B') }))).toBe(true);
  });
  it('is false when now_playing matches the loaded id — no re-swap of the same item', () => {
    expect(isSwap('a', snap({ now_playing: item('a', 'A') }))).toBe(false);
  });
  it('is false when there is no now_playing', () => {
    expect(isSwap('a', snap({}))).toBe(false);
    expect(isSwap(null, snap({}))).toBe(false);
  });
});

describe('upNextItem', () => {
  it('prefers the front of queue (an explicit queue pick) over next', () => {
    expect(upNextItem(snap({ queue: [item('q', 'Q')], next: [item('n', 'N')] })).item_id).toBe('q');
  });
  it('falls back to the front of next when queue is empty', () => {
    expect(upNextItem(snap({ next: [item('n', 'N')], coming_up: [item('c', 'C')] })).item_id).toBe('n');
  });
  it('falls back to the front of coming_up (the repeat-wrap preview) when both are empty', () => {
    expect(upNextItem(snap({ coming_up: [item('c', 'C')] })).item_id).toBe('c');
  });
  it('is null when all three are empty — nothing plays after this', () => {
    expect(upNextItem(snap({}))).toBe(null);
    expect(upNextItem(null)).toBe(null);
  });
});

describe('upNextLine', () => {
  it('is "Up next: <title>" for the resolved up-next item', () => {
    expect(upNextLine(snap({ next: [item('n', 'Next Clip')] }))).toEqual({ prefix: 'Up next: ', label: 'Next Clip' });
  });
  it('is null when there is no up-next item', () => {
    expect(upNextLine(snap({}))).toBe(null);
  });
});
