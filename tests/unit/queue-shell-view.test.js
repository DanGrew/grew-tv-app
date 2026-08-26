import { queueShellModel, queueShellHtml, companionQueueShellHtml, transportState, durationText } from '../../core/queue-shell-view.js';
import { HOME_MOVIE, FILM, MUSIC } from '../../core/queue-shell-config.js';

function entry(id, title, eid, dur, poster) {
  return { item_id: id, title: title, entry_id: eid, duration: dur, poster: poster == null ? 'clip.jpg' : poster };
}

// A home-movie person source: one queued clip, two left in the source, one
// wrapping into Coming Up, shuffle + repeat both on.
function personSnap() {
  return {
    now_playing: { item_id: 'millie-walk', title: 'Millie Walk', poster: 'millie-walk.jpg', duration: 42 },
    queue: [entry('beach-day', 'Beach Day', 'q1', 55)],
    next: [entry('park-visit', 'Park Visit', 's1', 61), entry('bath-time', 'Bath Time', 's2', 30)],
    coming_up: [entry('millie-walk', 'Millie Walk', 't1', 42)],
    shuffle: true, repeat: true, source_type: 'home-movies-by-person', source_id: 'millie'
  };
}

// A month source with nothing queued and repeat off — the ends-marker case.
function monthSnap() {
  return {
    now_playing: { item_id: 'park-visit', title: 'Park Visit', poster: 'park.jpg', duration: 61 },
    queue: [],
    next: [entry('bath-time', 'Bath Time', 's1', 30)],
    coming_up: [],
    shuffle: false, repeat: false, source_type: 'home-movie-month', source_id: '2026-01'
  };
}

// A standalone film with one film queued behind it: NO source, but something
// to advance to — the case BUG-510 got wrong.
function standaloneFilmSnap() {
  return {
    now_playing: { item_id: 'up', title: 'Up', poster: 'up.jpg', duration: 5760 },
    queue: [entry('moana', 'Moana', 'q1', 6420, 'moana.jpg')],
    next: [],
    coming_up: [],
    shuffle: false, repeat: false, source_type: null, source_id: null
  };
}

describe('transportState — one rule for every media type', () => {
  it('lights Next off the override queue alone, with no source at all', () => {
    expect(transportState(standaloneFilmSnap())).toEqual({ previous: false, next: true, shuffle: false, repeat: false });
  });

  it('lights Next off the rest of the source', () => {
    expect(transportState(monthSnap()).next).toBe(true);
  });

  it('lights Next off Coming Up alone', () => {
    var snap = standaloneFilmSnap();
    snap.queue = [];
    snap.coming_up = [entry('moana', 'Moana', 't1', 6420)];
    expect(transportState(snap).next).toBe(true);
  });

  it('kills Next only when there is genuinely nothing ahead', () => {
    var snap = standaloneFilmSnap();
    snap.queue = [];
    expect(transportState(snap).next).toBe(false);
  });

  it('gates Previous/Shuffle/Repeat on there being a source', () => {
    expect(transportState(personSnap())).toEqual({ previous: true, next: true, shuffle: true, repeat: true });
  });

  it('treats an absent snapshot as nothing playable', () => {
    expect(transportState(null)).toEqual({ previous: false, next: false, shuffle: false, repeat: false });
    expect(transportState({})).toEqual({ previous: false, next: false, shuffle: false, repeat: false });
  });
});

describe('durationText', () => {
  it('formats seconds', () => {
    expect(durationText(61)).toBe('1:01');
  });
  it('is empty for a missing or unparseable duration', () => {
    expect(durationText(null)).toBe('');
    expect(durationText(undefined)).toBe('');
    expect(durationText(NaN)).toBe('');
  });
});

