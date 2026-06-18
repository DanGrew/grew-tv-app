import { queueModel, queueViewHtml } from '../../core/queue-view.js';

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
  it('emits per-row shift up/down (direction) + remove keyed on entry_id', () => {
    var html = queueViewHtml(shuffleSnap());
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="up"');
    expect(html).toContain('data-act="move" data-entry="s1" data-dir="down"');
    expect(html).toContain('data-act="remove" data-entry="s1"');
    expect(html).toContain('data-act="select" data-track="something"');
    expect(html).not.toContain('data-to=');   // no absolute index (was the bug)
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
