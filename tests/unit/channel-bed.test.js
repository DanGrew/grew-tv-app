import { bedTracks, bedTotal, bedAt, bedCredit, bedSrcName } from '../../core/channel-bed.js';

// FEAT-560/TASK-565 — the music bed under a channel's cards and its dead air.
//
// ⚠️ THE ONE THING WORTH PROVING: the bed runs on its own wall clock and is
// never restarted per card (decision 13). Start it at zero each time and you
// hear the first eight seconds of the same track forever, which is the jingle
// problem in disguise — and it is invisible in a screenshot, so it has to be
// caught here. Story 4 is the observable half: two cards in a row, and the
// second carries on where the album has got to.

function track(id, title, duration, artist) {
  return { id: id, title: title, profile: 'kids', duration: duration,
           mediaType: 'audio', ext: 'm4a', artist: artist };
}

// The fixture album, as /api/album serves it: items wrapping a video record.
const ALBUM = {
  id: 'ootb', title: 'Out of the Blue', artist: 'ELO',
  items: [
    { episode: 1, video: track('ootb-01', 'Turn to Stone', 227, 'ELO') },
    { episode: 2, video: track('ootb-02', 'Mr. Blue Sky', 245, 'ELO') },
    { episode: 3, video: track('ootb-03', 'Sweet Talkin Woman', 228, 'ELO') }
  ]
};
const TRACKS = bedTracks(ALBUM);
const TOTAL = 227 + 245 + 228;

describe('bedTracks', () => {
  it('reads the album into what a clock can walk', () => {
    expect(TRACKS).toEqual([
      { id: 'ootb-01', title: 'Turn to Stone',       artist: 'ELO', ext: 'm4a', duration: 227 },
      { id: 'ootb-02', title: 'Mr. Blue Sky',        artist: 'ELO', ext: 'm4a', duration: 245 },
      { id: 'ootb-03', title: 'Sweet Talkin Woman',  artist: 'ELO', ext: 'm4a', duration: 228 }
    ]);
  });

  it('drops a track the clock could not PLACE', () => {
    // A made-up duration would put every later track at the wrong time for as
    // long as the album loops, so a track with no stated length leaves.
    const missing = { items: [{ video: track('a', 'A', null) }, { video: track('b', 'B', 200) }] };
    expect(bedTracks(missing).map(t => t.id)).toEqual(['b']);
    expect(bedTracks({ items: [{ video: track('a', 'A', 0) }] })).toEqual([]);
    expect(bedTracks({ items: [{ video: track('a', 'A', -5) }] })).toEqual([]);
  });

  it('drops a track the player could not FETCH', () => {
    const noExt = { items: [{ video: Object.assign(track('a', 'A', 200), { ext: null }) }] };
    const noId = { items: [{ video: Object.assign(track('a', 'A', 200), { id: null }) }] };
    expect(bedTracks(noExt)).toEqual([]);
    expect(bedTracks(noId)).toEqual([]);
  });

  it('is empty for an album that is not one, rather than throwing', () => {
    expect(bedTracks({ items: [] })).toEqual([]);
    expect(bedTracks({ items: [null, {}] })).toEqual([]);
    expect(bedTracks({})).toEqual([]);
    expect(bedTracks(null)).toEqual([]);
  });
});

describe('bedTotal', () => {
  it('is one pass through the album', () => {
    expect(bedTotal(TRACKS)).toBe(TOTAL);
  });

  it('is zero with nothing to play', () => {
    expect(bedTotal([])).toBe(0);
    expect(bedTotal(null)).toBe(0);
  });
});