describe('queueShellModel', () => {
  it('buckets queue/next/coming_up straight off the server-resolved lists', () => {
    var m = queueShellModel(personSnap(), HOME_MOVIE);
    expect(m.queueRows.map(r => r.itemId)).toEqual(['beach-day']);
    expect(m.nextRows.map(r => r.itemId)).toEqual(['park-visit', 'bath-time']);
    expect(m.comingUpRows.map(r => r.itemId)).toEqual(['millie-walk']);
  });

  it('carries entry_id + poster + the config-resolved sub line on every row', () => {
    var m = queueShellModel(personSnap(), HOME_MOVIE);
    expect(m.queueRows[0]).toEqual({ entryId: 'q1', itemId: 'beach-day', title: 'Beach Day', poster: 'clip.jpg', sub: '0:55' });
  });

  it('resolves the hero source line through the config — derived, for home movies', () => {
    expect(queueShellModel(personSnap(), HOME_MOVIE).hero).toEqual({
      itemId: 'millie-walk', title: 'Millie Walk', poster: 'millie-walk.jpg', subtitle: 'Millie'
    });
    expect(queueShellModel(monthSnap(), HOME_MOVIE).hero.subtitle).toBe('Jan 2026');
  });

  it('resolves the hero source line through the config — caller-supplied, for films', () => {
    expect(queueShellModel(personSnap(), FILM, 'Toy Story Collection').hero.subtitle).toBe('Toy Story Collection');
    expect(queueShellModel(standaloneFilmSnap(), FILM).hero.subtitle).toBe('');
  });

  it('is null hero for an empty/absent snapshot', () => {
    expect(queueShellModel(null, HOME_MOVIE).hero).toBe(null);
    expect(queueShellModel({}, HOME_MOVIE).hero).toBe(null);
  });

  it('carries shuffle/repeat straight off the snapshot', () => {
    expect(queueShellModel(personSnap(), HOME_MOVIE)).toMatchObject({ shuffle: true, repeat: true });
    expect(queueShellModel(monthSnap(), HOME_MOVIE)).toMatchObject({ shuffle: false, repeat: false });
  });

  it('reads the media noun into the shared empty/ends wording', () => {
    expect(queueShellModel(personSnap(), HOME_MOVIE).texts).toEqual({
      emptyQueue: 'Nothing queued — add clips with ＋',
      emptyNext: 'Nothing up next',
      ends: 'Source ends — nothing plays after the last clip (repeat is off)'
    });
    expect(queueShellModel(personSnap(), FILM).texts).toEqual({
      emptyQueue: 'Nothing queued — add titles with ＋',
      emptyNext: 'Nothing up next',
      ends: 'Source ends — nothing plays after the last title (repeat is off)'
    });
  });

  it('carries the config glyph', () => {
    expect(queueShellModel(personSnap(), MUSIC).glyph).toBe('&#127925;');
  });

  it('carries the transport state the config rule resolved', () => {
    expect(queueShellModel(standaloneFilmSnap(), FILM).transport.next).toBe(true);
  });
});

// The count is bracketed — "Next (2)", never "Next 2". One label builder feeds
// both surfaces, so a regression would show on TV and phone at once; both are
// pinned here, empty tabs included, since "(0)" is the case a naive format
// change is most likely to drop.
describe('tab labels — the count in brackets', () => {
  it('brackets the count on every TV tab', () => {
    var html = queueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('>Queue (1)</button>');
    expect(html).toContain('>Next (2)</button>');
    expect(html).toContain('>Coming Up (1)</button>');
    expect(html).not.toContain('>Queue 1</button>');
    expect(html).not.toContain('>Next 2</button>');
    expect(html).not.toContain('>Coming Up 1</button>');
  });

  it('brackets the count on every phone tab', () => {
    var html = companionQueueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('>Queue (1)</button>');
    expect(html).toContain('>Next (2)</button>');
    expect(html).toContain('>Coming Up (1)</button>');
    expect(html).not.toContain('>Queue 1</button>');
  });

  it('keeps the brackets and the number on an empty tab, on both surfaces', () => {
    expect(queueShellHtml(monthSnap(), HOME_MOVIE)).toContain('>Queue (0)</button>');
    expect(queueShellHtml(monthSnap(), HOME_MOVIE)).toContain('>Coming Up (0)</button>');
    expect(companionQueueShellHtml(monthSnap(), HOME_MOVIE)).toContain('>Queue (0)</button>');
    expect(companionQueueShellHtml(monthSnap(), HOME_MOVIE)).toContain('>Coming Up (0)</button>');
  });

  it('reads the same for a film source as for home movies', () => {
    expect(queueShellHtml(standaloneFilmSnap(), FILM)).toContain('>Queue (1)</button>');
    expect(companionQueueShellHtml(standaloneFilmSnap(), FILM)).toContain('>Next (0)</button>');
  });
});

