import { queueModel, filmQueueViewHtml, companionFilmQueueHtml } from '../../core/film-queue-view.js';

function entry(id, title, eid, dur, poster) {
  return { item_id: id, title: title, entry_id: eid, duration: dur, poster: poster == null ? 'clip.jpg' : poster };
}

// A series/boxset in progress: a source, so the hero transport is enabled.
function seriesSnap() {
  return {
    now_playing: { item_id: 'bluey-s1e01', title: 'Daddy Putdown', poster: 'bluey.jpg', duration: 420 },
    queue: [entry('bluey-s1e03', 'Hammerbarn', 'q1', 440)],
    next: [entry('bluey-s1e02', 'The Weekend', 's1', 430)],
    coming_up: [entry('bluey-s1e01', 'Daddy Putdown', 't1', 420)],
    shuffle: true, repeat: true, source_type: 'series', source_id: 'bluey'
  };
}

// A standalone film: no source at all — nothing to shuffle/repeat/skip to.
function standaloneSnap() {
  return {
    now_playing: { item_id: 'toy-story-main', title: 'Toy Story', poster: 'toy-story.jpg', duration: 4860 },
    queue: [], next: [], coming_up: [],
    shuffle: false, repeat: false, source_type: null, source_id: null
  };
}

describe('queueModel', () => {
  it('buckets queue/next/coming_up straight off the server-resolved lists', () => {
    var m = queueModel(seriesSnap(), 'Bluey');
    expect(m.queueRows.map(r => r.itemId)).toEqual(['bluey-s1e03']);
    expect(m.nextRows.map(r => r.itemId)).toEqual(['bluey-s1e02']);
    expect(m.comingUpRows.map(r => r.itemId)).toEqual(['bluey-s1e01']);
  });

  it('carries entry_id + poster on every row', () => {
    var m = queueModel(seriesSnap(), 'Bluey');
    expect(m.queueRows[0].entryId).toBe('q1');
    expect(m.queueRows[0].poster).toBe('clip.jpg');
  });

  it('resolves the hero from now_playing + the caller-supplied source title', () => {
    var m = queueModel(seriesSnap(), 'Bluey');
    expect(m.hero).toEqual({ itemId: 'bluey-s1e01', title: 'Daddy Putdown', poster: 'bluey.jpg', subtitle: 'Bluey' });
  });

  it('the hero subtitle is empty for a standalone film (no source title to pass)', () => {
    expect(queueModel(standaloneSnap(), null).hero.subtitle).toBe('');
    expect(queueModel(standaloneSnap(), undefined).hero.subtitle).toBe('');
  });

  it('is null hero for an empty/absent snapshot', () => {
    expect(queueModel(null, 'Bluey').hero).toBe(null);
    expect(queueModel({}, 'Bluey').hero).toBe(null);
  });

  it('hasSource is true when the snapshot carries a source_type, false otherwise', () => {
    expect(queueModel(seriesSnap(), 'Bluey').hasSource).toBe(true);
    expect(queueModel(standaloneSnap(), null).hasSource).toBe(false);
    expect(queueModel(null, null).hasSource).toBe(false);
  });

  it('carries shuffle/repeat straight off the snapshot', () => {
    expect(queueModel(seriesSnap(), 'Bluey')).toMatchObject({ shuffle: true, repeat: true });
    expect(queueModel(standaloneSnap(), null)).toMatchObject({ shuffle: false, repeat: false });
  });
});

