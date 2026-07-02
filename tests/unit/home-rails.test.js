import { buildRails, buildTabs, buildTabRails, clampIndex, cardRoute, albumsByArtist, artistFromId, withPlaylistsRail } from '../../core/home-rails.js';

// TASK-235 — the create affordance is the Playlists rail-heading ＋ button (in the
// browse screen), not a synthetic card. withPlaylistsRail just GUARANTEES the rail
// exists (empty if no playlists) so the heading + ＋ always render.
describe('withPlaylistsRail', () => {
  it('leaves an existing Playlists rail untouched (no injected create card)', () => {
    const rails = [{ id: 'albums', title: 'Albums', items: [{ id: 'a1' }] }, { id: 'playlists', title: 'Playlists', items: [{ id: 'pl1' }] }];
    const out = withPlaylistsRail(rails);
    expect(out.find(r => r.id === 'playlists').items.map(i => i.id)).toEqual(['pl1']);
    expect(out.find(r => r.id === 'albums').items.map(i => i.id)).toEqual(['a1']);
  });
  it('adds an EMPTY Playlists rail when none exists (heading-only state)', () => {
    const out = withPlaylistsRail([{ id: 'albums', title: 'Albums', items: [] }]);
    const pl = out.find(r => r.id === 'playlists');
    expect(pl.items).toEqual([]);
    expect(pl.title).toBe('Playlists');
  });
  it('the synthesised Playlists rail leads when nothing is in progress (TASK-234)', () => {
    const out = withPlaylistsRail([{ id: 'artists', title: 'Artists', items: [] }, { id: 'albums', title: 'Albums', items: [] }]);
    expect(out.map(r => r.id)).toEqual(['playlists', 'artists', 'albums']);
  });
  it('the synthesised Playlists rail sits directly after Continue Listening (TASK-234)', () => {
    const out = withPlaylistsRail([{ id: 'continue', title: 'Continue Listening', items: [] }, { id: 'artists', title: 'Artists', items: [] }]);
    expect(out.map(r => r.id)).toEqual(['continue', 'playlists', 'artists']);
  });
});

const cards = [
  { kind: 'video', id: 'film-a', title: 'A', duration: 600 },
  { kind: 'video', id: 'film-b', title: 'B', duration: 600 },
  { kind: 'series', id: 'millie', title: 'Millie' },
  { kind: 'series', id: 'ollie', title: 'Ollie' }
];

describe('buildRails', () => {
  it('omits Continue Watching when nothing is mid-watch', () => {
    const rails = buildRails(cards, {});
    expect(rails.map(r => r.id)).toEqual(['series', 'films']);
  });

  it('leads with Continue Watching when a video is mid-watch', () => {
    const progress = { 'film-b': { resumePositionSec: 120, lastPlayed: 5000 } };
    const rails = buildRails(cards, progress);
    expect(rails.map(r => r.id)).toEqual(['continue', 'series', 'films']);
    expect(rails[0].title).toBe('Continue Watching');
    expect(rails[0].items.map(c => c.id)).toEqual(['film-b']);
  });

  it('orders Continue Watching most-recently-played first', () => {
    const progress = {
      'film-a': { resumePositionSec: 100, lastPlayed: 1000 },
      'film-b': { resumePositionSec: 100, lastPlayed: 9000 }
    };
    expect(buildRails(cards, progress)[0].items.map(c => c.id)).toEqual(['film-b', 'film-a']);
  });

  it('splits videos into Films and series into Series', () => {
    const rails = buildRails(cards, {});
    const films = rails.find(r => r.id === 'films');
    const series = rails.find(r => r.id === 'series');
    expect(films.items.map(c => c.id)).toEqual(['film-a', 'film-b']);
    expect(series.items.map(c => c.id)).toEqual(['millie', 'ollie']);
  });

  it('exposes durationSec on cards for the tile model', () => {
    const films = buildRails(cards, {}).find(r => r.id === 'films');
    expect(films.items[0].durationSec).toBe(600);
  });

  it('does not mutate the input cards', () => {
    buildRails(cards, {});
    expect(cards[0].durationSec).toBeUndefined();
  });

  it('returns no rails for empty content', () => {
    expect(buildRails([], {})).toEqual([]);
    expect(buildRails(null, null)).toEqual([]);
  });

  it('treats a card with no kind as a video', () => {
    const rails = buildRails([{ id: 'x', title: 'X', duration: 10 }], {});
    expect(rails.map(r => r.id)).toEqual(['films']);
  });
});

