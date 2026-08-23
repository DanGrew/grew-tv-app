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

  // A stray source_id on the whole-catalog source must still be IGNORED (the
  // default branch never reads source_id) — pins the by-person check as a
  // real `===` gate rather than an always-true fallthrough.
  it('ignores a stray source_id on the whole-catalog source (default branch never reads it)', () => {
    var snap = personSnap();
    snap.source_type = 'home-movies-all';
    snap.source_id = 'millie';
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

  it('falls back to the video-camera glyph for the hero art when now_playing has no poster', () => {
    var snap = personSnap();
    snap.now_playing.poster = null;
    expect(homeMoviesQueueViewHtml(snap)).toContain('<div class="qs-art">&#127916;</div>');
  });

  it('joins Coming Up rows back-to-back with no separator', () => {
    var snap = personSnap();
    snap.coming_up.push(entry('park-visit', 'Park Visit', 't2', 61));
    expect(homeMoviesQueueViewHtml(snap)).toContain('</div><div class="qs-row qs-readonly">');
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

  it('falls back to the video-camera glyph for the hero art when now_playing has no poster', () => {
    var snap = personSnap();
    snap.now_playing.poster = null;
    expect(companionHomeMoviesQueueHtml(snap)).toContain('<div class="qs-art">&#127916;</div>');
  });

  it('falls back to the video-camera glyph in a row grip with no poster', () => {
    var snap = personSnap();
    snap.queue[0].poster = null;
    expect(companionHomeMoviesQueueHtml(snap)).toContain('<span class="grip">&#127916;</span>');
  });

  it('joins Coming Up rows back-to-back with no separator', () => {
    var snap = personSnap();
    snap.coming_up.push(entry('park-visit', 'Park Visit', 't2', 61));
    // read-only rows carry no <span class="acts"> — this boundary (button's
    // close immediately followed by the next row's open) only occurs between
    // two read-only rows, so it can't false-pass off the editable Next section.
    expect(companionHomeMoviesQueueHtml(snap)).toContain('</button></div><div class="ph-qrow">');
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

// Full-string equality on representative snapshots — every literal, join
// separator, disabled/enabled class, and conditional branch (empty vs.
// populated Queue/Next, ends-marker vs. rows under Coming Up, shuffle/repeat
// on vs. off, first/last-row shift-disabling) appears in one of these six
// outputs, so this pins the exact markup mutation testing needs (a stray
// StringLiteral/BooleanLiteral/ConditionalExpression flip anywhere in the
// row/hero/tab-panel builders breaks one of these `toBe`s).
describe('exact markup — mutation coverage', () => {
  it('TV: person source, 1 queued + 2 next + 1 coming up, shuffle+repeat on', () => {
    expect(homeMoviesQueueViewHtml(personSnap())).toBe("<div class=\"qs-hero\"><div class=\"qs-hero-top\"><div class=\"qs-art\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/millie-walk.jpg\" onerror=\"this.style.display='none'\"></div><div class=\"qs-hero-body\"><div class=\"qs-hero-title\">Millie Walk</div><div class=\"qs-hero-sub\">Millie</div></div></div><div class=\"qs-transport\"><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"previous\" aria-label=\"Previous\">&#9198;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-lg\" data-act=\"toggle\" aria-label=\"Play / pause\">&#9199;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"next\" aria-label=\"Next\">&#9197;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm on\" data-act=\"transport\" data-action=\"toggle-shuffle\" aria-label=\"Shuffle\">&#128256;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm on\" data-act=\"transport\" data-action=\"toggle-repeat\" aria-label=\"Repeat\">&#128257;</button></div></div><div class=\"qs-tabbar\" role=\"tablist\"><button type=\"button\" class=\"qs-tab active\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue 1</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next 2</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up 1</button></div><div class=\"qs-panel active\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"qs-row\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"beach-day\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-name\">Beach Day</span><span class=\"qs-dur\">0:55</span></button><div class=\"qs-actions\"><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"qs-act danger\" data-act=\"remove\" data-entry=\"q1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></div></div></div><div class=\"qs-panel\" data-tab=\"next\" role=\"tabpanel\"><div class=\"qs-row\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"park-visit\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-name\">Park Visit</span><span class=\"qs-dur\">1:01</span></button><div class=\"qs-actions\"><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"qs-act\" data-act=\"move\" data-entry=\"s1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"qs-act danger\" data-act=\"remove\" data-entry=\"s1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></div></div><div class=\"qs-row\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"bath-time\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-name\">Bath Time</span><span class=\"qs-dur\">0:30</span></button><div class=\"qs-actions\"><button type=\"button\" class=\"qs-act\" data-act=\"move\" data-entry=\"s2\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"s2\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"qs-act danger\" data-act=\"remove\" data-entry=\"s2\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></div></div></div><div class=\"qs-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"qs-row qs-readonly\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"millie-walk\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-name\">Millie Walk</span><span class=\"qs-dur\">0:42</span></button></div></div>");
  });

  it('TV: month source, empty queue + 1 next + no coming up (ordered, repeat off)', () => {
    expect(homeMoviesQueueViewHtml(monthOrderedSnap())).toBe("<div class=\"qs-hero\"><div class=\"qs-hero-top\"><div class=\"qs-art\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/park.jpg\" onerror=\"this.style.display='none'\"></div><div class=\"qs-hero-body\"><div class=\"qs-hero-title\">Park Visit</div><div class=\"qs-hero-sub\">Jan 2026</div></div></div><div class=\"qs-transport\"><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"previous\" aria-label=\"Previous\">&#9198;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-lg\" data-act=\"toggle\" aria-label=\"Play / pause\">&#9199;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"next\" aria-label=\"Next\">&#9197;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"toggle-shuffle\" aria-label=\"Shuffle\">&#128256;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"toggle-repeat\" aria-label=\"Repeat\">&#128257;</button></div></div><div class=\"qs-tabbar\" role=\"tablist\"><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue 0</button><button type=\"button\" class=\"qs-tab active\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next 1</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up 0</button></div><div class=\"qs-panel\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"qs-empty\">Nothing queued — add clips with ＋</div></div><div class=\"qs-panel active\" data-tab=\"next\" role=\"tabpanel\"><div class=\"qs-row\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"bath-time\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-name\">Bath Time</span><span class=\"qs-dur\">0:30</span></button><div class=\"qs-actions\"><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"qs-act danger\" data-act=\"remove\" data-entry=\"s1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></div></div></div><div class=\"qs-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"qs-ends\">&#9209; Source ends — nothing plays after the last clip (repeat is off)</div></div>");
  });

  it('TV: empty/absent snapshot renders a stable all-empty shell', () => {
    expect(homeMoviesQueueViewHtml(null)).toBe("<div class=\"qs-tabbar\" role=\"tablist\"><button type=\"button\" class=\"qs-tab active\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue 0</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next 0</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up 0</button></div><div class=\"qs-panel active\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"qs-empty\">Nothing queued — add clips with ＋</div></div><div class=\"qs-panel\" data-tab=\"next\" role=\"tabpanel\"><div class=\"qs-empty\">Nothing up next</div></div><div class=\"qs-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"qs-ends\">&#9209; Source ends — nothing plays after the last clip (repeat is off)</div></div>");
  });

  it('companion: person source, 1 queued + 2 next + 1 coming up, shuffle+repeat on', () => {
    expect(companionHomeMoviesQueueHtml(personSnap())).toBe("<div class=\"qs-ph-hero\"><div class=\"qs-ph-top\"><div class=\"qs-art\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/millie-walk.jpg\" onerror=\"this.style.display='none'\"></div><div class=\"qs-ph-body\"><div class=\"qs-ph-title\">Millie Walk</div><div class=\"qs-ph-sub\">Millie</div></div></div><div class=\"qs-transport\"><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"previous\" aria-label=\"Previous\">&#9198;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-lg\" data-act=\"toggle\" aria-label=\"Play / pause\">&#9199;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"next\" aria-label=\"Next\">&#9197;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm on\" data-act=\"transport\" data-action=\"toggle-shuffle\" aria-label=\"Shuffle\">&#128256;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm on\" data-act=\"transport\" data-action=\"toggle-repeat\" aria-label=\"Repeat\">&#128257;</button></div></div><div class=\"ph-qtab-bar\" role=\"tablist\"><button type=\"button\" class=\"ph-qtab active\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue 1</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next 2</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up 1</button></div><div class=\"ph-qtab-panel active\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"ph-qrow\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"beach-day\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\">Beach Day</span></button><span class=\"acts\"><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"ph-ract x\" data-act=\"remove\" data-entry=\"q1\" aria-label=\"Remove\">&#10005;</button></span></div></div><div class=\"ph-qtab-panel\" data-tab=\"next\" role=\"tabpanel\"><div class=\"ph-qrow\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"park-visit\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\">Park Visit</span></button><span class=\"acts\"><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"ph-ract\" data-act=\"move\" data-entry=\"s1\" data-dir=\"down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"ph-ract x\" data-act=\"remove\" data-entry=\"s1\" aria-label=\"Remove\">&#10005;</button></span></div><div class=\"ph-qrow\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"bath-time\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\">Bath Time</span></button><span class=\"acts\"><button type=\"button\" class=\"ph-ract\" data-act=\"move\" data-entry=\"s2\" data-dir=\"up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"s2\" data-dir=\"down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"ph-ract x\" data-act=\"remove\" data-entry=\"s2\" aria-label=\"Remove\">&#10005;</button></span></div></div><div class=\"ph-qtab-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"ph-qrow\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"millie-walk\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\">Millie Walk</span></button></div></div>");
  });

  it('companion: month source, empty queue + 1 next + no coming up (ordered, repeat off)', () => {
    expect(companionHomeMoviesQueueHtml(monthOrderedSnap())).toBe("<div class=\"qs-ph-hero\"><div class=\"qs-ph-top\"><div class=\"qs-art\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/park.jpg\" onerror=\"this.style.display='none'\"></div><div class=\"qs-ph-body\"><div class=\"qs-ph-title\">Park Visit</div><div class=\"qs-ph-sub\">Jan 2026</div></div></div><div class=\"qs-transport\"><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"previous\" aria-label=\"Previous\">&#9198;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-lg\" data-act=\"toggle\" aria-label=\"Play / pause\">&#9199;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"next\" aria-label=\"Next\">&#9197;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"toggle-shuffle\" aria-label=\"Shuffle\">&#128256;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"toggle-repeat\" aria-label=\"Repeat\">&#128257;</button></div></div><div class=\"ph-qtab-bar\" role=\"tablist\"><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue 0</button><button type=\"button\" class=\"ph-qtab active\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next 1</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up 0</button></div><div class=\"ph-qtab-panel\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"ph-qempty\">Nothing queued — add clips with ＋</div></div><div class=\"ph-qtab-panel active\" data-tab=\"next\" role=\"tabpanel\"><div class=\"ph-qrow\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"bath-time\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\">Bath Time</span></button><span class=\"acts\"><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"ph-ract x\" data-act=\"remove\" data-entry=\"s1\" aria-label=\"Remove\">&#10005;</button></span></div></div><div class=\"ph-qtab-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"ph-ends\">&#9209; Source ends — nothing plays after the last clip (repeat is off)</div></div>");
  });

  it('companion: empty/absent snapshot renders a stable all-empty shell', () => {
    expect(companionHomeMoviesQueueHtml(null)).toBe("<div class=\"ph-qtab-bar\" role=\"tablist\"><button type=\"button\" class=\"ph-qtab active\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue 0</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next 0</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up 0</button></div><div class=\"ph-qtab-panel active\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"ph-qempty\">Nothing queued — add clips with ＋</div></div><div class=\"ph-qtab-panel\" data-tab=\"next\" role=\"tabpanel\"><div class=\"ph-qempty\">Nothing up next</div></div><div class=\"ph-qtab-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"ph-ends\">&#9209; Source ends — nothing plays after the last clip (repeat is off)</div></div>");
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
