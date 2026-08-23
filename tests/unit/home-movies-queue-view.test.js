import { queueModel, homeMoviesQueueViewHtml, companionHomeMoviesQueueHtml } from '../../core/home-movies-queue-view.js';

function entry(id, title, eid, dur, poster) {
  return { item_id: id, title: title, entry_id: eid, duration: dur, poster: poster == null ? 'clip.jpg' : poster };
}

function personSnap() {
  return {
    now_playing: { item_id: 'millie-walk', title: 'Millie Walk', poster: 'millie-walk.jpg', duration: 42 },
    queue: [entry('beach-day', 'Beach Day', 'q1', 55)],
    next: [entry('park-visit', 'Park Visit', 's1', 61), entry('bath-time', 'Bath Time', 's2', 30)],
    coming_up: [entry('millie-walk', 'Millie Walk', 't1', 42)],
    shuffle: true, repeat: true, source_type: 'home-movies-by-person', source_id: 'millie'
  };
}

function monthOrderedSnap() {
  return {
    now_playing: { item_id: 'park-visit', title: 'Park Visit', poster: 'park.jpg', duration: 61 },
    queue: [],
    next: [entry('bath-time', 'Bath Time', 's1', 30)],
    coming_up: [],
    shuffle: false, repeat: false, source_type: 'home-movie-month', source_id: '2026-01'
  };
}

describe('queueModel', () => {
  it('buckets queue/next/coming_up straight off the server-resolved lists', () => {
    var m = queueModel(personSnap());
    expect(m.queueRows.map(r => r.itemId)).toEqual(['beach-day']);
    expect(m.nextRows.map(r => r.itemId)).toEqual(['park-visit', 'bath-time']);
    expect(m.comingUpRows.map(r => r.itemId)).toEqual(['millie-walk']);
  });

  it('carries entry_id + poster on every row', () => {
    var m = queueModel(personSnap());
    expect(m.queueRows[0].entryId).toBe('q1');
    expect(m.queueRows[0].poster).toBe('clip.jpg');
  });

  it('resolves the hero from now_playing + the person source label', () => {
    var m = queueModel(personSnap());
    expect(m.hero).toEqual({ itemId: 'millie-walk', title: 'Millie Walk', poster: 'millie-walk.jpg', subtitle: 'Millie' });
  });

  it('resolves the hero subtitle from a month source', () => {
    var m = queueModel(monthOrderedSnap());
    expect(m.hero.subtitle).toBe('Jan 2026');
  });

  it('resolves the hero subtitle to "All" for the whole-catalog source', () => {
    var snap = personSnap();
    snap.source_type = 'home-movies-all';
    snap.source_id = null;
    expect(queueModel(snap).hero.subtitle).toBe('All');
  });

  it('is null hero for an empty/absent snapshot', () => {
    expect(queueModel(null).hero).toBe(null);
    expect(queueModel({}).hero).toBe(null);
  });

  it('carries shuffle/repeat straight off the snapshot', () => {
    expect(queueModel(personSnap())).toMatchObject({ shuffle: true, repeat: true });
    expect(queueModel(monthOrderedSnap())).toMatchObject({ shuffle: false, repeat: false });
  });
});

