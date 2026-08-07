import { describe, it, expect } from 'vitest';
import { currentItem, hasNext, hasPrev, upNextItem, isMulti, entryMode, musicVideosByArtist, compareByTitle, startIndex, playlistTrackTarget } from '../../core/music-video-playthrough.js';

function seq(items, index) { return { items: items, index: index }; }
function mv(id, title) { return { id: id, title: title }; }

describe('currentItem', () => {
  it('is the item at the current index', () => {
    expect(currentItem(seq([mv('a', 'A'), mv('b', 'B')], 1)).id).toBe('b');
  });
  it('defaults the index to 0 when absent', () => {
    expect(currentItem({ items: [mv('a', 'A')] }).id).toBe('a');
  });
  it('is null for an empty seq', () => {
    expect(currentItem(seq([], 0))).toBe(null);
    expect(currentItem(null)).toBe(null);
  });
});

describe('hasNext', () => {
  it('is true before the last item', () => {
    expect(hasNext(seq([mv('a'), mv('b')], 0))).toBe(true);
  });
  it('is false on the last item', () => {
    expect(hasNext(seq([mv('a'), mv('b')], 1))).toBe(false);
  });
  it('is false for a single-item seq', () => {
    expect(hasNext(seq([mv('a')], 0))).toBe(false);
  });
  it('is false for an empty/absent seq', () => {
    expect(hasNext(seq([], 0))).toBe(false);
    expect(hasNext(null)).toBe(false);
  });
});

describe('hasPrev', () => {
  it('is true after the first item', () => {
    expect(hasPrev(seq([mv('a'), mv('b')], 1))).toBe(true);
  });
  it('is false on the first item', () => {
    expect(hasPrev(seq([mv('a'), mv('b')], 0))).toBe(false);
  });
  it('is false for an empty/absent seq', () => {
    expect(hasPrev(seq([], 0))).toBe(false);
    expect(hasPrev(null)).toBe(false);
  });
});

describe('upNextItem', () => {
  it('is the following item mid-playthrough', () => {
    expect(upNextItem(seq([mv('a', 'A'), mv('b', 'B'), mv('c', 'C')], 0)).id).toBe('b');
  });
  it('is null on the last item — no wrap, no repeat', () => {
    expect(upNextItem(seq([mv('a'), mv('b')], 1))).toBe(null);
  });
  it('is null for a single-item seq', () => {
    expect(upNextItem(seq([mv('a')], 0))).toBe(null);
  });
  it('is null for an empty/absent seq', () => {
    expect(upNextItem(seq([], 0))).toBe(null);
    expect(upNextItem(null)).toBe(null);
  });
});

describe('isMulti', () => {
  it('is true for more than one item', () => {
    expect(isMulti(seq([mv('a'), mv('b')], 0))).toBe(true);
  });
  it('is false for exactly one item', () => {
    expect(isMulti(seq([mv('a')], 0))).toBe(false);
  });
  it('is false for an empty/absent seq', () => {
    expect(isMulti(seq([], 0))).toBe(false);
    expect(isMulti(null)).toBe(false);
  });
});

describe('entryMode', () => {
  it('is "queue" when a video Play Queue is requested, over everything else', () => {
    expect(entryMode({ playQueue: true, mvPlaylist: 'pl1', mvArtist: 'ELO', mvItem: 'mv1', isSeries: true })).toBe('queue');
  });
  it('is "mvPlaylist" when a music-video playlist id is given', () => {
    expect(entryMode({ mvPlaylist: 'pl1' })).toBe('mvPlaylist');
  });
  it('is "mvArtist" when a music-video artist is given (and no playlist)', () => {
    expect(entryMode({ mvArtist: 'ELO' })).toBe('mvArtist');
    expect(entryMode({ mvPlaylist: 'pl1', mvArtist: 'ELO' })).toBe('mvPlaylist');
  });
  it('is "mvItem" when a lone music video id is given (and no playlist/artist)', () => {
    expect(entryMode({ mvItem: 'mv1' })).toBe('mvItem');
    expect(entryMode({ mvArtist: 'ELO', mvItem: 'mv1' })).toBe('mvArtist');
  });
  it('is "series" when a series id is flagged (and no music-video param)', () => {
    expect(entryMode({ isSeries: true })).toBe('series');
    expect(entryMode({ mvItem: 'mv1', isSeries: true })).toBe('mvItem');
  });
  it('is "single" for a standalone film — the default with nothing set', () => {
    expect(entryMode({})).toBe('single');
    expect(entryMode(undefined)).toBe('single');
  });
});