describe('queueShellHtml — TV', () => {
  it('lays the sections out as Queue / Next / Coming Up tabs, each labelled with its live count', () => {
    var html = queueShellHtml(personSnap(), HOME_MOVIE);
    ['queue', 'next', 'coming-up'].forEach(function(t) {
      expect(html).toContain('data-act="tab" data-tab="' + t + '"');
    });
    expect(html).toContain('>Queue (1)</button>');
    expect(html).toContain('>Next (2)</button>');
    expect(html).toContain('>Coming Up (1)</button>');
  });

  it('opens on Queue when something is queued, on Next when nothing is', () => {
    expect(queueShellHtml(personSnap(), HOME_MOVIE)).toContain('class="qs-tab active" data-act="tab" data-tab="queue"');
    expect(queueShellHtml(monthSnap(), HOME_MOVIE)).toContain('class="qs-tab active" data-act="tab" data-tab="next"');
  });

  it('shows the media-typed empty-queue placeholder', () => {
    expect(queueShellHtml(monthSnap(), HOME_MOVIE)).toContain('<div class="qs-empty">Nothing queued — add clips with ＋</div>');
    expect(queueShellHtml(monthSnap(), FILM)).toContain('<div class="qs-empty">Nothing queued — add titles with ＋</div>');
  });

  it('shows the empty-next placeholder when the source has nothing left', () => {
    expect(queueShellHtml(standaloneFilmSnap(), FILM)).toContain('<div class="qs-empty">Nothing up next</div>');
  });

  it('shows the end-of-source marker under Coming Up when repeat is off', () => {
    expect(queueShellHtml(monthSnap(), HOME_MOVIE)).toContain('&#9209; Source ends — nothing plays after the last clip (repeat is off)');
  });

  it('renders the hero art/title/source line + the icon-only transport row', () => {
    var html = queueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('class="qs-hero-title">Millie Walk</div>');
    expect(html).toContain('class="qs-hero-sub">Millie</div>');
    expect(html).toContain('data-act="transport" data-action="previous"');
    expect(html).toContain('data-act="toggle" aria-label="Play / pause"');
    expect(html).toContain('data-act="transport" data-action="next"');
    expect(html).toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-shuffle"');
    expect(html).toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-repeat"');
  });

  it('renders Shuffle/Repeat OFF rather than omitted when the source has them off', () => {
    var html = queueShellHtml(monthSnap(), HOME_MOVIE);
    expect(html).toContain('data-act="transport" data-action="toggle-shuffle"');
    expect(html).not.toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-shuffle"');
  });

  // The design's whole point at the hero: never hidden, dimmed instead.
  it('renders Shuffle/Repeat/Previous DISABLED-but-visible with no source, and Next still live', () => {
    var html = queueShellHtml(standaloneFilmSnap(), FILM);
    expect(html).toContain('class="qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Shuffle"');
    expect(html).toContain('class="qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Repeat"');
    expect(html).toContain('class="qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Previous"');
    expect(html).toContain('class="qs-tbtn qs-tbtn-sm" data-act="transport" data-action="next" aria-label="Next"');
  });

  it('keeps Play/Pause live even with nothing else to act on', () => {
    var snap = standaloneFilmSnap();
    snap.queue = [];
    expect(queueShellHtml(snap, FILM)).toContain('class="qs-tbtn qs-tbtn-lg" data-act="toggle" aria-label="Play / pause"');
    expect(queueShellHtml(snap, FILM)).toContain('class="qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Next"');
  });

  it('gives every row a title over a muted sub line', () => {
    var html = queueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('<span class="qs-body"><span class="qs-name">Beach Day</span><span class="qs-sub">0:55</span></span>');
  });

  it('every row select fires play-item keyed on item_id — no queue/source mutation on tap', () => {
    var html = queueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('data-act="select" data-item="beach-day"');
    expect(html).toContain('data-act="select" data-item="park-visit"');
    expect(html).toContain('data-act="select" data-item="millie-walk"');
    expect(html).not.toContain('data-act="queue"');
  });

  it('Queue + Next rows carry reorder + remove actions', () => {
    var html = queueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="up"');
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="down"');
    expect(html).toContain('data-act="remove" data-entry="s1"');
  });

  it('disables shift-up on the first row and shift-down on the last', () => {
    var html = queueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('class="qs-act is-disabled" disabled data-act="move" data-entry="s1" data-dir="up"');
    expect(html).toContain('class="qs-act" data-act="move" data-entry="s1" data-dir="down"');
    expect(html).toContain('class="qs-act is-disabled" disabled data-act="move" data-entry="s2" data-dir="down"');
    expect(html).toContain('class="qs-act" data-act="move" data-entry="s2" data-dir="up"');
  });

  it('Coming Up rows carry NO actions and render read-only', () => {
    var html = queueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('class="qs-row qs-readonly">');
    expect(html).not.toMatch(/data-item="millie-walk"[^]*?data-act="remove" data-entry="t1"/);
  });

  it('renders poster art with a fallback glyph and onerror hiding', () => {
    var html = queueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('src="/media/clip.jpg"');
    expect(html).toContain("onerror=\"this.style.display='none'\"");
  });

  it('falls back to the config glyph for a row with no poster', () => {
    var snap = personSnap();
    snap.next[0].poster = null;
    expect(queueShellHtml(snap, HOME_MOVIE)).toContain('<span class="qs-thumb">&#127916;</span>');
    expect(queueShellHtml(snap, MUSIC)).toContain('<span class="qs-thumb">&#127925;</span>');
  });

  it('falls back to the config glyph for the hero art when now_playing has no poster', () => {
    var snap = personSnap();
    snap.now_playing.poster = null;
    expect(queueShellHtml(snap, HOME_MOVIE)).toContain('<div class="qs-art">&#127916;</div>');
  });

  it('joins Coming Up rows back-to-back with no separator', () => {
    var snap = personSnap();
    snap.coming_up.push(entry('park-visit', 'Park Visit', 't2', 61));
    expect(queueShellHtml(snap, HOME_MOVIE)).toContain('</div><div class="qs-row qs-readonly">');
  });

  it('escapes titles', () => {
    var snap = personSnap();
    snap.next[0].title = 'Tom & <Jerry> O\'Neil "Live"';
    expect(queueShellHtml(snap, HOME_MOVIE)).toContain('Tom &amp; &lt;Jerry&gt; O&#39;Neil &quot;Live&quot;');
  });

  it('renders a stable shell for an empty snapshot', () => {
    var html = queueShellHtml(null, HOME_MOVIE);
    expect(html).toContain('Source ends');
    expect(html).not.toContain('qs-hero-title');
  });
});

