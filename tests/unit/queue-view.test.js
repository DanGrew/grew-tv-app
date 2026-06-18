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

describe('queueModel — shift to_index (within-section reorder)', () => {
  it('clamps up at the head and down at the tail', () => {
    var src = queueModel(shuffleSnap()).sections.find(s => s.key === 'from-source').rows;
    expect(src[0].upIndex).toBe(0);   // head: up is a no-op
    expect(src[0].downIndex).toBe(1);
    expect(src[1].upIndex).toBe(0);
    expect(src[1].downIndex).toBe(1); // tail: down is a no-op
  });
});

describe('queueViewHtml', () => {
  it('emits move actions keyed on entry_id + to_index and a remove per row', () => {
    var html = queueViewHtml(shuffleSnap());
    expect(html).toContain('data-act="move" data-entry="s1" data-to="0"');
    expect(html).toContain('data-act="move" data-entry="s1" data-to="1"');
    expect(html).toContain('data-act="remove" data-entry="s1"');
    expect(html).toContain('data-act="select" data-track="something"');
  });

  it('shows shuffle/repeat status from the snapshot', () => {
    expect(queueViewHtml(shuffleSnap())).toContain('np-pill on">&#128256; Shuffle');
    expect(queueViewHtml(orderedSnap())).not.toContain('np-pill on">&#128256; Shuffle');
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
