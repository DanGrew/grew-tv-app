import { describe, it, expect } from 'vitest';
import { videoQueueModel, videoQueueViewHtml, companionVideoQueueHtml } from '../../core/video-queue-view.js';

function item(id, title, dur) { return { item_id: id, title: title, duration: dur }; }
function entry(eid, id, title, dur) { return { entry_id: eid, item_id: id, title: title, duration: dur }; }

// A 3-item series snapshot at `idx`, optional override queue + repeat (TASK-247
// build_snapshot shape — index-based, NOT pre-bucketed like the music snapshot).
function snap(idx, repeat, queue) {
  var items = [item('e1', 'Daddy Putdown', 420), item('e2', 'The Weekend', 480), item('e3', 'Hammerbarn', 600)];
  return {
    now_playing: items[idx],
    current_item_index: idx,
    items: items,
    override_queue: queue || [],
    source_type: 'series',
    source_id: 'bluey',
    repeat: repeat,
    shuffle: false
  };
}

function sectionByKey(m, key) {
  return m.sections.filter(function (s) { return s.key === key; })[0];
}

describe('videoQueueModel — now playing', () => {
  it('reports the now-playing item', () => {
    expect(videoQueueModel(snap(1, true)).nowPlaying.itemId).toBe('e2');
    expect(videoQueueModel(snap(1, true)).nowPlaying.title).toBe('The Weekend');
  });
  it('is null for an empty / absent snapshot', () => {
    expect(videoQueueModel(null).nowPlaying).toBe(null);
    expect(videoQueueModel({}).nowPlaying).toBe(null);
  });
  it('carries the repeat flag', () => {
    expect(videoQueueModel(snap(0, true)).repeat).toBe(true);
    expect(videoQueueModel(snap(0, false)).repeat).toBe(false);
  });
});

describe('videoQueueModel — Play Next (override queue)', () => {
  it('is omitted when the queue is empty', () => {
    expect(sectionByKey(videoQueueModel(snap(0, true)), 'play-next')).toBeUndefined();
  });
  it('lists the queued entries as editable rows carrying their entry_id', () => {
    var m = videoQueueModel(snap(0, true, [entry('q1', 'fz', 'Frozen', 90), entry('q2', 'mu', 'Moana', 100)]));
    var sec = sectionByKey(m, 'play-next');
    expect(sec.rows.map(function (r) { return r.entryId; })).toEqual(['q1', 'q2']);
    expect(sec.rows.every(function (r) { return r.editable && r.queued; })).toBe(true);
  });
  it('gates the shift edges (first can not go up, last can not go down)', () => {
    var sec = sectionByKey(videoQueueModel(snap(0, true, [entry('q1', 'a', 'A'), entry('q2', 'b', 'B'), entry('q3', 'c', 'C')])), 'play-next');
    expect(sec.rows[0].canUp).toBe(false);
    expect(sec.rows[0].canDown).toBe(true);
    expect(sec.rows[2].canUp).toBe(true);
    expect(sec.rows[2].canDown).toBe(false);
  });
});

describe('videoQueueModel — From Series', () => {
  it('lists the source items after the current index as play-to-jump (not editable) rows', () => {
    var sec = sectionByKey(videoQueueModel(snap(0, true)), 'from-series');
    expect(sec.rows.map(function (r) { return r.itemId; })).toEqual(['e2', 'e3']);
    expect(sec.rows.every(function (r) { return !r.editable && !r.queued; })).toBe(true);
  });
  it('shows the "Series ends" marker on the last item with repeat off and nothing queued', () => {
    var sec = sectionByKey(videoQueueModel(snap(2, false)), 'from-series');
    expect(sec.rows).toEqual([]);
    expect(sec.endsText).toContain('Series ends');
  });
  it('omits the end marker when the queue still has items', () => {
    var sec = sectionByKey(videoQueueModel(snap(2, false, [entry('q1', 'fz', 'Frozen')])), 'from-series');
    expect(sec.endsText).toBeUndefined();
  });
});

describe('videoQueueModel — Then (repeat wrap)', () => {
  it('is absent when repeat is off', () => {
    expect(sectionByKey(videoQueueModel(snap(1, false)), 'then')).toBeUndefined();
  });
  it('lists the items before the current one under repeat (the wrap tail)', () => {
    var sec = sectionByKey(videoQueueModel(snap(2, true)), 'then');
    expect(sec.rows.map(function (r) { return r.itemId; })).toEqual(['e1', 'e2']);
  });
  it('is absent under repeat when the current item is first (empty wrap tail)', () => {
    expect(sectionByKey(videoQueueModel(snap(0, true)), 'then')).toBeUndefined();
  });
});

describe('videoQueueViewHtml (TV)', () => {
  it('renders an editable PLAY NEXT row by entry_id, a play-to-jump source row by item_id', () => {
    var html = videoQueueViewHtml(snap(0, true, [entry('q1', 'fz', 'Frozen')]));
    expect(html).toContain('data-act="remove" data-entry="q1"');
    expect(html).toContain('data-act="move" data-entry="q1"');
    expect(html).toContain('data-act="select" data-item="e2"');
  });
  it('a queued row name is a play-now control (plays it + drops it from the queue)', () => {
    var html = videoQueueViewHtml(snap(0, true, [entry('q1', 'fz', 'Frozen')]));
    expect(html).toContain('data-act="play-now" data-entry="q1" data-item="fz"');
  });
  it('renders the Repeat transport pill reflecting the flag', () => {
    expect(videoQueueViewHtml(snap(0, true))).toContain('data-action="toggle-repeat"');
    expect(videoQueueViewHtml(snap(0, true))).toContain('np-pill on');
    expect(videoQueueViewHtml(snap(0, false))).not.toContain('np-pill on');
  });
  it('does not expose edit controls on a source row (no entry_id)', () => {
    var html = videoQueueViewHtml(snap(0, false));
    expect(html).not.toContain('data-act="remove" data-entry="null"');
  });
  it('renders a stable shell for an empty snapshot', () => {
    expect(typeof videoQueueViewHtml(null)).toBe('string');
    expect(videoQueueViewHtml(null)).toContain('Series ends');
  });
});

describe('companionVideoQueueHtml (phone)', () => {
  it('mirrors the sections with the .ph-* markup and the same actions', () => {
    var html = companionVideoQueueHtml(snap(0, true, [entry('q1', 'fz', 'Frozen')]));
    expect(html).toContain('ph-qrow');
    expect(html).toContain('data-act="remove" data-entry="q1"');
    expect(html).toContain('data-act="select" data-item="e2"');
    expect(html).toContain('data-action="toggle-repeat"');
  });
  it('renders a stable shell for an empty snapshot', () => {
    expect(typeof companionVideoQueueHtml(null)).toBe('string');
  });
});