describe('companionQueueShellHtml — phone mirror', () => {
  it('renders the same screen in the phone class set', () => {
    var html = companionQueueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('class="qs-ph-hero"');
    expect(html).toContain('class="qs-ph-title">Millie Walk</div>');
    expect(html).toContain('class="qs-ph-sub">Millie</div>');
    expect(html).toContain('class="ph-qrow"');
    expect(html).toContain('class="ph-qname"');
    expect(html).toContain('class="ph-ract"');
    expect(html).toContain('>Queue (1)</button>');
  });

  it('gives every phone row the same title-over-muted-sub line the TV has', () => {
    expect(companionQueueShellHtml(personSnap(), HOME_MOVIE))
      .toContain('<span class="nm"><span class="qs-name">Beach Day</span><span class="qs-sub">0:55</span></span>');
  });

  // The companion copy emitted no read-only class at all, so Coming Up could
  // not be dimmed on the phone.
  it('marks Coming Up rows read-only so the phone can dim them', () => {
    expect(companionQueueShellHtml(personSnap(), HOME_MOVIE)).toContain('class="ph-qrow ph-readonly">');
  });

  it('keys per-row edits on entry_id (move/remove), select on item_id', () => {
    var html = companionQueueShellHtml(personSnap(), HOME_MOVIE);
    expect(html).toContain('data-act="select" data-item="beach-day"');
    expect(html).toContain('data-act="move" data-entry="q1" data-dir="down"');
    expect(html).toContain('data-act="remove" data-entry="q1"');
  });

  it('wraps phone row actions in a <span>, the TV\'s in a <div>', () => {
    expect(companionQueueShellHtml(personSnap(), HOME_MOVIE)).toContain('<span class="acts">');
    expect(companionQueueShellHtml(personSnap(), HOME_MOVIE)).toContain('</span></div>');
    expect(queueShellHtml(personSnap(), HOME_MOVIE)).toContain('<div class="qs-actions">');
  });

  it('disables the section-edge shift', () => {
    expect(companionQueueShellHtml(personSnap(), HOME_MOVIE))
      .toContain('class="ph-ract is-disabled" disabled data-act="move" data-entry="s1" data-dir="up"');
  });

  it('shares the hero transport classes with the TV, disabled state included', () => {
    var html = companionQueueShellHtml(standaloneFilmSnap(), FILM);
    expect(html).toContain('class="qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Shuffle"');
    expect(html).toContain('class="qs-tbtn qs-tbtn-sm" data-act="transport" data-action="next" aria-label="Next"');
  });

  it('shows the end-of-source marker when the source ends', () => {
    expect(companionQueueShellHtml(monthSnap(), HOME_MOVIE)).toContain('class="ph-ends"');
  });

  it('falls back to the config glyph in a row grip with no poster', () => {
    var snap = personSnap();
    snap.queue[0].poster = null;
    expect(companionQueueShellHtml(snap, HOME_MOVIE)).toContain('<span class="grip">&#127916;</span>');
  });

  it('joins Coming Up rows back-to-back with no separator', () => {
    var snap = personSnap();
    snap.coming_up.push(entry('park-visit', 'Park Visit', 't2', 61));
    expect(companionQueueShellHtml(snap, HOME_MOVIE)).toContain('</div><div class="ph-qrow ph-readonly">');
  });

  it('renders a stable shell for an empty snapshot', () => {
    var html = companionQueueShellHtml(null, HOME_MOVIE);
    expect(html).toContain('Source ends');
    expect(html).not.toContain('qs-ph-hero');
  });
});

