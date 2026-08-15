import { queueModel, queueViewHtml, companionQueueHtml } from '../../core/music-video-queue-view.js';

function entry(id, title, eid, dur, artist, poster) {
  return { video_id: id, title: title, artist: artist == null ? 'QOTSA' : artist, entry_id: eid, duration: dur, poster: poster == null ? 'mv.jpg' : poster };
}

// shuffle source, a queued override item, remaining permutation, next permutation.
function shuffleSnap() {
  return {
    now_playing: { video_id: 'head-like', title: 'Head Like a Haunted House', artist: 'QOTSA', poster: 'mv-01.jpg', duration: 210 },
    play_next: [entry('no-one-knows', 'No One Knows', 'q1', 195)],
    from_source: [entry('go-with-the-flow', 'Go With the Flow', 's1', 183), entry('gonna-leave-you', 'Gonna Leave You', 's2', 207)],
    then: [entry('a-song-for-the-dead', 'A Song for the Dead', 't1', 209)],
    shuffle: true, repeat: false, source_type: 'mv-artist', source_id: 'QOTSA'
  };
}

// ordered, repeat off, no override -> THEN is empty -> "Source ends".
function orderedSnap() {
  return {
    now_playing: { video_id: 'go-with-the-flow', title: 'Go With the Flow', artist: 'QOTSA', poster: 'mv.jpg', duration: 183 },
    play_next: [],
    from_source: [entry('a-song-for-the-dead', 'A Song for the Dead', 's1', 209), entry('gonna-leave-you', 'Gonna Leave You', 's2', 207)],
    then: [],
    shuffle: false, repeat: false, source_type: 'mv-artist', source_id: 'QOTSA'
  };
}

