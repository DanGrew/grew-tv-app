import { videoItems, musicItems, rankSearch, searchResultsHtml } from '../../core/search-rank.js';

// FEAT-048 (TASK-324) — the search overlay's pure core. Videos come from browse
// cards; Music mixes /api/tracks tracks with albums + artists derived from the
// same cards. Ranking is exact > prefix > substring, field priority breaking
// ties, then A-Z title; non-matches excluded.

var CARDS = [
  { kind: 'video',  id: 'toy-story-main', title: 'Toy Story',    poster: 'toy.jpg',   section: 'films',       genres: ['animation', 'comedy'], tags: { year: '1995' } },
  { kind: 'video',  id: 'blue-planet',    title: 'Blue Planet',  poster: 'bp.jpg',    section: 'films',       genres: null,                    tags: { year: '2001' } },
  { kind: 'series', id: 'bluey',          title: 'Bluey',        poster: 'bluey.jpg', section: 'series',       genres: ['animation'],           tags: null },
  { kind: 'video',  id: 'millie-walk',    title: 'Millie Walk',  poster: 'm.jpg',     section: 'home-movies', genres: null,                    tags: null },
  { kind: 'series', id: 'ootb',           title: 'Out of the Blue', poster: 'ootb.jpg', section: 'music', artist: 'ELO',  clipCount: 3 },
  { kind: 'series', id: 'abba-arrival',   title: 'Arrival',      poster: 'arr.jpg',   section: 'music', artist: 'ABBA', clipCount: 2 },
  { kind: 'series', id: 'pl-mix',         title: 'My Mix',       poster: null,        section: 'music', collectionType: 'playlist' }
];

var TRACKS = [
  { id: 'ootb-02', title: 'Mr. Blue Sky',  album: 'Out of the Blue', artist: 'ELO',  album_id: 'ootb',        cover: 'ootb.jpg' },
  { id: 'dq',      title: 'Dancing Queen', album: 'Arrival',         artist: 'ABBA', album_id: 'abba-arrival', cover: 'arr.jpg' }
];

describe('videoItems', () => {
  it('includes every non-music card, excludes music (albums + playlists)', () => {
    var ids = videoItems(CARDS).map(function(i) { return i.card.id; });
    expect(ids).toEqual(['toy-story-main', 'blue-planet', 'bluey', 'millie-walk']);
  });
  it('tags FILM / SERIES / HOME by section+kind', () => {
    var byId = {};
    videoItems(CARDS).forEach(function(i) { byId[i.card.id] = i.tag; });
    expect(byId['toy-story-main']).toBe('FILM');
    expect(byId['bluey']).toBe('SERIES');
    expect(byId['millie-walk']).toBe('HOME');
  });
  it('secondary is the first genre (title-cased) else the year', () => {
    var byId = {};
    videoItems(CARDS).forEach(function(i) { byId[i.card.id] = i.secondary; });
    expect(byId['toy-story-main']).toBe('Animation'); // genre wins over year
    expect(byId['blue-planet']).toBe('2001');         // no genre -> year
    expect(byId['millie-walk']).toBe('');             // neither
  });
  it('carries the raw browse card and its poster/title for routing + render', () => {
    var toy = videoItems(CARDS)[0];
    expect(toy.title).toBe('Toy Story');
    expect(toy.poster).toBe('toy.jpg');
    expect(toy.card).toBe(CARDS[0]);
    expect(toy.fields).toEqual(['Toy Story']);
  });
  it('tolerates missing input', () => {
    expect(videoItems(null)).toEqual([]);
  });
  it('fills blank defaults for a sparse card (no section/title/poster/genre/year)', () => {
    var items = videoItems([{ id: 'bare' }]);
    expect(items).toHaveLength(1); // no section -> defaults to films (non-music) -> a FILM
    expect(items[0]).toMatchObject({ title: '', poster: null, secondary: '', tag: 'FILM', fields: [''] });
  });
});

describe('musicItems', () => {
  it('mixes tracks, albums and artists, each with its own tag', () => {
    var items = musicItems(TRACKS, CARDS);
    var tags = items.map(function(i) { return i.tag; });
    expect(tags.filter(function(t) { return t === 'TRACK'; }).length).toBe(2);
    expect(tags.filter(function(t) { return t === 'ALBUM'; }).length).toBe(2); // ootb + arrival, NOT the playlist
    expect(tags.filter(function(t) { return t === 'ARTIST'; }).length).toBe(2); // ELO + ABBA
  });
  it('a TRACK routes to its album (card id = album_id, section music)', () => {
    var track = musicItems(TRACKS, CARDS)[0];
    expect(track.title).toBe('Mr. Blue Sky');
    expect(track.tag).toBe('TRACK');
    expect(track.secondary).toBe('ELO · Out of the Blue');
    expect(track.card).toEqual({ kind: 'series', id: 'ootb', section: 'music' });
    expect(track.fields).toEqual(['Mr. Blue Sky', 'Out of the Blue', 'ELO']);
  });
  it('an ALBUM item carries the browse card + artist secondary, never the playlist', () => {
    var albums = musicItems(TRACKS, CARDS).filter(function(i) { return i.tag === 'ALBUM'; });
    var ids = albums.map(function(a) { return a.card.id; });
    expect(ids).toContain('ootb');
    expect(ids).not.toContain('pl-mix');
    var ootb = albums.filter(function(a) { return a.card.id === 'ootb'; })[0];
    expect(ootb.secondary).toBe('ELO');
    expect(ootb.fields).toEqual(['Out of the Blue', 'ELO']);
  });
  it('an ARTIST item routes to the artist page (kind artist)', () => {
    var artist = musicItems(TRACKS, CARDS).filter(function(i) { return i.tag === 'ARTIST' && i.title === 'ELO'; })[0];
    expect(artist.card.kind).toBe('artist');
    expect(artist.card.artist).toBe('ELO');
    expect(artist.fields).toEqual(['ELO']);
  });
  it('fills blank defaults for a sparse track and a sparse album card', () => {
    var track = musicItems([{ album_id: 'a1' }], [])[0];
    expect(track).toMatchObject({ title: '', poster: null, secondary: '', tag: 'TRACK', fields: ['', '', ''] });
    expect(track.card).toEqual({ kind: 'series', id: 'a1', section: 'music' });
    var album = musicItems([], [{ id: 'a1', section: 'music' }]).filter(function(i) { return i.tag === 'ALBUM'; })[0];
    expect(album).toMatchObject({ title: '', poster: null, secondary: '', fields: ['', ''] });
  });
  it('tolerates missing inputs', () => {
    expect(musicItems(null, null)).toEqual([]);
  });
});