// FEAT-027 (TASK-163) — the app is type-agnostic. Browse cards carry a
// server-derived `section` ('series'|'films'|'home-movies'|'music'); the app
// groups by it and holds no `format`/`itemType`/`collectionType` enum.
const TYPED = [
  { kind: 'video',  id: 'toy-story',  title: 'Toy Story',  section: 'films',       genres: ['animation', 'comedy'] },
  { kind: 'video',  id: 'nemo',       title: 'Finding Nemo', section: 'films',     type: 'animation' },             // no genres -> fallback [type]
  { kind: 'series', id: 'bluey',      title: 'Bluey',      section: 'series',  genres: ['animation'] },
  { kind: 'video',  id: 'm-walk',     title: 'Millie Walk', section: 'home-movies', people: ['millie', 'ollie'] },
  { kind: 'video',  id: 'm-park',     title: 'At The Park', section: 'home-movies', people: ['millie'] },
  { kind: 'video',  id: 'orphan',     title: 'Orphan Clip', section: 'home-movies' }                                // no people -> Other
];

describe('clampIndex', () => {
  it('clamps below, above, and within range', () => {
    expect(clampIndex(-2, 3)).toBe(0);
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(1, 3)).toBe(1);
    expect(clampIndex(0, 0)).toBe(0);
  });
});

describe('buildTabs', () => {
  it('shows a tab per section present, fixed order, no Continue tab (TASK-150)', () => {
    expect(buildTabs(TYPED).map(t => t.id)).toEqual(['series', 'films', 'home-movies']);
  });

  it('uses display titles', () => {
    const byId = Object.fromEntries(buildTabs(TYPED).map(t => [t.id, t.title]));
    expect(byId['home-movies']).toBe('Home Movies');
    expect(byId['films']).toBe('Films');
  });

  it('returns no tabs for empty content', () => {
    expect(buildTabs([])).toEqual([]);
    expect(buildTabs(null)).toEqual([]);
  });
});

// /api/continue-watching row shape: carries the owning collection (series for an
// episode, album for a track; null for a standalone film/home movie) but NO
// section/format — the app borrows the section from the row's browse card.
const CW = [
  { item_id: 'toy-story', title: 'Toy Story', poster: 't.jpg', position_secs: 100, duration_secs: 600, collection_id: null, collection_title: null },
  { item_id: 'm-walk', title: 'Millie Walk', poster: 'm.jpg', position_secs: 5, duration_secs: 30, collection_id: null, collection_title: null },
  { item_id: 'bluey-s1e01', title: 'Daddy Putdown', poster: 'b.jpg', position_secs: 200, duration_secs: 420, collection_id: 'bluey', collection_title: 'Bluey' }
];