// Fallback branches: null-valued fields, missing durations.
describe('fallbacks', () => {
  it('escapes a null title as an empty string (no "null" text)', () => {
    var snap = personSnap();
    snap.now_playing.title = null;
    var html = queueShellHtml(snap, HOME_MOVIE);
    expect(html).toContain('class="qs-hero-title"></div>');
    expect(html).not.toContain('>null<');
  });

  it('renders an empty sub line when a row carries no duration', () => {
    var snap = personSnap();
    snap.next[0].duration = null;
    expect(queueShellModel(snap, HOME_MOVIE).nextRows[0].sub).toBe('');
    expect(queueShellHtml(snap, HOME_MOVIE)).toContain('<span class="qs-sub"></span>');
  });
});

// Full-string equality on representative snapshots. Every literal, join
// separator, class name, enabled/disabled branch and conditional in the
// hero/row/tab-panel builders appears in one of these eight outputs, so this
// pins the exact markup mutation testing needs — a stray StringLiteral /
// BooleanLiteral / ConditionalExpression flip anywhere in the shell breaks
// one of these `toBe`s. Both surfaces are here because they come out of the
// SAME builders: a class-map slip would otherwise show on only one.
describe('exact markup — mutation coverage', () => {
  it("TV: home-movie person source — 1 queued + 2 next + 1 coming up, shuffle+repeat on", () => {
    expect(queueShellHtml(personSnap(), HOME_MOVIE)).toBe("<div class=\"qs-hero\"><div class=\"qs-hero-top\"><div class=\"qs-art\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/millie-walk.jpg\" onerror=\"this.style.display='none'\"></div><div class=\"qs-hero-body\"><div class=\"qs-hero-title\">Millie Walk</div><div class=\"qs-hero-sub\">Millie</div></div></div><div class=\"qs-transport\"><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"previous\" aria-label=\"Previous\">&#9198;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-lg\" data-act=\"toggle\" aria-label=\"Play / pause\">&#9199;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"next\" aria-label=\"Next\">&#9197;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm on\" data-act=\"transport\" data-action=\"toggle-shuffle\" aria-label=\"Shuffle\">&#128256;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm on\" data-act=\"transport\" data-action=\"toggle-repeat\" aria-label=\"Repeat\">&#128257;</button></div></div><div class=\"qs-tabbar\" role=\"tablist\"><button type=\"button\" class=\"qs-tab active\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue (1)</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next (2)</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up (1)</button></div><div class=\"qs-panel active\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"qs-row\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"beach-day\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-body\"><span class=\"qs-name\">Beach Day</span><span class=\"qs-sub\">0:55</span></span></button><div class=\"qs-actions\"><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"qs-act danger\" data-act=\"remove\" data-entry=\"q1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></div></div></div><div class=\"qs-panel\" data-tab=\"next\" role=\"tabpanel\"><div class=\"qs-row\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"park-visit\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-body\"><span class=\"qs-name\">Park Visit</span><span class=\"qs-sub\">1:01</span></span></button><div class=\"qs-actions\"><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"qs-act\" data-act=\"move\" data-entry=\"s1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"qs-act danger\" data-act=\"remove\" data-entry=\"s1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></div></div><div class=\"qs-row\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"bath-time\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-body\"><span class=\"qs-name\">Bath Time</span><span class=\"qs-sub\">0:30</span></span></button><div class=\"qs-actions\"><button type=\"button\" class=\"qs-act\" data-act=\"move\" data-entry=\"s2\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"s2\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"qs-act danger\" data-act=\"remove\" data-entry=\"s2\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></div></div></div><div class=\"qs-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"qs-row qs-readonly\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"millie-walk\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-body\"><span class=\"qs-name\">Millie Walk</span><span class=\"qs-sub\">0:42</span></span></button></div></div>");
  });

  it("TV: home-movie month source — empty Queue, 1 next, the ends marker (repeat off)", () => {
    expect(queueShellHtml(monthSnap(), HOME_MOVIE)).toBe("<div class=\"qs-hero\"><div class=\"qs-hero-top\"><div class=\"qs-art\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/park.jpg\" onerror=\"this.style.display='none'\"></div><div class=\"qs-hero-body\"><div class=\"qs-hero-title\">Park Visit</div><div class=\"qs-hero-sub\">Jan 2026</div></div></div><div class=\"qs-transport\"><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"previous\" aria-label=\"Previous\">&#9198;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-lg\" data-act=\"toggle\" aria-label=\"Play / pause\">&#9199;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"next\" aria-label=\"Next\">&#9197;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"toggle-shuffle\" aria-label=\"Shuffle\">&#128256;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"toggle-repeat\" aria-label=\"Repeat\">&#128257;</button></div></div><div class=\"qs-tabbar\" role=\"tablist\"><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue (0)</button><button type=\"button\" class=\"qs-tab active\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next (1)</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up (0)</button></div><div class=\"qs-panel\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"qs-empty\">Nothing queued — add clips with ＋</div></div><div class=\"qs-panel active\" data-tab=\"next\" role=\"tabpanel\"><div class=\"qs-row\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"bath-time\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-body\"><span class=\"qs-name\">Bath Time</span><span class=\"qs-sub\">0:30</span></span></button><div class=\"qs-actions\"><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"qs-act danger\" data-act=\"remove\" data-entry=\"s1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></div></div></div><div class=\"qs-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"qs-ends\">&#9209; Source ends — nothing plays after the last clip (repeat is off)</div></div>");
  });

  it("TV: standalone film, 1 queued — every disabled-but-visible transport control, Next live", () => {
    expect(queueShellHtml(standaloneFilmSnap(), FILM)).toBe("<div class=\"qs-hero\"><div class=\"qs-hero-top\"><div class=\"qs-art\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/up.jpg\" onerror=\"this.style.display='none'\"></div><div class=\"qs-hero-body\"><div class=\"qs-hero-title\">Up</div><div class=\"qs-hero-sub\"></div></div></div><div class=\"qs-transport\"><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm is-disabled\" disabled aria-label=\"Previous\">&#9198;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-lg\" data-act=\"toggle\" aria-label=\"Play / pause\">&#9199;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"next\" aria-label=\"Next\">&#9197;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm is-disabled\" disabled aria-label=\"Shuffle\">&#128256;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm is-disabled\" disabled aria-label=\"Repeat\">&#128257;</button></div></div><div class=\"qs-tabbar\" role=\"tablist\"><button type=\"button\" class=\"qs-tab active\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue (1)</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next (0)</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up (0)</button></div><div class=\"qs-panel active\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"qs-row\"><button type=\"button\" class=\"qs-select\" data-act=\"select\" data-item=\"moana\"><span class=\"qs-thumb\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/moana.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"qs-body\"><span class=\"qs-name\">Moana</span><span class=\"qs-sub\">1:47:00</span></span></button><div class=\"qs-actions\"><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"qs-act is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"qs-act danger\" data-act=\"remove\" data-entry=\"q1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></div></div></div><div class=\"qs-panel\" data-tab=\"next\" role=\"tabpanel\"><div class=\"qs-empty\">Nothing up next</div></div><div class=\"qs-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"qs-ends\">&#9209; Source ends — nothing plays after the last title (repeat is off)</div></div>");
  });

  it("TV: empty/absent snapshot renders a stable all-empty shell", () => {
    expect(queueShellHtml(null, FILM)).toBe("<div class=\"qs-tabbar\" role=\"tablist\"><button type=\"button\" class=\"qs-tab active\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue (0)</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next (0)</button><button type=\"button\" class=\"qs-tab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up (0)</button></div><div class=\"qs-panel active\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"qs-empty\">Nothing queued — add titles with ＋</div></div><div class=\"qs-panel\" data-tab=\"next\" role=\"tabpanel\"><div class=\"qs-empty\">Nothing up next</div></div><div class=\"qs-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"qs-ends\">&#9209; Source ends — nothing plays after the last title (repeat is off)</div></div>");
  });

  it("companion: home-movie person source — 1 queued + 2 next + 1 read-only coming up", () => {
    expect(companionQueueShellHtml(personSnap(), HOME_MOVIE)).toBe("<div class=\"qs-ph-hero\"><div class=\"qs-ph-top\"><div class=\"qs-art\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/millie-walk.jpg\" onerror=\"this.style.display='none'\"></div><div class=\"qs-ph-body\"><div class=\"qs-ph-title\">Millie Walk</div><div class=\"qs-ph-sub\">Millie</div></div></div><div class=\"qs-transport\"><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"previous\" aria-label=\"Previous\">&#9198;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-lg\" data-act=\"toggle\" aria-label=\"Play / pause\">&#9199;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"next\" aria-label=\"Next\">&#9197;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm on\" data-act=\"transport\" data-action=\"toggle-shuffle\" aria-label=\"Shuffle\">&#128256;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm on\" data-act=\"transport\" data-action=\"toggle-repeat\" aria-label=\"Repeat\">&#128257;</button></div></div><div class=\"ph-qtab-bar\" role=\"tablist\"><button type=\"button\" class=\"ph-qtab active\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue (1)</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next (2)</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up (1)</button></div><div class=\"ph-qtab-panel active\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"ph-qrow\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"beach-day\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\"><span class=\"qs-name\">Beach Day</span><span class=\"qs-sub\">0:55</span></span></button><span class=\"acts\"><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"ph-ract x\" data-act=\"remove\" data-entry=\"q1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></span></div></div><div class=\"ph-qtab-panel\" data-tab=\"next\" role=\"tabpanel\"><div class=\"ph-qrow\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"park-visit\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\"><span class=\"qs-name\">Park Visit</span><span class=\"qs-sub\">1:01</span></span></button><span class=\"acts\"><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"ph-ract\" data-act=\"move\" data-entry=\"s1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"ph-ract x\" data-act=\"remove\" data-entry=\"s1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></span></div><div class=\"ph-qrow\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"bath-time\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\"><span class=\"qs-name\">Bath Time</span><span class=\"qs-sub\">0:30</span></span></button><span class=\"acts\"><button type=\"button\" class=\"ph-ract\" data-act=\"move\" data-entry=\"s2\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"s2\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"ph-ract x\" data-act=\"remove\" data-entry=\"s2\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></span></div></div><div class=\"ph-qtab-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"ph-qrow ph-readonly\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"millie-walk\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\"><span class=\"qs-name\">Millie Walk</span><span class=\"qs-sub\">0:42</span></span></button></div></div>");
  });

  it("companion: home-movie month source — empty Queue, 1 next, the ends marker", () => {
    expect(companionQueueShellHtml(monthSnap(), HOME_MOVIE)).toBe("<div class=\"qs-ph-hero\"><div class=\"qs-ph-top\"><div class=\"qs-art\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/park.jpg\" onerror=\"this.style.display='none'\"></div><div class=\"qs-ph-body\"><div class=\"qs-ph-title\">Park Visit</div><div class=\"qs-ph-sub\">Jan 2026</div></div></div><div class=\"qs-transport\"><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"previous\" aria-label=\"Previous\">&#9198;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-lg\" data-act=\"toggle\" aria-label=\"Play / pause\">&#9199;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"next\" aria-label=\"Next\">&#9197;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"toggle-shuffle\" aria-label=\"Shuffle\">&#128256;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"toggle-repeat\" aria-label=\"Repeat\">&#128257;</button></div></div><div class=\"ph-qtab-bar\" role=\"tablist\"><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue (0)</button><button type=\"button\" class=\"ph-qtab active\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next (1)</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up (0)</button></div><div class=\"ph-qtab-panel\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"ph-qempty\">Nothing queued — add clips with ＋</div></div><div class=\"ph-qtab-panel active\" data-tab=\"next\" role=\"tabpanel\"><div class=\"ph-qrow\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"bath-time\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/clip.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\"><span class=\"qs-name\">Bath Time</span><span class=\"qs-sub\">0:30</span></span></button><span class=\"acts\"><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"s1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"ph-ract x\" data-act=\"remove\" data-entry=\"s1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></span></div></div><div class=\"ph-qtab-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"ph-ends\">&#9209; Source ends — nothing plays after the last clip (repeat is off)</div></div>");
  });

  it("companion: standalone film, 1 queued — the same disabled transport row as the TV", () => {
    expect(companionQueueShellHtml(standaloneFilmSnap(), FILM)).toBe("<div class=\"qs-ph-hero\"><div class=\"qs-ph-top\"><div class=\"qs-art\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/up.jpg\" onerror=\"this.style.display='none'\"></div><div class=\"qs-ph-body\"><div class=\"qs-ph-title\">Up</div><div class=\"qs-ph-sub\"></div></div></div><div class=\"qs-transport\"><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm is-disabled\" disabled aria-label=\"Previous\">&#9198;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-lg\" data-act=\"toggle\" aria-label=\"Play / pause\">&#9199;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm\" data-act=\"transport\" data-action=\"next\" aria-label=\"Next\">&#9197;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm is-disabled\" disabled aria-label=\"Shuffle\">&#128256;</button><button type=\"button\" class=\"qs-tbtn qs-tbtn-sm is-disabled\" disabled aria-label=\"Repeat\">&#128257;</button></div></div><div class=\"ph-qtab-bar\" role=\"tablist\"><button type=\"button\" class=\"ph-qtab active\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue (1)</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next (0)</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up (0)</button></div><div class=\"ph-qtab-panel active\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"ph-qrow\"><button type=\"button\" class=\"ph-qname\" data-act=\"select\" data-item=\"moana\"><span class=\"grip\"><img class=\"poster-thumb\" alt=\"\" loading=\"lazy\" src=\"/media/moana.jpg\" onerror=\"this.style.display='none'\"></span><span class=\"nm\"><span class=\"qs-name\">Moana</span><span class=\"qs-sub\">1:47:00</span></span></button><span class=\"acts\"><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"up\" title=\"Shift up\" aria-label=\"Shift up\">&#8593;</button><button type=\"button\" class=\"ph-ract is-disabled\" disabled data-act=\"move\" data-entry=\"q1\" data-dir=\"down\" title=\"Shift down\" aria-label=\"Shift down\">&#8595;</button><button type=\"button\" class=\"ph-ract x\" data-act=\"remove\" data-entry=\"q1\" title=\"Remove\" aria-label=\"Remove\">&#10005;</button></span></div></div><div class=\"ph-qtab-panel\" data-tab=\"next\" role=\"tabpanel\"><div class=\"ph-qempty\">Nothing up next</div></div><div class=\"ph-qtab-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"ph-ends\">&#9209; Source ends — nothing plays after the last title (repeat is off)</div></div>");
  });

  it("companion: empty/absent snapshot renders a stable all-empty shell", () => {
    expect(companionQueueShellHtml(null, FILM)).toBe("<div class=\"ph-qtab-bar\" role=\"tablist\"><button type=\"button\" class=\"ph-qtab active\" data-act=\"tab\" data-tab=\"queue\" role=\"tab\">Queue (0)</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"next\" role=\"tab\">Next (0)</button><button type=\"button\" class=\"ph-qtab\" data-act=\"tab\" data-tab=\"coming-up\" role=\"tab\">Coming Up (0)</button></div><div class=\"ph-qtab-panel active\" data-tab=\"queue\" role=\"tabpanel\"><div class=\"ph-qempty\">Nothing queued — add titles with ＋</div></div><div class=\"ph-qtab-panel\" data-tab=\"next\" role=\"tabpanel\"><div class=\"ph-qempty\">Nothing up next</div></div><div class=\"ph-qtab-panel\" data-tab=\"coming-up\" role=\"tabpanel\"><div class=\"ph-ends\">&#9209; Source ends — nothing plays after the last title (repeat is off)</div></div>");
  });
});