describe('filmQueueViewHtml — TV', () => {
  it('lays the sections out as Queue / Next / Coming Up tabs, each labelled with its live count', () => {
    var html = filmQueueViewHtml(seriesSnap(), 'Bluey');
    ['queue', 'next', 'coming-up'].forEach(function(t) {
      expect(html).toContain('data-act="tab" data-tab="' + t + '"');
    });
    expect(html).toContain('>Queue 1</button>');
    expect(html).toContain('>Next 1</button>');
    expect(html).toContain('>Coming Up 1</button>');
  });

  it('opens on Queue when items are queued, on Next when none are', () => {
    expect(filmQueueViewHtml(seriesSnap(), 'Bluey')).toContain('class="qs-tab active" data-act="tab" data-tab="queue"');
    var snap = seriesSnap();
    snap.queue = [];
    expect(filmQueueViewHtml(snap, 'Bluey')).toContain('class="qs-tab active" data-act="tab" data-tab="next"');
  });

  it('shows the empty-queue placeholder under the Queue tab when nothing is queued', () => {
    var html = filmQueueViewHtml(standaloneSnap(), null);
    expect(html).toContain('class="qs-empty"');
    expect(html).toMatch(/Nothing queued/);
  });

  it('shows the end-of-source marker under Coming Up when repeat is off', () => {
    expect(filmQueueViewHtml(standaloneSnap(), null)).toContain('Source ends');
  });

  it('renders the hero art/title/subtitle + an icon-only transport row, enabled when the source has a shuffleable/repeatable source', () => {
    var html = filmQueueViewHtml(seriesSnap(), 'Bluey');
    expect(html).toContain('class="qs-hero-title">Daddy Putdown</div>');
    expect(html).toContain('class="qs-hero-sub">Bluey</div>');
    expect(html).toContain('data-act="transport" data-action="previous"');
    expect(html).toContain('data-act="toggle" aria-label="Play / pause"');
    expect(html).toContain('data-act="transport" data-action="next"');
    expect(html).toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-shuffle"');
    expect(html).toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-repeat"');
    // the hero transport itself carries no is-disabled class (row-level shift
    // buttons legitimately do, at a section's edge — scoped to qs-transport).
    var transport = html.match(/<div class="qs-transport">.*?<\/div>/s)[0];
    expect(transport).not.toContain('is-disabled');
  });

  it('shuffle/repeat render off (not disabled) when the source has them off but a source exists', () => {
    var snap = seriesSnap();
    snap.shuffle = false; snap.repeat = false;
    var html = filmQueueViewHtml(snap, 'Bluey');
    expect(html).toContain('data-act="transport" data-action="toggle-shuffle"');
    expect(html).not.toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-shuffle"');
    var transport = html.match(/<div class="qs-transport">.*?<\/div>/s)[0];
    expect(transport).not.toContain('is-disabled');
  });

  // TASK-493 row 21 — a standalone film (no source) renders Shuffle/Repeat
  // (and ⏮/⏭) disabled-but-visible: still there, dimmed, and inert (no
  // data-act/data-action so a stray tap can't fire anything).
  it('a standalone film renders Shuffle/Repeat AND ⏮/⏭ disabled-but-visible (nothing to shuffle/repeat/skip to)', () => {
    var html = filmQueueViewHtml(standaloneSnap(), null);
    expect(html).toContain('class="qs-hero-title">Toy Story</div>');
    expect(html).toContain('class="qs-hero-sub"></div>');
    expect(html).toMatch(/qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Previous"/);
    expect(html).toMatch(/qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Next"/);
    expect(html).toMatch(/qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Shuffle"/);
    expect(html).toMatch(/qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Repeat"/);
    // Play/pause is never disabled, even with no source.
    expect(html).toContain('class="qs-tbtn qs-tbtn-lg" data-act="toggle" aria-label="Play / pause"');
    // no data-act/data-action leaks through on a disabled button.
    expect(html).not.toMatch(/is-disabled"[^>]*data-act="transport"/);
  });

  it('every row select fires play-item keyed on item_id — no queue/source mutation on tap, including a queued row', () => {
    var html = filmQueueViewHtml(seriesSnap(), 'Bluey');
    expect(html).toContain('data-act="select" data-item="bluey-s1e03"');   // the queued row
    expect(html).toContain('data-act="select" data-item="bluey-s1e02"');
    expect(html).toContain('data-act="select" data-item="bluey-s1e01"');
    expect(html).not.toContain('data-act="queue"');
    expect(html).not.toContain('data-act="play-now"');
  });

  it('Queue + Next rows carry reorder + remove actions', () => {
    var html = filmQueueViewHtml(seriesSnap(), 'Bluey');
    expect(html).toContain('data-act="remove" data-entry="q1"');
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="up"');
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="down"');
  });

  it('disables shift-up on the first row and shift-down on the last', () => {
    var snap = seriesSnap();
    snap.queue.push(entry('bluey-s1e02', 'The Weekend', 'q2', 430));
    var html = filmQueueViewHtml(snap, 'Bluey');
    expect(html).toMatch(/class="qs-act is-disabled" disabled data-act="move" data-entry="q1" data-dir="up"/);
    expect(html).toContain('class="qs-act" data-act="move" data-entry="q1" data-dir="down"');
    expect(html).toMatch(/class="qs-act is-disabled" disabled data-act="move" data-entry="q2" data-dir="down"/);
  });

  it('Coming Up rows carry NO actions and render read-only', () => {
    var html = filmQueueViewHtml(seriesSnap(), 'Bluey');
    expect(html).toContain('class="qs-row qs-readonly">');
    expect(html).toMatch(/qs-readonly">[^]*?data-item="bluey-s1e01"[^]*?<\/button><\/div>/);
    expect(html).not.toMatch(/data-item="bluey-s1e01"[^]*?data-act="remove" data-entry="t1"/);
  });

  it('renders poster art with a fallback glyph and onerror hiding', () => {
    var html = filmQueueViewHtml(seriesSnap(), 'Bluey');
    expect(html).toContain('src="/media/clip.jpg"');
    expect(html).toContain("onerror=\"this.style.display='none'\"");
  });

  it('falls back to the film-clapper glyph for a row with no poster', () => {
    var snap = seriesSnap();
    snap.next[0].poster = null;
    expect(filmQueueViewHtml(snap, 'Bluey')).toContain('&#127916;');
  });

  it('falls back to the film-clapper glyph for the hero art when now_playing has no poster', () => {
    var snap = seriesSnap();
    snap.now_playing.poster = null;
    expect(filmQueueViewHtml(snap, 'Bluey')).toContain('<div class="qs-art">&#127916;</div>');
  });

  it('escapes titles', () => {
    var snap = seriesSnap();
    snap.next[0].title = 'Tom & <Jerry>';
    expect(filmQueueViewHtml(snap, 'Bluey')).toContain('Tom &amp; &lt;Jerry&gt;');
  });

  it('escapes double-quotes and apostrophes in titles too', () => {
    var snap = seriesSnap();
    snap.next[0].title = 'O\'Neil "Live"';
    expect(filmQueueViewHtml(snap, 'Bluey')).toContain('O&#39;Neil &quot;Live&quot;');
  });

  it('escapes the source subtitle', () => {
    expect(filmQueueViewHtml(seriesSnap(), 'Tom & <Jerry>')).toContain('Tom &amp; &lt;Jerry&gt;');
  });

  it('renders a stable shell for an empty snapshot, hero absent, transport disabled (no source)', () => {
    var html = filmQueueViewHtml(null, null);
    expect(html).toContain('Source ends');
    expect(html).not.toContain('qs-hero-title');
  });
});

describe('companionFilmQueueHtml — phone mirror', () => {
  it('renders the hero + Queue / Next / Coming Up tabs, each labelled with its live count', () => {
    var html = companionFilmQueueHtml(seriesSnap(), 'Bluey');
    expect(html).toContain('class="qs-ph-hero"');
    expect(html).toContain('Daddy Putdown');
    expect(html).toContain('data-act="tab" data-tab="queue"');
    expect(html).toContain('>Queue 1</button>');
    expect(html).toContain('>Next 1</button>');
    expect(html).toContain('>Coming Up 1</button>');
    expect(html).toContain('Hammerbarn');
  });

  it('reuses the existing companion row classes (.ph-qrow/.ph-qname/.ph-ract)', () => {
    var html = companionFilmQueueHtml(seriesSnap(), 'Bluey');
    expect(html).toContain('class="ph-qrow"');
    expect(html).toContain('class="ph-qname"');
    expect(html).toContain('ph-ract');
  });

  it('keys per-row edits on entry_id (move/remove), select on item_id', () => {
    var html = companionFilmQueueHtml(seriesSnap(), 'Bluey');
    expect(html).toContain('data-act="select" data-item="bluey-s1e03"');
    expect(html).toContain('data-act="remove" data-entry="q1"');
  });

  it('disables the section-edge shift', () => {
    var snap = seriesSnap();
    snap.next.push(entry('bluey-s1e03', 'Hammerbarn', 's2', 440));
    var html = companionFilmQueueHtml(snap, 'Bluey');
    expect(html).toContain('class="ph-ract is-disabled" disabled data-act="move" data-entry="s1" data-dir="up"');
  });

  it('renders shuffle/repeat as icon-only transport actions, lit from the snapshot, enabled with a source', () => {
    var html = companionFilmQueueHtml(seriesSnap(), 'Bluey');
    expect(html).toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-shuffle"');
    expect(html).toContain('qs-tbtn qs-tbtn-sm on" data-act="transport" data-action="toggle-repeat"');
    expect(html).toContain('data-act="toggle" aria-label="Play / pause"');
  });

  it('a standalone film renders Shuffle/Repeat/⏮/⏭ disabled-but-visible on the companion hero too', () => {
    var html = companionFilmQueueHtml(standaloneSnap(), null);
    expect(html).toMatch(/qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Shuffle"/);
    expect(html).toMatch(/qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Repeat"/);
    expect(html).toMatch(/qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Previous"/);
    expect(html).toMatch(/qs-tbtn qs-tbtn-sm is-disabled" disabled aria-label="Next"/);
  });

  it('shows the end-of-source marker when the source ends (repeat off)', () => {
    expect(companionFilmQueueHtml(standaloneSnap(), null)).toContain('Source ends');
  });

  it('falls back to the film-clapper glyph for the hero art when now_playing has no poster', () => {
    var snap = seriesSnap();
    snap.now_playing.poster = null;
    expect(companionFilmQueueHtml(snap, 'Bluey')).toContain('<div class="qs-art">&#127916;</div>');
  });

  it('falls back to the film-clapper glyph in a row grip with no poster', () => {
    var snap = seriesSnap();
    snap.queue[0].poster = null;
    expect(companionFilmQueueHtml(snap, 'Bluey')).toContain('<span class="grip">&#127916;</span>');
  });

  it('Coming Up rows carry no actions', () => {
    var html = companionFilmQueueHtml(seriesSnap(), 'Bluey');
    expect(html).not.toMatch(/data-item="bluey-s1e01"[^]*?data-act="remove" data-entry="t1"/);
  });

  it('escapes titles', () => {
    var snap = seriesSnap();
    snap.next[0].title = 'Tom & <Jerry>';
    expect(companionFilmQueueHtml(snap, 'Bluey')).toContain('Tom &amp; &lt;Jerry&gt;');
  });

  it('renders a stable shell for an empty snapshot', () => {
    var html = companionFilmQueueHtml(null, null);
    expect(html).toContain('Source ends');
    expect(html).not.toContain('qs-ph-hero');
  });
});

// Fallback branches: null-valued fields (escapeHtml), missing durations.
describe('film-queue-view fallbacks', () => {
  it('escapes a null title as an empty string (no "null" text)', () => {
    var snap = seriesSnap();
    snap.now_playing.title = null;
    var html = filmQueueViewHtml(snap, 'Bluey');
    expect(html).toContain('class="qs-hero-title"></div>');
    expect(html).not.toContain('>null<');
  });

  it('renders an empty duration when an item carries none', () => {
    var snap = seriesSnap();
    snap.next[0].duration = null;
    expect(queueModel(snap, 'Bluey').nextRows[0].durationText).toBe('');
  });
});