describe('buildTabRails', () => {
  it('Films -> one genre rail per genre, A-Z by label, item in each matching rail', () => {
    const rails = buildTabRails('films', TYPED, [], {});
    expect(rails.map(r => r.title)).toEqual(['Animation', 'Comedy']);   // A-Z
    expect(rails[0].items.map(c => c.id)).toEqual(['nemo', 'toy-story']); // A-Z by title; nemo via [type] fallback
    expect(rails[1].items.map(c => c.id)).toEqual(['toy-story']);
  });

  it('applies genreLabels overrides, else title-cases the slug', () => {
    const labelled = [{ kind: 'video', id: 'x', title: 'X', section: 'films', genres: ['rom-com'] }];
    expect(buildTabRails('films', labelled, [], { 'rom-com': 'Rom-Com' })[0].title).toBe('Rom-Com');
    expect(buildTabRails('films', labelled, [], {})[0].title).toBe('Rom Com');
  });

  it('Series tab groups series cards by genre', () => {
    const rails = buildTabRails('series', TYPED, [], {});
    expect(rails.map(r => r.title)).toEqual(['Animation']);
    expect(rails[0].items.map(c => c.id)).toEqual(['bluey']);
  });

  it('Home Movies -> Collections + Videos only, NO person rails (TASK-183)', () => {
    const rails = buildTabRails('home-movies', TYPED, [], {});
    // TYPED home-movies are all standalone (no kind:'series') -> only a Videos
    // rail; no person rails (home content carries no people tags).
    expect(rails.map(r => r.title)).toEqual(['Videos']);
    expect(rails.some(r => r.id.startsWith('person:'))).toBe(false);
    expect(rails[0].items.map(c => c.id)).toEqual(['m-park', 'm-walk', 'orphan']); // A-Z by title
  });

  it('does not mutate input cards', () => {
    buildTabRails('films', TYPED, CW, {});
    expect(TYPED[0].durationSec).toBeUndefined();
  });

  // TASK-150 — per-section Continue Watching rail, built from the CW rows. A
  // row's section is borrowed from its browse card (the item's own, or its
  // collection's), so episodes/tracks land in the right tab with no app type enum.
  it('prepends a Continue Watching rail of only this section’s in-progress items', () => {
    const films = buildTabRails('films', TYPED, CW, {});
    expect(films[0].id).toBe('continue');
    expect(films[0].title).toBe('Continue Watching');
    expect(films[0].items.map(c => c.id)).toEqual(['toy-story']); // film only; m-walk + episode excluded
    expect(films[0].items[0].series).toBeNull();                  // a standalone film carries no owning series (BUG-005)

    const home = buildTabRails('home-movies', TYPED, CW, {});
    expect(home[0].id).toBe('continue');
    expect(home[0].items.map(c => c.id)).toEqual(['m-walk']);
  });

  it('Series CW rail shows the episode (not the series) labelled "{series} · {episode}"', () => {
    const rails = buildTabRails('series', TYPED, CW, {});
    expect(rails.map(r => r.id)).toEqual(['continue', 'genre:animation']); // CW rail leads, genre rail follows
    const cw = rails[0];
    expect(cw.items.map(c => c.id)).toEqual(['bluey-s1e01']);   // the episode id, not 'bluey' (via collection_id join)
    expect(cw.items[0].title).toBe('Bluey · Daddy Putdown');
    expect(cw.items[0].kind).toBe('video');                    // selecting plays the episode
    expect(cw.items[0].durationSec).toBe(420);                 // for the progress bar
    expect(cw.items[0].series).toBe('bluey');                  // owning series threaded so a tile launch keeps Next/Prev (BUG-005)
  });

  it('keeps the backend newest-first CW order (does not re-sort A-Z)', () => {
    const cards = [
      { kind: 'video', id: 'film-a', title: 'A', section: 'films' },
      { kind: 'video', id: 'film-b', title: 'B', section: 'films' }
    ];
    const cw = [
      { item_id: 'film-b', title: 'B', position_secs: 10, duration_secs: 100, collection_id: null, collection_title: null },
      { item_id: 'film-a', title: 'A', position_secs: 10, duration_secs: 100, collection_id: null, collection_title: null }
    ];
    const films = buildTabRails('films', cards, cw, {});
    expect(films[0].items.map(c => c.id)).toEqual(['film-b', 'film-a']);
  });

  it('omits the Continue Watching rail when this section has nothing in progress', () => {
    expect(buildTabRails('films', TYPED, [], {}).every(r => r.id !== 'continue')).toBe(true);
    expect(buildTabRails('films', TYPED, null, {}).every(r => r.id !== 'continue')).toBe(true);
  });
});

