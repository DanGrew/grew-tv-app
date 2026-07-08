import { queueModel, queueViewHtml, companionQueueHtml, playNextCount } from '../../core/queue-view.js';

function entry(id, title, eid, dur) {
  return { track_id: id, title: title, artist: 'The Beatles', entry_id: eid, duration: dur };
}

// shuffle source, a queued override item, remaining permutation, next permutation.
function shuffleSnap() {
  return {
    now_playing: { track_id: 'come-together', title: 'Come Together', artist: 'The Beatles', position: 154, duration: 260 },
    play_next: [entry('here-comes-the-sun', 'Here Comes the Sun', 'q1', 185)],
    from_source: [entry('something', 'Something', 's1', 183), entry('oh-darling', 'Oh! Darling', 's2', 207)],
    then: [entry('maxwell', "Maxwell's Silver Hammer", 't1', 209)],
    shuffle: true, repeat: false, source_type: 'album', source_id: 'abbey-road'
  };
}

// ordered, repeat off, no override -> THEN is empty -> "Source ends".
function orderedSnap() {
  return {
    now_playing: { track_id: 'something', title: 'Something', artist: 'The Beatles', position: 54, duration: 183 },
    play_next: [],
    from_source: [entry('maxwell', "Maxwell's Silver Hammer", 's1', 209), entry('oh-darling', 'Oh! Darling', 's2', 207)],
    then: [],
    shuffle: false, repeat: false, source_type: 'album', source_id: 'abbey-road'
  };
}

describe('queueModel — bucketing', () => {
  it('puts each track in the right section', () => {
    var m = queueModel(shuffleSnap());
    expect(m.nowPlaying.trackId).toBe('come-together');
    var byKey = {};
    m.sections.forEach(s => { byKey[s.key] = s; });
    expect(byKey['play-next'].rows.map(r => r.trackId)).toEqual(['here-comes-the-sun']);
    expect(byKey['from-source'].rows.map(r => r.trackId)).toEqual(['something', 'oh-darling']);
    expect(byKey['then'].rows.map(r => r.trackId)).toEqual(['maxwell']);
  });

  it('marks PLAY NEXT rows as queued origin and source rows as not', () => {
    var m = queueModel(shuffleSnap());
    var byKey = {};
    m.sections.forEach(s => { byKey[s.key] = s; });
    expect(byKey['play-next'].rows[0].queued).toBe(true);
    expect(byKey['from-source'].rows[0].queued).toBe(false);
    expect(byKey['then'].rows[0].queued).toBe(false);
  });

  it('carries entry_id on every editable row', () => {
    var m = queueModel(shuffleSnap());
    var ids = m.sections.flatMap(s => s.rows.map(r => r.entryId));
    expect(ids).toEqual(['q1', 's1', 's2', 't1']);
  });

  it('renders PLAY NEXT before FROM SOURCE (the why-next invariant)', () => {
    var keys = queueModel(shuffleSnap()).sections.map(s => s.key);
    expect(keys.indexOf('play-next')).toBeLessThan(keys.indexOf('from-source'));
  });
});

describe('queueModel — empty override + THEN end', () => {
  it('hides PLAY NEXT cleanly when the override queue is empty', () => {
    var keys = queueModel(orderedSnap()).sections.map(s => s.key);
    expect(keys).toEqual(['from-source', 'then']);
  });

  it('shows "Source ends" when THEN is empty (ordered + no repeat)', () => {
    var then = queueModel(orderedSnap()).sections.find(s => s.key === 'then');
    expect(then.rows).toEqual([]);
    expect(then.endsText).toMatch(/Source ends/);
  });

  it('renders THEN rows (no ends marker) when the source continues', () => {
    var then = queueModel(shuffleSnap()).sections.find(s => s.key === 'then');
    expect(then.endsText).toBeUndefined();
    expect(then.rows.length).toBe(1);
  });
});