describe('homeMoviesQueueViewHtml — TV', () => {
  it('lays the sections out as Queue / Next / Coming Up tabs, each labelled with its live count', () => {
    var html = homeMoviesQueueViewHtml(personSnap());
    ['queue', 'next', 'coming-up'].forEach(function(t) {
      expect(html).toContain('data-act="tab" data-tab="' + t + '"');
    });
    expect(html).toContain('>Queue 1</button>');
    expect(html).toContain('>Next 2</button>');
    expect(html).toContain('>Coming Up 1</button>');
  });

  it('opens on Queue when clips are queued, on Next when none are', () => {
    expect(homeMoviesQueueViewHtml(personSnap())).toContain('class="qs-tab active" data-act="tab" data-tab="queue"');
    var ordered = homeMoviesQueueViewHtml(monthOrderedSnap());
    expect(ordered).toContain('class="qs-tab active" data-act="tab" data-tab="next"');
  });

  it('shows the empty-queue placeholder under the Queue tab when nothing is queued', () => {
    var html = homeMoviesQueueViewHtml(monthOrderedSnap());
    expect(html).toContain('class="qs-empty"');
    expect(html).toMatch(/Nothing queued/);
  });

  it('shows the end-of-source marker under Coming Up when repeat is off', () => {
    expect(homeMoviesQueueViewHtml(monthOrderedSnap())).toContain('Source ends');
  });

  it('renders the hero art/title/subtitle + an icon-only, always-shown transport row', () => {
    var html = homeMoviesQueueViewHtml(personSnap());
    expect(html).toContain('class="qs-hero-title">Millie Walk</div>');
    expect(html).toContain('class="qs-hero-sub">Millie</div>');
    expect(html).toContain('data-act="transport" data-action="previous"');
    expect(html).toContain('data-act="toggle" aria-label="Play / pause"');
    expect(html).toContain('data-act="transport" data-action="next"');
    expect(html).toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-shuffle"');
    expect(html).toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-repeat"');
  });

  it('shuffle/repeat render off (not omitted) when the source has them off', () => {
    var html = homeMoviesQueueViewHtml(monthOrderedSnap());
    expect(html).toContain('data-act="transport" data-action="toggle-shuffle"');
    expect(html).not.toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-shuffle"');
  });

  it('every row select fires play-item keyed on item_id — no queue/source mutation on tap', () => {
    var html = homeMoviesQueueViewHtml(personSnap());
    expect(html).toContain('data-act="select" data-item="beach-day"');
    expect(html).toContain('data-act="select" data-item="park-visit"');
    expect(html).toContain('data-act="select" data-item="millie-walk"');
    expect(html).not.toContain('data-act="queue"');
  });

  it('Queue + Next rows carry reorder + remove actions', () => {
    var html = homeMoviesQueueViewHtml(personSnap());
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="up"');
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="down"');
    expect(html).toContain('data-act="remove" data-entry="s1"');
  });

  it('disables shift-up on the first row and shift-down on the last', () => {
    var html = homeMoviesQueueViewHtml(personSnap());
    expect(html).toMatch(/class="qs-act is-disabled" disabled data-act="move" data-entry="s1" data-dir="up"/);
    expect(html).toContain('class="qs-act" data-act="move" data-entry="s1" data-dir="down"');
  });

  it('Coming Up rows carry NO actions and render read-only', () => {
    var html = homeMoviesQueueViewHtml(personSnap());
    expect(html).toContain('class="qs-row qs-readonly">');
    expect(html).toMatch(/qs-readonly">[^]*?data-item="millie-walk"[^]*?<\/button><\/div>/);
    expect(html).not.toMatch(/data-item="millie-walk"[^]*?data-act="remove" data-entry="t1"/);
  });

  it('renders poster art with a fallback glyph and onerror hiding', () => {
    var html = homeMoviesQueueViewHtml(personSnap());
    expect(html).toContain('src="/media/clip.jpg"');
    expect(html).toContain("onerror=\"this.style.display='none'\"");
  });

  it('falls back to the video-camera glyph for a row with no poster', () => {
    var snap = personSnap();
    snap.next[0].poster = null;
    expect(homeMoviesQueueViewHtml(snap)).toContain('&#127916;');
  });

  it('escapes clip titles', () => {
    var snap = personSnap();
    snap.next[0].title = 'Tom & <Jerry>';
    expect(homeMoviesQueueViewHtml(snap)).toContain('Tom &amp; &lt;Jerry&gt;');
  });

  it('escapes double-quotes and apostrophes in titles too', () => {
    var snap = personSnap();
    snap.next[0].title = 'O\'Neil "Live"';
    expect(homeMoviesQueueViewHtml(snap)).toContain('O&#39;Neil &quot;Live&quot;');
  });

  it('renders a stable shell for an empty snapshot', () => {
    var html = homeMoviesQueueViewHtml(null);
    expect(html).toContain('Source ends');
    expect(html).not.toContain('qs-hero-title');
  });
});

describe('companionHomeMoviesQueueHtml — phone mirror', () => {
  it('renders the hero + Queue / Next / Coming Up tabs, each labelled with its live count', () => {
    var html = companionHomeMoviesQueueHtml(personSnap());
    expect(html).toContain('class="qs-ph-hero"');
    expect(html).toContain('Millie Walk');
    expect(html).toContain('data-act="tab" data-tab="queue"');
    expect(html).toContain('>Queue 1</button>');
    expect(html).toContain('>Next 2</button>');
    expect(html).toContain('>Coming Up 1</button>');
    expect(html).toContain('Beach Day');
  });

  it('reuses the existing companion row classes (.ph-qrow/.ph-qname/.ph-ract)', () => {
    var html = companionHomeMoviesQueueHtml(personSnap());
    expect(html).toContain('class="ph-qrow"');
    expect(html).toContain('class="ph-qname"');
    expect(html).toContain('class="ph-ract"');
  });

  it('keys per-row edits on entry_id (move/remove), select on item_id', () => {
    var html = companionHomeMoviesQueueHtml(personSnap());
    expect(html).toContain('data-act="select" data-item="beach-day"');
    expect(html).toContain('data-act="move" data-entry="q1" data-dir="down"');
    expect(html).toContain('data-act="remove" data-entry="q1"');
  });

  it('disables the section-edge shift', () => {
    var html = companionHomeMoviesQueueHtml(personSnap());
    expect(html).toContain('class="ph-ract is-disabled" disabled data-act="move" data-entry="s1" data-dir="up"');
  });

  it('renders shuffle/repeat as always-shown icon-only transport actions, lit from the snapshot', () => {
    var html = companionHomeMoviesQueueHtml(personSnap());
    expect(html).toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-shuffle"');
    expect(html).toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-repeat"');
    expect(html).toContain('data-act="toggle" aria-label="Play / pause"');
  });

  it('shows the end-of-source marker when the source ends (ordered + repeat off)', () => {
    expect(companionHomeMoviesQueueHtml(monthOrderedSnap())).toContain('Source ends');
  });

  it('Coming Up rows carry no actions', () => {
    var html = companionHomeMoviesQueueHtml(personSnap());
    expect(html).not.toMatch(/data-item="millie-walk"[^]*?data-act="remove" data-entry="t1"/);
  });

  it('escapes clip titles', () => {
    var snap = personSnap();
    snap.next[0].title = 'Tom & <Jerry>';
    expect(companionHomeMoviesQueueHtml(snap)).toContain('Tom &amp; &lt;Jerry&gt;');
  });

  it('renders a stable shell for an empty snapshot', () => {
    var html = companionHomeMoviesQueueHtml(null);
    expect(html).toContain('Source ends');
    expect(html).not.toContain('qs-ph-hero');
  });
});

// Fallback branches: null-valued fields (escapeHtml), missing durations.
describe('home-movies-queue-view fallbacks', () => {
  it('escapes a null title as an empty string (no "null" text)', () => {
    var snap = personSnap();
    snap.now_playing.title = null;
    var html = homeMoviesQueueViewHtml(snap);
    expect(html).toContain('class="qs-hero-title"></div>');
    expect(html).not.toContain('>null<');
  });

  it('renders an empty duration when a clip carries none', () => {
    var snap = personSnap();
    snap.next[0].duration = null;
    expect(queueModel(snap).nextRows[0].durationText).toBe('');
  });
});