// FEAT-027 — music: a Music section (tab titled "Music"); albums/playlists are
// series cards with section:"music". A track is never a standalone browse card
// (a single is a 1-track album), so there is no audio-single card and no Singles
// rail. Routing/grouping is by `section`, never `format`/`mediaType`.
const MUSIC = [
  { kind: 'video',  id: 'toy-story', title: 'Toy Story', section: 'films', genres: ['animation'] },
  { kind: 'series', id: 'ootb',      title: 'Out of the Blue', section: 'music', artist: 'ELO' },
  { kind: 'series', id: 'rumours',   title: 'Rumours',         section: 'music', artist: 'Fleetwood Mac' }
];

describe('music section routing (FEAT-027)', () => {
  it('adds a Music tab (titled Music) when music is present, after the video tabs', () => {
    expect(buildTabs(MUSIC).map(t => t.id)).toEqual(['films', 'music']);
    expect(Object.fromEntries(buildTabs(MUSIC).map(t => [t.id, t.title]))['music']).toBe('Music');
  });

  it('keeps album cards off the Series tab (an album isn’t a series-tab card)', () => {
    const withSeries = MUSIC.concat([{ kind: 'series', id: 'bluey', title: 'Bluey', section: 'series', genres: ['animation'] }]);
    expect(buildTabs(withSeries).map(t => t.id)).toEqual(['series', 'films', 'music']);
    expect(buildTabRails('series', withSeries, [], {}).some(r => r.items.some(c => c.id === 'ootb'))).toBe(false);
  });

  it('keeps album cards out of the Films tab', () => {
    expect(buildTabRails('films', MUSIC, [], {}).some(r => r.items.some(c => c.id === 'ootb'))).toBe(false);
  });

  it('Music tab -> an Artists rail then an Albums rail (A-Z), no Singles rail', () => {
    const rails = buildTabRails('music', MUSIC, [], {});
    expect(rails.map(r => r.id)).toEqual(['artists', 'albums']);
    expect(rails[1].items.map(c => c.id)).toEqual(['ootb', 'rumours']); // A-Z: Out of the Blue, Rumours
  });
});

// FEAT-036 — user playlists. A playlist is a music-section card distinguished by
// collectionType:'playlist'; it lives in its own Playlists rail (not Albums) and
// routes to the playlist detail (its own state-DB route), never album detail.
const WITH_PLAYLISTS = MUSIC.concat([
  { kind: 'series', id: 'pl-faves',    title: 'Faves',     section: 'music', collectionType: 'playlist' },
  { kind: 'series', id: 'pl-roadtrip', title: 'Road Trip', section: 'music', collectionType: 'playlist' }
]);

describe('playlists rail + routing (FEAT-036)', () => {
  it('splits playlists into their own Playlists rail, directly after Continue Listening (TASK-234)', () => {
    const rails = buildTabRails('music', WITH_PLAYLISTS, [], {});
    expect(rails.map(r => r.id)).toEqual(['playlists', 'artists', 'albums']);
  });

  it('keeps playlist cards OUT of the Albums rail (split on collectionType)', () => {
    const rails = buildTabRails('music', WITH_PLAYLISTS, [], {});
    const albums = rails.find(r => r.id === 'albums');
    const playlists = rails.find(r => r.id === 'playlists');
    expect(albums.items.map(c => c.id)).toEqual(['ootb', 'rumours']); // no playlists leaked in
    expect(playlists.items.map(c => c.id)).toEqual(['pl-faves', 'pl-roadtrip']); // A-Z by title
  });

  it('omits the Playlists rail when there are no playlists', () => {
    expect(buildTabRails('music', MUSIC, [], {}).some(r => r.id === 'playlists')).toBe(false);
  });

  it('a playlist card routes to the playlist detail, not album detail', () => {
    expect(cardRoute({ kind: 'series', section: 'music', collectionType: 'playlist', id: 'pl-faves' })).toBe('playlist');
  });

  it('a plain album card still routes to album detail', () => {
    expect(cardRoute({ kind: 'series', section: 'music', id: 'ootb' })).toBe('album');
  });
});