describe('bedAt — the wall clock', () => {
  it('lands inside the first track at the top of the loop', () => {
    expect(bedAt(TRACKS, 0)).toEqual({ track: TRACKS[0], offset: 0 });
    expect(bedAt(TRACKS, 100)).toEqual({ track: TRACKS[0], offset: 100 });
  });

  it('crosses into the next track exactly when the previous one ends', () => {
    expect(bedAt(TRACKS, 226.5).track.id).toBe('ootb-01');
    expect(bedAt(TRACKS, 227)).toEqual({ track: TRACKS[1], offset: 0 });
    expect(bedAt(TRACKS, 300)).toEqual({ track: TRACKS[1], offset: 73 });
    expect(bedAt(TRACKS, 227 + 245)).toEqual({ track: TRACKS[2], offset: 0 });
  });

  it('LOOPS rather than running out', () => {
    // Dead air can outlast the album — a bed that ended would leave the card
    // silent for the rest of an off-air night.
    expect(bedAt(TRACKS, TOTAL)).toEqual({ track: TRACKS[0], offset: 0 });
    expect(bedAt(TRACKS, TOTAL + 100)).toEqual({ track: TRACKS[0], offset: 100 });
    expect(bedAt(TRACKS, TOTAL * 9 + 300)).toEqual({ track: TRACKS[1], offset: 73 });
  });

  it('⚠️ NEVER answers the start of the album twice in a row for two cards', () => {
    // THE bug this module exists to prevent. Two cards eight minutes apart are
    // eight minutes apart in the album — not two plays of the same opening.
    const first = bedAt(TRACKS, 1_757_000_000);
    const second = bedAt(TRACKS, 1_757_000_000 + 480);
    expect(second).not.toEqual(first);
    expect([second.track.id, second.offset]).not.toEqual(['ootb-01', 0]);
  });

  it('advances by exactly the real time that passed', () => {
    // Inside one track, the offset moves by the elapsed seconds and nothing
    // else — the bed is not paused by a card ending, it is only stopped being
    // listened to.
    expect(bedAt(TRACKS, 100).offset).toBe(100);
    expect(bedAt(TRACKS, 108).offset).toBe(108);
  });

  it('gives every caller the same answer at the same moment', () => {
    // What makes this survive a page reload, a channel flip and a second
    // television: nothing is handed between callers, they all ask the clock.
    expect(bedAt(TRACKS, 12345)).toEqual(bedAt(bedTracks(ALBUM), 12345));
  });

  it('is silence when there is nothing to play', () => {
    // A channel may name no album at all, and that is legal.
    expect(bedAt([], 100)).toBe(null);
    expect(bedAt(null, 100)).toBe(null);
  });

  it('is silence rather than a throw for a clock that is not a number', () => {
    expect(bedAt(TRACKS, NaN)).toBe(null);
    expect(bedAt(TRACKS, Infinity)).toBe(null);
    expect(bedAt(TRACKS, 'soon')).toBe(null);
  });

  it('folds a negative clock back into the loop instead of falling silent', () => {
    expect(bedAt(TRACKS, -100)).toEqual({ track: TRACKS[2], offset: 228 - 100 });
  });
});

describe('bedCredit', () => {
  it('answers "what is this song"', () => {
    expect(bedCredit(TRACKS[1])).toBe('Mr. Blue Sky · ELO');
  });

  it('is the title alone when the track names no artist', () => {
    // Half the credit still answers the question; a trailing separator with
    // nothing after it just looks broken.
    expect(bedCredit({ title: 'Mr. Blue Sky' })).toBe('Mr. Blue Sky');
    expect(bedCredit({ title: 'Mr. Blue Sky', artist: '' })).toBe('Mr. Blue Sky');
  });

  it('is nothing to credit with no track', () => {
    expect(bedCredit({ artist: 'ELO' })).toBe(null);
    expect(bedCredit({})).toBe(null);
    expect(bedCredit(null)).toBe(null);
  });
});

describe('bedSrcName', () => {
  it('builds the name off the track\'s OWN extension', () => {
    // A hardcoded .mp3/.m4a guess 404s on a library that keeps what it ingested.
    expect(bedSrcName(TRACKS[0])).toBe('ootb-01.m4a');
    expect(bedSrcName({ id: 'x', ext: 'flac' })).toBe('x.flac');
  });

  it('is null rather than a broken URL when there is nothing to fetch', () => {
    expect(bedSrcName({ id: 'x' })).toBe(null);
    expect(bedSrcName({ ext: 'm4a' })).toBe(null);
    expect(bedSrcName(null)).toBe(null);
  });
});