describe('queueModel — bucketing', () => {
  it('puts each video in the right section', () => {
    var m = queueModel(shuffleSnap());
    expect(m.nowPlaying.videoId).toBe('head-like');
    var byKey = {};
    m.sections.forEach(s => { byKey[s.key] = s; });
    expect(byKey['play-next'].rows.map(r => r.videoId)).toEqual(['no-one-knows']);
    expect(byKey['from-source'].rows.map(r => r.videoId)).toEqual(['go-with-the-flow', 'gonna-leave-you']);
    expect(byKey['then'].rows.map(r => r.videoId)).toEqual(['a-song-for-the-dead']);
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

  it('carries poster art on every row', () => {
    var m = queueModel(shuffleSnap());
    var posters = m.sections.flatMap(s => s.rows.map(r => r.poster));
    expect(posters).toEqual(['mv.jpg', 'mv.jpg', 'mv.jpg', 'mv.jpg']);
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

  it('labels the sections (Play Next / From Source / Then), even though the tab is the visible label', () => {
    var byKey = {};
    queueModel(shuffleSnap()).sections.forEach(s => { byKey[s.key] = s; });
    expect(byKey['play-next'].label).toBe('Play Next');
    expect(byKey['from-source'].label).toBe('From Source');
    expect(byKey['then'].label).toBe('Then');
  });

  it('the THEN section keeps its Then label and an empty hint when it ends the source', () => {
    var then = queueModel(orderedSnap()).sections.find(s => s.key === 'then');
    expect(then.label).toBe('Then');
    expect(then.hint).toBe('');
  });
});

describe('queueViewHtml', () => {
  it('lays the sections out as Queue / Next / Coming Up tabs', () => {
    var html = queueViewHtml(shuffleSnap());
    ['queue', 'next', 'coming-up'].forEach(function (t) {
      expect(html).toContain('data-act="tab" data-tab="' + t + '"');
    });
    expect(html).toContain('>Queue</button>');
    expect(html).toContain('>Next</button>');
    expect(html).toContain('>Coming Up</button>');
  });

  it('opens on Queue when videos are queued, on Next when none are', () => {
    expect(queueViewHtml(shuffleSnap())).toContain('class="qtab active" data-act="tab" data-tab="queue"');
    var ordered = queueViewHtml(orderedSnap());
    expect(ordered).toContain('class="qtab active" data-act="tab" data-tab="next"');
    expect(ordered).toContain('Source ends');
  });

  it('shows the empty-queue placeholder under the Queue tab when nothing is queued', () => {
    var html = queueViewHtml(orderedSnap());
    expect(html).toContain('class="q-empty"');
    expect(html).toMatch(/Nothing queued/);
  });

  it('emits per-row shift up/down (direction) + remove keyed on entry_id, and select keyed on video_id', () => {
    var html = queueViewHtml(shuffleSnap());
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="up"');
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="down"');
    expect(html).toContain('data-act="remove" data-entry="s1"');
    expect(html).toContain('data-act="select" data-video="go-with-the-flow" data-entry="s1"');
    expect(html).not.toContain('data-to=');
  });

  it('renders the standard cross (✕) on the remove button, not the boxed-plus', () => {
    var html = queueViewHtml(shuffleSnap());
    expect(html).toContain('data-act="remove" data-entry="s1" title="Remove" aria-label="Remove">&#10005;</button>');
    expect(html).not.toContain('&#8862;');
  });

  it('disables shift-up on the first row and shift-down on the last (no swap with now-playing / off-section)', () => {
    var src = queueModel(shuffleSnap()).sections.find(s => s.key === 'from-source').rows;
    expect(src[0].canUp).toBe(false);
    expect(src[0].canDown).toBe(true);
    expect(src[src.length - 1].canDown).toBe(false);
    var html = queueViewHtml(shuffleSnap());
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

  it('renders poster art in the row grip, with a fallback glyph and onerror hiding', () => {
    var html = queueViewHtml(shuffleSnap());
    expect(html).toContain('src="/media/mv.jpg"');
    expect(html).toContain("onerror=\"this.style.display='none'\"");
  });

  it('falls back to the video-camera glyph for a row with no poster', () => {
    var snap = shuffleSnap();
    snap.from_source[0].poster = null;
    var html = queueViewHtml(snap);
    expect(html).toContain('&#127916;');
  });

  it('shows the queued grip glyph for a Play Next row with no poster', () => {
    var snap = shuffleSnap();
    snap.play_next[0].poster = null;
    var html = queueViewHtml(snap);
    expect(html).toContain('&#10239;');
  });

  it('renders the now-playing poster too, falling back to the glyph when absent', () => {
    expect(queueViewHtml(shuffleSnap())).toContain('src="/media/mv-01.jpg"');
    var snap = shuffleSnap();
    snap.now_playing.poster = null;
    expect(queueViewHtml(snap)).toContain('<div class="np-art">&#127916;</div>');
  });

  it('shows the now-playing artist', () => {
    expect(queueViewHtml(shuffleSnap())).toContain('class="np-artist">QOTSA</div>');
  });

  it('escapes video titles', () => {
    var snap = shuffleSnap();
    snap.play_next[0].title = 'Tom & <Jerry>';
    expect(queueViewHtml(snap)).toContain('Tom &amp; &lt;Jerry&gt;');
  });

  it('escapes double-quotes and apostrophes in titles too', () => {
    var snap = shuffleSnap();
    snap.play_next[0].title = 'O\'Neil "Live"';
    expect(queueViewHtml(snap)).toContain('O&#39;Neil &quot;Live&quot;');
  });

  it('renders a stable shell for an empty snapshot', () => {
    var html = queueViewHtml(null);
    expect(html).toContain('Source ends');
    expect(html).not.toContain('now-playing');
  });
});

describe('companionQueueHtml — phone mirror', () => {
  it('renders now-playing + the Queue / Next / Coming Up tabs from the snapshot', () => {
    var html = companionQueueHtml(shuffleSnap());
    expect(html).toContain('class="ph-np"');
    expect(html).toContain('Head Like a Haunted House');
    expect(html).toContain('data-act="tab" data-tab="queue"');
    expect(html).toContain('data-act="tab" data-tab="next"');
    expect(html).toContain('data-act="tab" data-tab="coming-up"');
    expect(html).toContain('>Queue</button>');
    expect(html).toContain('>Next</button>');
    expect(html).toContain('>Coming Up</button>');
    expect(html).toContain('No One Knows');
  });

  it('shows the now-playing artist', () => {
    expect(companionQueueHtml(shuffleSnap())).toContain('<div class="by">QOTSA</div>');
  });

  it('keys per-row edits on entry_id (select/move/remove) like the TV overlay, select on video_id', () => {
    var html = companionQueueHtml(shuffleSnap());
    expect(html).toContain('data-act="select" data-video="no-one-knows" data-entry="q1"');
    expect(html).toContain('data-act="move" data-entry="q1" data-dir="down"');
    expect(html).toContain('data-act="remove" data-entry="q1"');
  });

  it('flags the queued (PLAY NEXT) row and disables the section-edge shift', () => {
    var html = companionQueueHtml(shuffleSnap());
    expect(html).toContain('class="ph-qrow queued"');
    expect(html).toContain('class="ph-ract is-disabled" disabled data-act="move" data-entry="q1" data-dir="up"');
  });

  it('shows duration (not artist) in the row, mirroring the video companion row', () => {
    var html = companionQueueHtml(shuffleSnap());
    expect(html).toContain('No One Knows <span class="by">&middot; 3:15</span>');
  });

  it('renders shuffle/repeat as transport actions, lit from the snapshot', () => {
    var html = companionQueueHtml(shuffleSnap());
    expect(html).toContain('data-act="transport" data-action="toggle-shuffle"');
    expect(html).toContain('data-act="transport" data-action="toggle-repeat"');
    expect(html).toContain('ph-tbtn on" data-act="transport" data-action="toggle-shuffle"');
    expect(html).toContain('data-act="toggle"');
  });

  it('shows the end-of-source marker when THEN is empty (ordered + repeat off)', () => {
    var html = companionQueueHtml(orderedSnap());
    expect(html).toContain('Source ends');
  });

  it('escapes video titles', () => {
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

// Fallback branches: null-valued fields (escapeHtml), missing durations
// (durationText), and the ORDERED (non-shuffle) THEN hint.
describe('music-video-queue-view fallbacks', () => {
  it('escapes null title/artist fields as empty strings (no "null" text)', () => {
    var snap = shuffleSnap();
    snap.now_playing.title = null;
    snap.now_playing.artist = null;
    var html = queueViewHtml(snap);
    expect(html).toContain('class="np-title"></div>');
    expect(html).toContain('class="np-artist"></div>');
    expect(html).not.toContain('>null<');
  });

  it('renders an empty duration when a video carries none', () => {
    var snap = shuffleSnap();
    snap.from_source[0].duration = null;
    var m = queueModel(snap);
    var src = m.sections.find(s => s.key === 'from-source');
    expect(src.rows[0].durationText).toBe('');
  });

  it('renders an empty now-playing duration when absent', () => {
    var snap = shuffleSnap();
    snap.now_playing.duration = null;
    expect(queueModel(snap).nowPlaying.durationText).toBe('');
  });

  it('has no now-playing position field at all (a music video never resumes/scrubs)', () => {
    var m = queueModel(shuffleSnap());
    expect(m.nowPlaying.position).toBeUndefined();
    expect(queueViewHtml(shuffleSnap())).not.toContain('np-time"> /');
  });

  it('uses the ordered (non-shuffle) THEN hint when the source continues in order', () => {
    var snap = orderedSnap();
    snap.then = [entry('a-song-for-the-dead', 'A Song for the Dead', 't1', 209)];
    var then = queueModel(snap).sections.find(s => s.key === 'then');
    expect(then.hint).toBe('repeat from the top · also editable');
    expect(queueViewHtml(snap)).toContain('repeat from the top');
  });

  it('uses the ordered (non-shuffle) FROM SOURCE hint when not shuffled', () => {
    expect(queueViewHtml(orderedSnap())).toContain('in order · reorder / remove individual videos');
  });

  it('shows the queued grip glyph (not the video-camera one) on a companion Play Next row with no poster', () => {
    var snap = shuffleSnap();
    snap.play_next[0].poster = null;
    var html = companionQueueHtml(snap);
    expect(html).toContain('<span class="grip">&#10239;</span>');
    expect(html).not.toContain('<span class="grip">&#127916;</span><span class="nm">No One Knows');
  });
});