// FEAT-029 — the Music tab's Artists rail + the artist drill-down. One tile per
// distinct album artist (square art borrowed from their first album), routing to
// the artist page; albumsByArtist powers that page's filtered album grid.
const ARTIST_MUSIC = [
  { kind: 'series', id: 'ootb',    title: 'Out of the Blue', poster: 'ootb.jpg',    section: 'music', artist: 'ELO',  tags: { year: '1977' } },
  { kind: 'series', id: 'time',    title: 'Time',            poster: 'time.jpg',    section: 'music', artist: 'ELO',  tags: { year: '1981' } },
  { kind: 'series', id: 'arrival', title: 'Arrival',         poster: 'arrival.jpg', section: 'music', artist: 'ABBA', tags: { year: '1976' } },
  { kind: 'series', id: 'untagged', title: 'Mix Tape',       poster: 'mix.jpg',     section: 'music' }
];

describe('Artists rail + drill-down (FEAT-029)', () => {
  it('builds one tile per distinct artist, A-Z, with square art and an "N albums" label', () => {
    const artists = buildTabRails('music', ARTIST_MUSIC, [], {}).find(r => r.id === 'artists');
    expect(artists.items.map(c => c.title)).toEqual(['ABBA', 'ELO']); // A-Z
    const elo = artists.items.find(c => c.artist === 'ELO');
    expect(elo.kind).toBe('artist');
    expect(elo.id).toBe('artist:ELO');
    expect(elo.section).toBe('music'); // square art
    expect(elo.subLabel).toBe('2 albums');
    expect(elo.poster).toBe('ootb.jpg'); // first album A-Z (Out of the Blue < Time)
    expect(artists.items.find(c => c.artist === 'ABBA').subLabel).toBe('1 album');
  });

  it('omits albums with no artist from the Artists rail (they stay in the Albums rail)', () => {
    const rails = buildTabRails('music', ARTIST_MUSIC, [], {});
    const artists = rails.find(r => r.id === 'artists');
    const albums = rails.find(r => r.id === 'albums');
    expect(artists.items.some(c => c.artist == null)).toBe(false);
    expect(albums.items.map(c => c.id)).toContain('untagged');
  });

  it('an artist tile routes to the artist drill-down (not album detail)', () => {
    expect(cardRoute({ kind: 'artist', section: 'music', artist: 'ELO' })).toBe('artist');
  });

  it('albumsByArtist returns one artist’s albums newest-first by year', () => {
    expect(albumsByArtist(ARTIST_MUSIC, 'ELO').map(c => c.id)).toEqual(['time', 'ootb']); // 1981, 1977
    expect(albumsByArtist(ARTIST_MUSIC, 'ABBA').map(c => c.id)).toEqual(['arrival']);
    expect(albumsByArtist(ARTIST_MUSIC, 'Nobody')).toEqual([]);
  });

  it('albumsByArtist sorts yearless albums last, then A-Z by title', () => {
    const mixed = [
      { kind: 'series', id: 'a-2000', title: 'Beta',  section: 'music', artist: 'X', tags: { year: '2000' } },
      { kind: 'series', id: 'b-none', title: 'Zed',   section: 'music', artist: 'X' },
      { kind: 'series', id: 'c-1990', title: 'Alpha', section: 'music', artist: 'X', tags: { year: '1990' } },
      { kind: 'series', id: 'd-none', title: 'Acme',  section: 'music', artist: 'X' }
    ];
    // 2000, 1990, then the two yearless A-Z (Acme, Zed).
    expect(albumsByArtist(mixed, 'X').map(c => c.id)).toEqual(['a-2000', 'c-1990', 'd-none', 'b-none']);
  });

  // BUG-029: companion browse opens the artist page with the prefixed rail-tile
  // id (`artist:NF`); the page must resolve it to the clean artist key.
  it('artistFromId strips a leading artist: prefix, passthrough otherwise', () => {
    expect(artistFromId('artist:NF')).toBe('NF');
    expect(artistFromId('NF')).toBe('NF');
    expect(artistFromId('artist:Simon & Garfunkel')).toBe('Simon & Garfunkel');
    expect(artistFromId('')).toBe('');
  });
});