describe('musicVideosByArtist', () => {
  const cards = [
    { section: 'music-videos', artist: 'QOTSA', id: 'mv-1', title: 'Song B' },
    { section: 'music-videos', artist: 'QOTSA', id: 'mv-2', title: 'Song A' },
    { section: 'music-videos', artist: 'Muse', id: 'mv-3', title: 'Other Artist' },
    { section: 'music', artist: 'QOTSA', id: 'alb-1', title: 'An Album' },
    { section: 'music-videos', artist: 'QOTSA', id: 'mv-4', title: null }
  ];
  it('filters to the named artist\'s music videos only', () => {
    expect(musicVideosByArtist(cards, 'QOTSA').map(c => c.id)).toEqual(['mv-4', 'mv-2', 'mv-1']);
  });
  it('excludes cards from other sections even for the same artist', () => {
    expect(musicVideosByArtist(cards, 'QOTSA').some(c => c.id === 'alb-1')).toBe(false);
  });
  it('sorts A-Z by title, an untitled item sorting first', () => {
    expect(musicVideosByArtist(cards, 'QOTSA').map(c => c.title)).toEqual([null, 'Song A', 'Song B']);
  });
  it('is empty for an unknown artist or absent cards', () => {
    expect(musicVideosByArtist(cards, 'Nobody')).toEqual([]);
    expect(musicVideosByArtist(null, 'QOTSA')).toEqual([]);
  });
});

// Asserted directly rather than through Array.prototype.sort's own (engine-
// internal, not mutation-stable) comparator-call pattern — see compareByTitle.
describe('compareByTitle', () => {
  it('is negative when a sorts before b', () => {
    expect(compareByTitle({ title: 'Alpha' }, { title: 'Beta' })).toBe(-1);
  });
  it('is positive when a sorts after b', () => {
    expect(compareByTitle({ title: 'Beta' }, { title: 'Alpha' })).toBe(1);
  });
  it('is zero for equal titles', () => {
    expect(compareByTitle({ title: 'Alpha' }, { title: 'Alpha' })).toBe(0);
  });
  it('treats an untitled item as sorting first', () => {
    expect(compareByTitle({ title: null }, { title: 'Alpha' })).toBe(-1);
    expect(compareByTitle({ title: 'Alpha' }, { title: null })).toBe(1);
  });
});

describe('startIndex', () => {
  it('is the position of the item carrying the given id', () => {
    expect(startIndex([mv('a'), mv('b'), mv('c')], 'b')).toBe(1);
  });
  it('is 0 when the id is at the front already', () => {
    expect(startIndex([mv('a'), mv('b')], 'a')).toBe(0);
  });
  it('is the last position for the last id', () => {
    expect(startIndex([mv('a'), mv('b'), mv('c')], 'c')).toBe(2);
  });
  it('is 0 when no id is given (no tapped track — start from the top)', () => {
    expect(startIndex([mv('a'), mv('b')], undefined)).toBe(0);
  });
  it('is 0 when the given id is not in the list', () => {
    expect(startIndex([mv('a'), mv('b')], 'nope')).toBe(0);
  });
  it('is 0 for an empty or absent list', () => {
    expect(startIndex([], 'a')).toBe(0);
    expect(startIndex(null, 'a')).toBe(0);
  });
});

describe('playlistTrackTarget', () => {
  var audioTarget = { page: 'audio.html', params: { playlist: 'pl-1', track: 'trk-1', from: 'detail-playlist' } };

  it('sends a music-video item to the video player, not the audio target', () => {
    var item = { video: { id: 'mv-1', itemType: 'music-video' } };
    expect(playlistTrackTarget(item, 'pl-1', audioTarget)).toEqual({
      page: 'video.html',
      params: { musicVideoPlaylist: 'pl-1', musicVideoTrack: 'mv-1', from: 'detail-playlist' }
    });
  });

  it('passes a track item straight through to the given audio target unchanged', () => {
    var item = { video: { id: 'trk-1', itemType: 'track' } };
    expect(playlistTrackTarget(item, 'pl-1', audioTarget)).toBe(audioTarget);
  });
});
