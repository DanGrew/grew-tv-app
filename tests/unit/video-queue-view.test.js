import { describe, it, expect } from 'vitest';
import { videoQueueModel, videoQueueViewHtml, companionVideoQueueHtml } from '../../core/video-queue-view.js';

function item(id, title, dur, poster) { return { item_id: id, title: title, duration: dur, poster: poster }; }
function entry(eid, id, title, dur, poster) { return { entry_id: eid, item_id: id, title: title, duration: dur, poster: poster }; }

// A 3-item series snapshot at `idx`, optional override queue + repeat (TASK-247
// build_snapshot shape — index-based, NOT pre-bucketed like the music snapshot).
function snap(idx, repeat, queue) {
  var items = [item('e1', 'Daddy Putdown', 420, 'e1.jpg'), item('e2', 'The Weekend', 480, 'e2.jpg'), item('e3', 'Hammerbarn', 600, 'e3.jpg')];
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
  // TASK-238: Now Playing header + Queue / Next / Coming Up tabs (Queue = Play Next,
  // Next = From Series — which also carries the "Series ends" marker, Coming Up = Then).
  it('lays the sections out as Queue / Next / Coming Up tabs', () => {
    var html = videoQueueViewHtml(snap(0, true, [entry('q1', 'fz', 'Frozen')]));
    ['queue', 'next', 'coming-up'].forEach(function (t) {
      expect(html).toContain('data-act="tab" data-tab="' + t + '"');
    });
    expect(html).toContain('>Coming Up</button>');
    // queued items -> opens on Queue.
    expect(html).toContain('class="qtab active" data-act="tab" data-tab="queue"');
  });

  it('opens on Next when nothing is queued, and the Series-ends marker sits under Next', () => {
    expect(videoQueueViewHtml(snap(0, false))).toContain('class="qtab active" data-act="tab" data-tab="next"');
    expect(videoQueueViewHtml(snap(2, false))).toContain('Series ends');
  });

  it('renders an editable PLAY NEXT row by entry_id, a play-to-jump source row by item_id', () => {
    var html = videoQueueViewHtml(snap(0, true, [entry('q1', 'fz', 'Frozen')]));
    expect(html).toContain('data-act="remove" data-entry="q1"');
    expect(html).toContain('data-act="move" data-entry="q1"');
    expect(html).toContain('data-act="select" data-item="e2"');
  });
  // BUG-042: the TV overlay remove button must use the app-wide cross (&#10005; ✕),
  // not the non-standard boxed-plus (&#8862; ⊞) it used to render.
  it('renders the standard cross (✕) on the remove button, not the boxed-plus', () => {
    var html = videoQueueViewHtml(snap(0, true, [entry('q1', 'fz', 'Frozen')]));
    expect(html).toContain('data-act="remove" data-entry="q1" title="Remove" aria-label="Remove">&#10005;</button>');
    expect(html).not.toContain('&#8862;');
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

// BUG-024: Repeat is a backend no-op on a non-repeatable (single-item) source, so
// the queue Repeat pill must be greyed + untappable there — mirroring the player,
// which already greys its transport Repeat via `.single`. Only a multi-item source
// (series / boxset) is repeatable. Coming Up follows Repeat (ON -> filled tail,
// OFF -> empty) — locked here so it can't regress.
function filmSnap(repeat) {
  var items = [item('f1', 'Solo Film', 5400, 'f1.jpg')];
  return {
    now_playing: items[0],
    current_item_index: 0,
    items: items,
    override_queue: [],
    source_type: 'film',
    source_id: 'solo',
    repeat: repeat,
    shuffle: false
  };
}

describe('videoQueueModel — repeatable predicate (BUG-024)', () => {
  it('is false for a single-item (film) source', () => {
    expect(videoQueueModel(filmSnap(false)).repeatable).toBe(false);
  });
  it('is true for a multi-item (series) source', () => {
    expect(videoQueueModel(snap(1, false)).repeatable).toBe(true);
  });
  it('is false for an empty / absent snapshot', () => {
    expect(videoQueueModel(null).repeatable).toBe(false);
    expect(videoQueueModel({}).repeatable).toBe(false);
  });
});

describe('BUG-024 — Repeat greyed on a non-repeatable source', () => {
  it('greys + disables the TV Repeat pill for a film (no toggle-repeat action)', () => {
    var html = videoQueueViewHtml(filmSnap(false));
    expect(html).toContain('np-pill is-disabled');
    expect(html).toContain('disabled');
    expect(html).not.toContain('data-action="toggle-repeat"');
  });
  it('keeps the TV Repeat pill active + tappable for a series', () => {
    var html = videoQueueViewHtml(snap(1, false));
    expect(html).not.toContain('np-pill is-disabled');
    expect(html).toContain('data-action="toggle-repeat"');
  });
  it('greys + disables the companion Repeat button for a film', () => {
    var html = companionVideoQueueHtml(filmSnap(false));
    expect(html).toContain('ph-tbtn is-disabled');
    expect(html).not.toContain('data-action="toggle-repeat"');
  });
  it('keeps the companion Repeat button active for a series', () => {
    var html = companionVideoQueueHtml(snap(1, false));
    expect(html).not.toContain('ph-tbtn is-disabled');
    expect(html).toContain('data-action="toggle-repeat"');
  });
});

describe('BUG-024 — Coming Up follows Repeat', () => {
  it('Coming Up is empty when repeat is off', () => {
    expect(videoQueueViewHtml(snap(1, false))).toContain('Nothing coming up');
  });
  it('Coming Up carries the wrap-tail rows when repeat is on mid-source', () => {
    var html = videoQueueViewHtml(snap(2, true));
    expect(html).not.toContain('Nothing coming up');
    expect(html).toContain('data-act="select" data-item="e1"');
  });
});

// BUG-022: the video queue shows the poster artwork (backend sends `poster` on
// now_playing / items / override_queue entries). The view-model carries it and
// the markup renders a same-origin /media/ <img> (hidden on load failure),
// falling back to the film-clapper glyph when no poster is present.
describe('videoQueueModel — poster', () => {
  it('carries the now-playing poster', () => {
    expect(videoQueueModel(snap(1, false)).nowPlaying.poster).toBe('e2.jpg');
  });
  it('carries the poster on queued (Play Next) rows', () => {
    var sec = sectionByKey(videoQueueModel(snap(0, false, [entry('q1', 'fz', 'Frozen', 90, 'frozen.jpg')])), 'play-next');
    expect(sec.rows[0].poster).toBe('frozen.jpg');
  });
  it('carries the poster on From Series rows', () => {
    var sec = sectionByKey(videoQueueModel(snap(0, false)), 'from-series');
    expect(sec.rows.map(function (r) { return r.poster; })).toEqual(['e2.jpg', 'e3.jpg']);
  });
});

// Fallback / edge branches: null-valued fields (escapeHtml), the ENABLED shift
// controls on a multi-row queue, and the empty (no-ends) Next panel on the phone
// (TASK-315 coverage).
describe('video-queue-view edge branches (TASK-315)', () => {
  it('escapes a null now-playing title as an empty string', () => {
    var s = snap(1, false);
    s.now_playing = { item_id: 'e2', title: null, duration: 480, poster: 'e2.jpg' };
    var html = videoQueueViewHtml(s);
    expect(html).toContain('class="np-title"></div>');
    expect(html).not.toContain('>null<');
  });

  it('renders ENABLED shift controls (not disabled) on a multi-row TV queue', () => {
    var html = videoQueueViewHtml(snap(0, true, [entry('q1', 'a', 'A'), entry('q2', 'b', 'B')]));
    // q1 can shift down (not last), q2 can shift up (not first) -> enabled controls.
    expect(html).toContain('class="q-act" data-act="move" data-entry="q1" data-dir="down"');
    expect(html).toContain('class="q-act" data-act="move" data-entry="q2" data-dir="up"');
  });

  it('renders ENABLED shift controls on a multi-row companion queue', () => {
    var html = companionVideoQueueHtml(snap(0, true, [entry('q1', 'a', 'A'), entry('q2', 'b', 'B')]));
    expect(html).toContain('class="ph-ract" data-act="move" data-entry="q1" data-dir="down"');
    expect(html).toContain('class="ph-ract" data-act="move" data-entry="q2" data-dir="up"');
  });

  it('companion Next panel shows the empty placeholder (no "Series ends") when the source is exhausted but repeat is on', () => {
    // idx 2 (last) + repeat on + no queue -> From Series is empty WITHOUT the ends
    // marker (the wrap tail lives under Coming Up), so Next shows the plain empty note.
    var html = companionVideoQueueHtml(snap(2, true));
    expect(html).toContain('Nothing up next');
    expect(html).not.toContain('Series ends');
  });
});

describe('video queue artwork markup', () => {
  it('renders the now-playing poster as a same-origin /media/ img on both surfaces', () => {
    expect(videoQueueViewHtml(snap(1, false))).toContain('src="/media/e2.jpg"');
    expect(videoQueueViewHtml(snap(1, false))).toContain('onerror');
    expect(companionVideoQueueHtml(snap(1, false))).toContain('src="/media/e2.jpg"');
  });
  it('renders row posters (queued + source) as imgs', () => {
    var html = videoQueueViewHtml(snap(0, false, [entry('q1', 'fz', 'Frozen', 90, 'frozen.jpg')]));
    expect(html).toContain('src="/media/frozen.jpg"');
    expect(html).toContain('src="/media/e2.jpg"');
  });
  it('falls back to the clapper glyph when a poster is missing', () => {
    var noArt = { now_playing: { item_id: 'x', title: 'No Art', duration: 10 }, current_item_index: 0, items: [{ item_id: 'x', title: 'No Art', duration: 10 }], override_queue: [], repeat: false };
    var html = videoQueueViewHtml(noArt);
    expect(html).not.toContain('<img');
    expect(html).toContain('&#127916;');
  });
});

// TASK-327: model-level pins (labels/hints/flags that never reach the HTML), the
// durationText + escapeHtml fallbacks, and the items-fallback (surfaced via a
// negative index so the slice reaches item 0).
describe('video-queue-view mutation hardening (TASK-327)', () => {
  function byKey(m, key) { return m.sections.filter(function (s) { return s.key === key; })[0]; }

  it('labels the sections (Play Next / From Series / Then), the tab being the visible label', () => {
    var m = videoQueueModel(snap(1, true, [entry('q1', 'x', 'Q', 100, null)]));
    expect(byKey(m, 'play-next').label).toBe('Play Next');
    expect(byKey(m, 'from-series').label).toBe('From Series');
    expect(byKey(m, 'then').label).toBe('Then');
  });

  it('From Series carries an empty hint (no ends) when the source is exhausted but the queue continues', () => {
    var m = videoQueueModel(snap(2, false, [entry('q1', 'x', 'Q', 100, null)])); // last item, queued follows
    var fs = byKey(m, 'from-series');
    expect(fs.label).toBe('From Series');
    expect(fs.rows).toEqual([]);
    expect(fs.hint).toBe('');
    expect(fs.endsText).toBeUndefined();
  });

  it('From Series carries the Series-ends marker (empty hint) when nothing follows and repeat is off', () => {
    var m = videoQueueModel(snap(2, false));   // last item, no queue, no repeat
    var fs = byKey(m, 'from-series');
    expect(fs.label).toBe('From Series');
    expect(fs.hint).toBe('');
    expect(fs.endsText).toMatch(/^Series ends/);
  });

  it('source rows are non-editable and never shiftable (canUp/canDown false)', () => {
    var row = byKey(videoQueueModel(snap(0, false)), 'from-series').rows[0];
    expect(row.editable).toBe(false);
    expect(row.canUp).toBe(false);
    expect(row.canDown).toBe(false);
  });

  it('durationText is empty for a null or NaN duration', () => {
    var m = videoQueueModel(snap(1, true, [entry('q1', 'x', 'Q', null, null), entry('q2', 'y', 'Y', NaN, null)]));
    expect(byKey(m, 'play-next').rows[0].durationText).toBe('');
    expect(byKey(m, 'play-next').rows[1].durationText).toBe('');
  });

  it('escapes all five HTML entities in titles (& < > " \x27)', () => {
    var s = snap(1, false, [entry('q1', 'x', 'A & B < C > D " E \x27 F', 100, null)]);
    expect(videoQueueViewHtml(s)).toContain('A &amp; B &lt; C &gt; D &quot; E &#39; F');
    expect(companionVideoQueueHtml(s)).toContain('A &amp; B &lt; C &gt; D &quot; E &#39; F');
  });

  it('an absent items list yields no From Series rows even at a negative index (items fallback is truly empty)', () => {
    // current_item_index -1 makes slice(idx+1) == slice(0); if the items fallback
    // held a bogus element it would surface here as a row.
    var m = videoQueueModel({ current_item_index: -1, override_queue: [], repeat: false });
    expect(byKey(m, 'from-series').rows).toEqual([]);
  });
});