// Album track CW rows carry the album as their collection (no format/section);
// the app borrows section 'music' from the album browse card.
const MUSIC_CW = [
  { item_id: 'ootb-02', title: 'Mr. Blue Sky', position_secs: 110, duration_secs: 245, collection_id: 'ootb', collection_title: 'Out of the Blue' },
  { item_id: 'ootb-05', title: 'Wild West Hero', position_secs: 30, duration_secs: 300, collection_id: 'ootb', collection_title: 'Out of the Blue' },
  { item_id: 'toy-story', title: 'Toy Story', position_secs: 100, duration_secs: 600, collection_id: null, collection_title: null }
];

describe('Continue Listening (collection-level, FEAT-027)', () => {
  it('rolls in-progress album tracks up to ONE album tile, not per track', () => {
    const rails = buildTabRails('music', MUSIC, MUSIC_CW, {});
    expect(rails[0].id).toBe('continue');
    expect(rails[0].title).toBe('Continue Listening');
    // ootb has two in-progress tracks -> a single album tile (rollup); the film row excluded.
    expect(rails[0].items.map(c => c.id)).toEqual(['ootb']);
    expect(rails[0].items[0].kind).toBe('series'); // album tile opens album detail
  });

  it('excludes music rows from the video tabs Continue Watching (no track leaks into Films)', () => {
    const films = buildTabRails('films', MUSIC, MUSIC_CW, {});
    expect(films[0].id).toBe('continue');
    expect(films[0].items.map(c => c.id)).toEqual(['toy-story']); // only the film, no track
  });

  it('omits Continue Listening when nothing music is in progress', () => {
    const rails = buildTabRails('music', MUSIC, [{ item_id: 'toy-story', position_secs: 100, duration_secs: 600, collection_id: null }], {});
    expect(rails.every(r => r.id !== 'continue')).toBe(true);
  });
});

// FEAT-027 — a film box-set is a collection (kind:'series', collectionType
// 'boxset') with section:'films' (descriptor: boxset -> films). It is NOT its own
// section/tab: the box-set lives in the Films tab. It gets its OWN "Box Sets"
// rail (leading the genre rows) and is kept OUT of the genre rails; its member
// films still surface individually in their genre rails (the `standalone`
// capability).
describe('box-set grouping (FEAT-027 — own rail in Films, not its own tab)', () => {
  const WITH_BOXSET = [
    { kind: 'video',  id: 'rhod-mountain', title: 'The Cat That Looked Like Nicholas Lyndhurst', section: 'films', genres: ['comedy'] },
    { kind: 'series', id: 'rhod-boxset',   title: 'Rhod Gilbert Live', collectionType: 'boxset', section: 'films', genres: ['comedy'] }
  ];

  it('does not add a Box Set tab — the boxset lives in Films', () => {
    expect(buildTabs(WITH_BOXSET).map(t => t.id)).toEqual(['films']);
  });

  it('puts box-sets in their own Box Sets rail, leading the genre rails', () => {
    const rails = buildTabRails('films', WITH_BOXSET, [], {});
    expect(rails.map(r => r.title)).toEqual(['Box Sets', 'Comedy']);
    expect(rails[0].id).toBe('boxsets');
    expect(rails[0].items.map(c => c.id)).toEqual(['rhod-boxset']);
  });

  it('keeps box-sets out of the genre rails (only the standalone film remains)', () => {
    const rails = buildTabRails('films', WITH_BOXSET, [], {});
    const comedy = rails.find(r => r.title === 'Comedy');
    expect(comedy.items.map(c => c.id)).toEqual(['rhod-mountain']);
  });

  it('routes the box-set to collection detail (kind series), the film to play', () => {
    expect(cardRoute({ kind: 'series', section: 'films' })).toBe('series');
    expect(cardRoute({ kind: 'video', section: 'films' })).toBe('video');
  });
});

