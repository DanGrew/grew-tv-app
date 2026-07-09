import { describe, it, expect } from 'vitest';
import { nowPlaying, isSwap, upNextItem, upNextLine, seriesMode, queueCount } from '../../core/video-player-router.js';

function item(id, title) { return { item_id: id, title: title }; }

// A 3-episode series snapshot at `idx`, repeat on/off (TASK-221 build_snapshot shape).
function series(idx, repeat) {
  var items = [item('e1', 'Daddy Putdown'), item('e2', 'The Weekend'), item('e3', 'Hammerbarn')];
  return {
    now_playing: items[idx],
    current_item_index: idx,
    items: items,
    source_type: 'series',
    source_id: 'bluey',
    repeat: repeat,
    shuffle: false
  };
}

describe('nowPlaying', () => {
  it('returns the snapshot now-playing item', () => {
    expect(nowPlaying(series(1, true)).item_id).toBe('e2');
  });
  it('is null for an empty / absent snapshot', () => {
    expect(nowPlaying(null)).toBe(null);
    expect(nowPlaying({})).toBe(null);
  });
});

describe('queueCount', () => {
  it('counts the override queue (0 for empty/absent)', () => {
    expect(queueCount(null)).toBe(0);
    expect(queueCount({})).toBe(0);
    expect(queueCount({ override_queue: [{ entry_id: 'e1' }, { entry_id: 'e2' }] })).toBe(2);
  });
});

describe('isSwap', () => {
  it('is true when now-playing differs from the loaded item', () => {
    expect(isSwap('e1', series(1, true))).toBe(true);
  });
  it('is false when now-playing matches the loaded item (no reload)', () => {
    expect(isSwap('e2', series(1, true))).toBe(false);
  });
  it('is false with no now-playing', () => {
    expect(isSwap('e1', {})).toBe(false);
  });
});

describe('upNextItem', () => {
  it('is the next episode mid-series', () => {
    expect(upNextItem(series(0, true)).item_id).toBe('e2');
  });
  it('wraps last -> first when repeat is on', () => {
    expect(upNextItem(series(2, true)).item_id).toBe('e1');
  });
  it('is null on the last episode when repeat is off', () => {
    expect(upNextItem(series(2, false))).toBe(null);
  });
  it('still advances mid-series when repeat is off', () => {
    expect(upNextItem(series(0, false)).item_id).toBe('e2');
  });
  it('is null for a single-item source', () => {
    expect(upNextItem({ items: [item('only', 'Solo')], current_item_index: 0, repeat: true })).toBe(null);
  });
  it('is null for an empty / absent snapshot', () => {
    expect(upNextItem(null)).toBe(null);
    expect(upNextItem({})).toBe(null);
  });
  it('is the override-queue front when the queue is non-empty (plays ahead of source)', () => {
    const snap = series(0, true);
    snap.override_queue = [item('f1', 'Cars'), item('f2', 'Cars 2')];
    expect(upNextItem(snap).item_id).toBe('f1');
  });
  it('falls back to the source once the queue is empty', () => {
    const snap = series(0, true);
    snap.override_queue = [];
    expect(upNextItem(snap).item_id).toBe('e2');
  });
  it('is the queue front even on a single-item source', () => {
    expect(upNextItem({
      items: [item('only', 'Solo')], current_item_index: 0, repeat: false,
      override_queue: [item('f1', 'Cars')]
    }).item_id).toBe('f1');
  });
  it('is null when the wrap target itself is absent (defensive hole in items)', () => {
    // repeat wraps last -> items[0]; a null hole there degrades to null, not undefined
    expect(upNextItem({ items: [null, item('e2', 'Two')], current_item_index: 1, repeat: true })).toBe(null);
  });
});

describe('upNextLine', () => {
  it('is "Up next: <title>" mid-series', () => {
    expect(upNextLine(series(0, true))).toEqual({ prefix: 'Up next: ', label: 'The Weekend' });
  });
  it('is "Start again" at the wrapping end of a repeating series', () => {
    expect(upNextLine(series(2, true))).toEqual({ prefix: '', label: 'Start again' });
  });
  it('is null on the last episode with repeat off', () => {
    expect(upNextLine(series(2, false))).toBe(null);
  });
  it('is null for an empty snapshot', () => {
    expect(upNextLine({})).toBe(null);
  });
  it('is "Up next: <title>" for a queued item even at the wrapping series end', () => {
    const snap = series(2, true);   // would be "Start again" without a queue
    snap.override_queue = [item('f1', 'Cars')];
    expect(upNextLine(snap)).toEqual({ prefix: 'Up next: ', label: 'Cars' });
  });
});

describe('seriesMode', () => {
  it('is true for a multi-item source', () => {
    expect(seriesMode(series(0, true))).toBe(true);
  });
  it('is false for a single-item source', () => {
    expect(seriesMode({ items: [item('only', 'Solo')] })).toBe(false);
  });
  it('is false for an empty / absent snapshot', () => {
    expect(seriesMode(null)).toBe(false);
    expect(seriesMode({})).toBe(false);
  });
});