describe('queueViewHtml', () => {
  // TASK-238: the sections render as a Now Playing header + Queue / Next / Coming Up
  // tabs (Queue = Play Next, Next = From Source, Coming Up = Then).
  it('lays the sections out as Queue / Next / Coming Up tabs', () => {
    var html = queueViewHtml(shuffleSnap());
    ['queue', 'next', 'coming-up'].forEach(function (t) {
      expect(html).toContain('data-act="tab" data-tab="' + t + '"');
    });
    expect(html).toContain('>Queue</button>');
    expect(html).toContain('>Next</button>');
    expect(html).toContain('>Coming Up</button>');
  });

  it('opens on Queue when tracks are queued, on Next when none are', () => {
    // shuffleSnap has a Play Next item -> the Queue tab opens active.
    expect(queueViewHtml(shuffleSnap())).toContain('class="qtab active" data-act="tab" data-tab="queue"');
    // orderedSnap has no override -> Queue is empty -> it opens on Next instead, and
    // the end-of-source marker lives under Coming Up.
    var ordered = queueViewHtml(orderedSnap());
    expect(ordered).toContain('class="qtab active" data-act="tab" data-tab="next"');
    expect(ordered).toContain('Source ends');
  });

  it('shows the empty-queue placeholder under the Queue tab when nothing is queued', () => {
    var html = queueViewHtml(orderedSnap());
    expect(html).toContain('class="q-empty"');
    expect(html).toMatch(/Nothing queued/);
  });

  it('emits per-row shift up/down (direction) + remove keyed on entry_id', () => {
    var html = queueViewHtml(shuffleSnap());
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="up"');
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="down"');
    expect(html).toContain('data-act="remove" data-entry="s1"');
    expect(html).toContain('data-act="select" data-track="something"');
    expect(html).not.toContain('data-to=');   // no absolute index (was the bug)
  });

  // BUG-042: the TV overlay remove button must use the app-wide cross (&#10005; ✕),
  // not the non-standard boxed-plus (&#8862; ⊞) it used to render.
  it('renders the standard cross (✕) on the remove button, not the boxed-plus', () => {
    var html = queueViewHtml(shuffleSnap());
    expect(html).toContain('data-act="remove" data-entry="s1" title="Remove" aria-label="Remove">&#10005;</button>');
    expect(html).not.toContain('&#8862;');
  });

  it('disables shift-up on the first row and shift-down on the last (no swap with now-playing / off-section)', () => {
    var src = queueModel(shuffleSnap()).sections.find(s => s.key === 'from-source').rows;
    expect(src[0].canUp).toBe(false);    // first FROM SOURCE row: can't swap up into now-playing
    expect(src[0].canDown).toBe(true);
    expect(src[src.length - 1].canDown).toBe(false);
    var html = queueViewHtml(shuffleSnap());
    // s1 is first in from_source -> its shift-up is disabled, shift-down is not.
    expect(html).toMatch(/class="q-act is-disabled" disabled data-act="move" data-entry="s1" data-dir="up"/);
    expect(html).toContain('class="q-act" data-act="move" data-entry="s1" data-dir="down"');
  });

  it('renders Shuffle/Repeat as live toggle buttons reflecting the snapshot', () => {
    var html = queueViewHtml(shuffleSnap());
    expect(html).toContain('data-act="transport" data-action="toggle-shuffle"');
    expect(html).toContain('data-act="transport" data-action="toggle-repeat"');
    expect(html).toContain('np-pill on" data-act="transport" data-action="toggle-shuffle"');
    expect(queueViewHtml(orderedSnap())).not.toContain('np-pill on" data-act="transport" data-action="toggle-shuffle"');
  });

  it('escapes track titles', () => {
    var snap = shuffleSnap();
    snap.play_next[0].title = 'Tom & <Jerry>';
    expect(queueViewHtml(snap)).toContain('Tom &amp; &lt;Jerry&gt;');
  });

  it('renders a stable shell for an empty snapshot', () => {
    var html = queueViewHtml(null);
    expect(html).toContain('Source ends');
    expect(html).not.toContain('now-playing');
  });
});

// FEAT-031 (TASK-189) — the companion (phone) Queue View renders the SAME
// queueModel into the mockup's `.ph-*` markup, with each control carrying the
// same TASK-186 action the companion POSTs.
describe('companionQueueHtml — phone mirror', () => {
  it('renders now-playing + the Queue / Next / Coming Up tabs from the snapshot', () => {
    var html = companionQueueHtml(shuffleSnap());
    expect(html).toContain('class="ph-np"');
    expect(html).toContain('Come Together');
    expect(html).toContain('data-act="tab" data-tab="queue"');
    expect(html).toContain('data-act="tab" data-tab="next"');
    expect(html).toContain('data-act="tab" data-tab="coming-up"');
    expect(html).toContain('>Queue</button>');
    expect(html).toContain('>Next</button>');
    expect(html).toContain('>Coming Up</button>');
    expect(html).toContain('Here Comes the Sun');   // the queued track, under the Queue tab
  });

  it('keys per-row edits on entry_id (select/move/remove) like the TV overlay', () => {
    var html = companionQueueHtml(shuffleSnap());
    expect(html).toContain('data-act="select" data-track="here-comes-the-sun" data-entry="q1"');
    expect(html).toContain('data-act="move" data-entry="q1" data-dir="down"');
    expect(html).toContain('data-act="remove" data-entry="q1"');
  });

  it('flags the queued (PLAY NEXT) row and disables the section-edge shift', () => {
    var html = companionQueueHtml(shuffleSnap());
    expect(html).toContain('class="ph-qrow queued"');
    // q1 is first in PLAY NEXT -> shift-up disabled.
    expect(html).toContain('class="ph-ract is-disabled" disabled data-act="move" data-entry="q1" data-dir="up"');
  });

  it('renders shuffle/repeat as transport actions, lit from the snapshot', () => {
    var html = companionQueueHtml(shuffleSnap());
    expect(html).toContain('data-act="transport" data-action="toggle-shuffle"');
    expect(html).toContain('data-act="transport" data-action="toggle-repeat"');
    expect(html).toContain('ph-tbtn on" data-act="transport" data-action="toggle-shuffle"');
    // play/pause is a device-local WS toggle, not a server action.
    expect(html).toContain('data-act="toggle"');
  });

  it('shows the end-of-source marker when THEN is empty (ordered + repeat off)', () => {
    var html = companionQueueHtml(orderedSnap());
    expect(html).toContain('Source ends');
  });

  it('escapes track titles', () => {
    var snap = shuffleSnap();
    snap.play_next[0].title = 'Tom & <Jerry>';
    expect(companionQueueHtml(snap)).toContain('Tom &amp; &lt;Jerry&gt;');
  });

  it('renders a stable shell for an empty snapshot', () => {
    var html = companionQueueHtml(null);
    expect(html).toContain('Source ends');
    expect(html).not.toContain('ph-np"');
  });
});

// FEAT-040/TASK-255 — the music Play-Queue count helper (browse reads it from GET
// /api/playback to decide whether to offer a music "Play Queue" button).
describe('playNextCount — music override-queue length', () => {
  it('counts the resolved play_next entries', () => {
    expect(playNextCount(shuffleSnap())).toBe(1);
  });

  it('is 0 for an empty / absent override queue', () => {
    expect(playNextCount(orderedSnap())).toBe(0);
    expect(playNextCount({})).toBe(0);
    expect(playNextCount(null)).toBe(0);
  });
});