describe('rankSearch', () => {
  it('excludes non-matches and returns nothing for a blank query', () => {
    expect(rankSearch('', videoItems(CARDS))).toEqual([]);
    expect(rankSearch('   ', videoItems(CARDS))).toEqual([]);
    expect(rankSearch('zzz', videoItems(CARDS))).toEqual([]);
  });
  it('is case-insensitive on a substring', () => {
    var titles = rankSearch('BLU', videoItems(CARDS)).map(function(i) { return i.title; });
    expect(titles).toContain('Blue Planet');
    expect(titles).toContain('Bluey');
  });
  it('orders exact > prefix > substring', () => {
    var items = [
      { title: 'zzz Blue', fields: ['zzz Blue'] },   // substring
      { title: 'Blue', fields: ['Blue'] },           // exact
      { title: 'Blueberry', fields: ['Blueberry'] }  // prefix
    ];
    var out = rankSearch('blue', items).map(function(i) { return i.title; });
    expect(out).toEqual(['Blue', 'Blueberry', 'zzz Blue']);
  });
  it('breaks a quality tie by field priority (title before album before artist)', () => {
    var titleMatch  = { title: 'A-title', fields: ['queen', 'x', 'x'] };     // prefix on field 0
    var albumMatch  = { title: 'B-album', fields: ['x', 'queen', 'x'] };     // prefix on field 1
    var artistMatch = { title: 'C-artist', fields: ['x', 'x', 'queen'] };    // prefix on field 2
    var out = rankSearch('queen', [artistMatch, albumMatch, titleMatch]).map(function(i) { return i.title; });
    expect(out).toEqual(['A-title', 'B-album', 'C-artist']);
  });
  it('breaks a full tie alphabetically by title', () => {
    var items = [
      { title: 'Banana', fields: ['Banana'] },
      { title: 'Apple', fields: ['Apple'] }
    ];
    // both are exact-less prefix matches on 'a' at field 0 -> A-Z title
    var out = rankSearch('a', items).map(function(i) { return i.title; });
    expect(out).toEqual(['Apple', 'Banana']);
  });
  it('a matching artist name surfaces the artist, its albums AND its tracks (Story 5)', () => {
    var out = rankSearch('elo', musicItems(TRACKS, CARDS));
    var tags = out.map(function(i) { return i.tag; });
    expect(tags).toContain('ARTIST'); // ELO tile (title match)
    expect(tags).toContain('ALBUM');  // Out of the Blue (artist field match)
    expect(tags).toContain('TRACK');  // Mr. Blue Sky (artist field match)
  });
  it('scores a null/empty field as no-match (excluded)', () => {
    expect(rankSearch('x', [{ title: '', fields: [null] }])).toEqual([]);
    expect(rankSearch('x', [{ title: '', fields: [''] }])).toEqual([]);
  });
  it('treats an item with no fields as a non-match', () => {
    expect(rankSearch('x', [{ title: 'x' }])).toEqual([]);
  });
  it('tolerates missing item list', () => {
    expect(rankSearch('x', null)).toEqual([]);
  });
});

describe('searchResultsHtml', () => {
  it('renders a row per item: lazy thumbnail, title, secondary, type tag, tap index', () => {
    var items = [{ title: 'Toy Story', poster: 'toy.jpg', secondary: 'Animation', tag: 'FILM' }];
    var html = searchResultsHtml(items, 'http://s');
    expect(html).toContain('data-i="0"');
    expect(html).toContain('class="sr-thumb" loading="lazy" src="http://s/media/toy.jpg"');
    expect(html).toContain('>Toy Story<');
    expect(html).toContain('>Animation<');
    expect(html).toContain('>FILM<');
  });
  it('uses an empty placeholder cell when the item has no poster', () => {
    var html = searchResultsHtml([{ title: 'No Art', poster: null, secondary: '', tag: 'ALBUM' }], 'http://s');
    expect(html).toContain('sr-thumb-empty');
    expect(html).not.toContain('<img');
  });
  it('escapes HTML in item text', () => {
    var html = searchResultsHtml([{ title: '<b>x</b>', poster: null, secondary: 'a & b', tag: 'FILM' }], 'http://s');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('a &amp; b');
  });
  it('renders each item at its own index and joins them', () => {
    var html = searchResultsHtml([{ title: 'A', tag: 'FILM' }, { title: 'B', tag: 'ALBUM' }], 'http://s');
    expect(html).toContain('data-i="0"');
    expect(html).toContain('data-i="1"');
  });
  it('tolerates missing input', () => {
    expect(searchResultsHtml(null, 'http://s')).toBe('');
  });
});