describe('cardRoute (browse navigation, FEAT-027)', () => {
  it('routes a music card to album, else falls back to kind', () => {
    expect(cardRoute({ kind: 'series', section: 'music' })).toBe('album');
    expect(cardRoute({ kind: 'video', section: 'films' })).toBe('video');
    expect(cardRoute({ kind: 'series', section: 'series' })).toBe('series');
    expect(cardRoute({ id: 'x' })).toBe('video'); // no kind -> video
  });

  it('routes on section only — the old format/mediaType enum no longer drives it', () => {
    // Proves the type-agnostic switch: a card with the legacy format but no
    // section routes by kind, NOT to 'album' (fails on the pre-163 code).
    expect(cardRoute({ kind: 'series', format: 'album' })).toBe('series');
    expect(cardRoute({ kind: 'video', mediaType: 'audio' })).toBe('video');
  });
});

// TASK-183 (FEAT-025 surviving slice) — the Home Movies tab augments the person
// rails with two structural rails: Collections (kind:'series') and Videos
// (standalone kind:'video', last). Type-agnostic — split on card `kind`, never a
// format/mediaType enum. These assertions fail on the pre-183 person-rails-only
// branch (no 'collections'/'videos' rail, wrong order).
describe('Home Movies structural rails (TASK-183)', () => {
  // Two home-movie collections, two standalone clips, mixed person tags.
  const HOME = [
    { kind: 'series', id: 'holidays',  title: 'Holidays',  section: 'home-movies', people: ['millie'] },
    { kind: 'series', id: 'birthdays', title: 'Birthdays', section: 'home-movies' },
    { kind: 'video',  id: 'm-walk',    title: 'Millie Walk', section: 'home-movies', people: ['millie'] },
    { kind: 'video',  id: 'park',      title: 'At The Park', section: 'home-movies' }
  ];

  it('adds a Collections rail of the kind:series cards, A-Z by title', () => {
    const rails = buildTabRails('home-movies', HOME, [], {});
    const collections = rails.find(r => r.id === 'collections');
    expect(collections).toBeTruthy();
    expect(collections.title).toBe('Collections');
    expect(collections.items.map(c => c.id)).toEqual(['birthdays', 'holidays']); // A-Z
  });

  it('adds a Videos rail of the standalone kind:video cards, A-Z by title', () => {
    const rails = buildTabRails('home-movies', HOME, [], {});
    const videos = rails.find(r => r.id === 'videos');
    expect(videos).toBeTruthy();
    expect(videos.title).toBe('Videos');
    expect(videos.items.map(c => c.id)).toEqual(['park', 'm-walk']); // At The Park, Millie Walk
  });

  it('orders rails Continue → Collections → Videos, with NO person rails', () => {
    const cw = [{ item_id: 'm-walk', title: 'Millie Walk', poster: 'm.jpg', position_secs: 5, duration_secs: 30, collection_id: null, collection_title: null }];
    const ids = buildTabRails('home-movies', HOME, cw, {}).map(r => r.id);
    expect(ids).toEqual(['continue', 'collections', 'videos']);
    expect(ids.some(id => id.startsWith('person:'))).toBe(false);
  });

  it('omits an empty structural rail', () => {
    const noCollections = [{ kind: 'video', id: 'v', title: 'V', section: 'home-movies' }];
    expect(buildTabRails('home-movies', noCollections, [], {}).some(r => r.id === 'collections')).toBe(false);
    const noVideos = [{ kind: 'series', id: 's', title: 'S', section: 'home-movies' }];
    expect(buildTabRails('home-movies', noVideos, [], {}).some(r => r.id === 'videos')).toBe(false);
  });
});
