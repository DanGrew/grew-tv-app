import { describe, it, expect } from 'vitest';
import { currentItem, hasNext, hasPrev, upNextItem, isMulti, entryMode, musicVideosByArtist, compareByTitle, startIndex, playlistTrackTarget, initSeq, fairShuffle, toggleShuffle, toggleRepeat, canAdvance, nextSeq, mvTransportVisibility } from '../../core/music-video-playthrough.js';

function seq(items, index) { return { items: items, index: index }; }
function mv(id, title) { return { id: id, title: title }; }
// A fixed-value rng (not the queue-style Math.random signature — fairShuffle
// calls it once per swap) so every shuffle in a test is pinned and repeatable.
function fixedRng(value) { return function() { return value; }; }

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

describe('initSeq', () => {
  it('carries the given items/index and captures order from items, shuffle/repeat off', () => {
    expect(initSeq([mv('a'), mv('b')], 1)).toEqual({
      items: [mv('a'), mv('b')], index: 1, order: [mv('a'), mv('b')], shuffle: false, repeat: false
    });
  });
});

describe('fairShuffle', () => {
  it('is a permutation of the input — same elements, none dropped or duplicated', () => {
    var result = fairShuffle(['a', 'b', 'c', 'd'], fixedRng(0.5));
    expect(result.slice().sort()).toEqual(['a', 'b', 'c', 'd']);
  });
  it('does not mutate the input array', () => {
    var input = ['a', 'b', 'c'];
    fairShuffle(input, fixedRng(0));
    expect(input).toEqual(['a', 'b', 'c']);
  });
  it('is deterministic for a fixed rng — an rng of 0 rotates every element left one place', () => {
    expect(fairShuffle(['a', 'b', 'c', 'd'], fixedRng(0))).toEqual(['b', 'c', 'd', 'a']);
  });
  it('never swaps past the array bounds — an rng just under 1 leaves every element in place', () => {
    expect(fairShuffle(['a', 'b', 'c', 'd'], fixedRng(0.999))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('is a no-op for a single-item or empty array', () => {
    expect(fairShuffle(['a'], fixedRng(0))).toEqual(['a']);
    expect(fairShuffle([], fixedRng(0))).toEqual([]);
  });
  it('defaults to Math.random when no rng is given', () => {
    expect(fairShuffle(['a', 'b', 'c']).sort()).toEqual(['a', 'b', 'c']);
  });
  it('calls rng exactly n-1 times for an n-element array — no unnecessary trailing swap at index 0', () => {
    var calls = 0;
    fairShuffle(['a', 'b', 'c', 'd'], function() { calls += 1; return 0; });
    expect(calls).toBe(3);
  });
});

describe('toggleShuffle', () => {
  it('turning ON anchors the current item first, then a fresh shuffle of the rest, index reset to 0', () => {
    var s = initSeq(['a', 'b', 'c', 'd'], 1); // current = 'b'
    var result = toggleShuffle(s, fixedRng(0));
    expect(result.shuffle).toBe(true);
    expect(result.items[0]).toBe('b');
    expect(result.items.slice(1).sort()).toEqual(['a', 'c', 'd']);
    expect(result.index).toBe(0);
    expect(result.order).toEqual(['a', 'b', 'c', 'd']);
  });
  it('turning OFF re-anchors to the base order at the playing item\'s own position', () => {
    var shuffled = { items: ['b', 'c', 'd', 'a'], index: 0, order: ['a', 'b', 'c', 'd'], shuffle: true, repeat: false };
    var result = toggleShuffle(shuffled);
    expect(result.shuffle).toBe(false);
    expect(result.items).toEqual(['a', 'b', 'c', 'd']);
    expect(result.index).toBe(1); // 'b' sits at index 1 in the base order
  });
  it('falls back to 0 when the current item is not found in the base order', () => {
    var s = { items: ['x'], index: 0, order: ['a', 'b'], shuffle: true, repeat: false };
    expect(toggleShuffle(s).index).toBe(0);
  });
  it('falls back to itemsOf when order is absent', () => {
    var s = { items: ['a', 'b'], index: 0, shuffle: false, repeat: false };
    var result = toggleShuffle(s, fixedRng(0));
    expect(result.items[0]).toBe('a');
    expect(result.items.slice(1)).toEqual(['b']);
  });
  it('leaves repeat and other fields untouched', () => {
    var s = initSeq(['a', 'b'], 0);
    s.repeat = true;
    expect(toggleShuffle(s, fixedRng(0)).repeat).toBe(true);
  });
  it('is null for a null seq', () => {
    expect(toggleShuffle(null)).toBe(null);
  });
});

describe('toggleRepeat', () => {
  it('flips repeat on', () => {
    var s = initSeq(['a', 'b'], 0);
    expect(toggleRepeat(s).repeat).toBe(true);
  });
  it('flips repeat off', () => {
    var s = initSeq(['a', 'b'], 0);
    s.repeat = true;
    expect(toggleRepeat(s).repeat).toBe(false);
  });
  it('leaves items/index/shuffle/order untouched', () => {
    var s = initSeq(['a', 'b'], 1);
    var result = toggleRepeat(s);
    expect(result.items).toEqual(['a', 'b']);
    expect(result.index).toBe(1);
    expect(result.shuffle).toBe(false);
    expect(result.order).toEqual(['a', 'b']);
  });
  it('is null for a null seq', () => {
    expect(toggleRepeat(null)).toBe(null);
  });
});

describe('canAdvance', () => {
  it('is true before the last item, repeat off', () => {
    expect(canAdvance(seq([mv('a'), mv('b')], 0))).toBe(true);
  });
  it('is false on the last item, repeat off', () => {
    expect(canAdvance({ items: [mv('a'), mv('b')], index: 1, repeat: false })).toBe(false);
  });
  it('is true on the last item when repeat is on and there is more than one item', () => {
    expect(canAdvance({ items: [mv('a'), mv('b')], index: 1, repeat: true })).toBe(true);
  });
  it('is false on a single-item seq even with repeat on — nothing to wrap to', () => {
    expect(canAdvance({ items: [mv('a')], index: 0, repeat: true })).toBe(false);
  });
  it('is false for an empty/absent seq', () => {
    expect(canAdvance(seq([], 0))).toBe(false);
    expect(canAdvance(null)).toBe(false);
  });
});

describe('nextSeq', () => {
  it('advances the index when a later item exists in the current pass', () => {
    var s = initSeq(['a', 'b', 'c'], 0);
    var result = nextSeq(s);
    expect(result.index).toBe(1);
    expect(result.items).toEqual(['a', 'b', 'c']);
  });
  it('is unchanged at the last item when repeat is off', () => {
    var s = initSeq(['a', 'b'], 1);
    expect(nextSeq(s)).toBe(s);
  });
  it('wraps to index 0 of the base order at the last item when repeat is on and shuffle is off', () => {
    var s = { items: ['a', 'b', 'c'], index: 2, order: ['a', 'b', 'c'], shuffle: false, repeat: true };
    var result = nextSeq(s);
    expect(result.index).toBe(0);
    expect(result.items).toEqual(['a', 'b', 'c']);
  });
  it('wraps to a freshly-shuffled pass at the last item when repeat and shuffle are both on', () => {
    var s = { items: ['c', 'a', 'b'], index: 2, order: ['a', 'b', 'c'], shuffle: true, repeat: true };
    var result = nextSeq(s, fixedRng(0));
    expect(result.index).toBe(0);
    expect(result.items).toEqual(fairShuffle(['a', 'b', 'c'], fixedRng(0)));
  });
  it('is unchanged for a single-item seq even with repeat on', () => {
    var s = { items: ['a'], index: 0, order: ['a'], shuffle: false, repeat: true };
    expect(nextSeq(s)).toBe(s);
  });
});

describe('mvTransportVisibility', () => {
  it('hides both for a non-music-video, single-item source', () => {
    expect(mvTransportVisibility(false, false)).toEqual({ shuffle: false, repeat: true });
  });
  it('shows only Repeat for a non-music-video multi-item source (a series)', () => {
    expect(mvTransportVisibility(false, true)).toEqual({ shuffle: false, repeat: true });
  });
  it('hides both for a lone music-video pick — nothing to shuffle or repeat', () => {
    expect(mvTransportVisibility(true, false)).toEqual({ shuffle: false, repeat: false });
  });
  it('shows both for a multi-item music-video playthrough', () => {
    expect(mvTransportVisibility(true, true)).toEqual({ shuffle: true, repeat: true });
  });
});
