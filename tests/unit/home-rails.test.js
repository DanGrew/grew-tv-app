import { buildRails, buildTabs, buildTabRails, railsForSection, railsForBrowseSection, clampIndex, cardRoute, CARD_ROUTES, albumsByArtist, artistFromId, withPlaylistsRail, withMvPlaylistsRail, homeMoviesPlayAllRail, homeMoviesMonthRail, homeMoviesListItems, homeMoviesListTitle, homeMoviesSourceLabel, homeMoviesListPlayParams } from '../../core/home-rails.js';

// FEAT-560/TASK-563 — Channels is the one section whose rails don't come from
// the catalog. Both surfaces resolve a section's rails through here, so the TV
// tab and the phone's dock can never disagree about what a section holds.
describe('railsForBrowseSection', () => {
  const CHANNELS = [{ channel_id: 'cartoon-club', name: 'Cartoon Club', on_air: true, item: { item_id: 'b', title: 'Bluey' }, offset_seconds: 60, runtime_seconds: 480 }];

  it('serves the Channels section its strip, not catalog rails', () => {
    const rails = railsForBrowseSection('channels', [], [], {}, [], CHANNELS);
    expect(rails.length).toBe(1);
    expect(rails[0].title).toBe('On now');
    expect(rails[0].items[0].kind).toBe('channel');
  });

  it('serves any other section exactly what railsForSection does', () => {
    const cards = [{ kind: 'video', id: 'toy-story', title: 'Toy Story', section: 'films', genres: ['animation'] }];
    expect(railsForBrowseSection('films', cards, [], {}, [], CHANNELS))
      .toEqual(railsForSection('films', cards, [], {}, []));
  });

  it('gives the Channels section no rails when there are no channels', () => {
    expect(railsForBrowseSection('channels', [], [], {}, [], [])).toEqual([]);
  });
});

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
  it('the synthesised Playlists rail sits directly after Recently Played (TASK-234/318)', () => {
    const out = withPlaylistsRail([{ id: 'recent', title: 'Recently Played', items: [] }, { id: 'artists', title: 'Artists', items: [] }]);
    expect(out.map(r => r.id)).toEqual(['recent', 'playlists', 'artists']);
  });
});

// TASK-378 — the Music Videos twin of withPlaylistsRail: guarantees the
// `mv-playlists` rail exists (empty if no music-video playlists yet) so the
// Music Videos tab's "Playlists ＋" heading always renders too.
describe('withMvPlaylistsRail', () => {
  it('leaves an existing mv-playlists rail untouched (no injected create card)', () => {
    const rails = [{ id: 'mv-artist:QOTSA', title: 'QOTSA', items: [{ id: 'mv1' }] }, { id: 'mv-playlists', title: 'Playlists', items: [{ id: 'mvpl1' }] }];
    const out = withMvPlaylistsRail(rails);
    expect(out.find(r => r.id === 'mv-playlists').items.map(i => i.id)).toEqual(['mvpl1']);
    expect(out.find(r => r.id === 'mv-artist:QOTSA').items.map(i => i.id)).toEqual(['mv1']);
  });
  it('adds an EMPTY mv-playlists rail when none exists (heading-only state)', () => {
    const out = withMvPlaylistsRail([{ id: 'mv-artist:QOTSA', title: 'QOTSA', items: [] }]);
    const pl = out.find(r => r.id === 'mv-playlists');
    expect(pl.items).toEqual([]);
    expect(pl.title).toBe('Playlists');
  });
  it('the synthesised mv-playlists rail leads (no Recently Played rail to sit after in Music Videos)', () => {
    const out = withMvPlaylistsRail([{ id: 'mv-artist:QOTSA', title: 'QOTSA', items: [] }, { id: 'mv-artist:Muse', title: 'Muse', items: [] }]);
    expect(out.map(r => r.id)).toEqual(['mv-playlists', 'mv-artist:QOTSA', 'mv-artist:Muse']);
  });
  it('tolerates an empty rails list', () => {
    expect(withMvPlaylistsRail([]).map(r => r.id)).toEqual(['mv-playlists']);
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
  { kind: 'series', id: 'bluey',      title: 'Bluey',      section: 'series',  collectionType: 'series', genres: ['animation'] },
  { kind: 'video',  id: 'm-walk',     title: 'Millie Walk', section: 'home-movies', people: ['millie', 'ollie'], tags: { date: '2026-01-02' } },
  { kind: 'video',  id: 'm-park',     title: 'At The Park', section: 'home-movies', people: ['millie'], tags: { date: '2026-01-01' } },
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

  it('Home Movies -> Play All rail then the month rail, one tile per people tag, A-Z by label (TASK-486/491/502)', () => {
    const rails = buildTabRails('home-movies', TYPED, [], {});
    expect(rails.map(r => r.title)).toEqual(['Play All', 'Play All by month']); // TASK-502: no rail per kid after these two
    // The `people` tags now surface only as Play All tiles: A-Z, and 'other'
    // (the untagged `orphan` clip) earns none of its own — All covers it.
    expect(rails[0].items.map(t => t.title)).toEqual(['All', 'Millie', 'Ollie']);
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
    expect(cw.items[0].collectionType).toBe('series');         // TASK-542: and its TYPE, so the tile opens the TV Series Queue
  });

  // TASK-542 — a CW tile is one of three ways into the player carrying a
  // collection id, and the tile itself knows nothing about its item. The type
  // comes off the owning collection's own browse card, the same card the row
  // already borrows its section from. Without it a resumed episode and a
  // resumed boxset film would open under the same queue again.
  it('carries the owning collection\'s own type onto a CW tile, series or boxset', () => {
    const cards = [
      { kind: 'series', id: 'bluey', title: 'Bluey', section: 'series', collectionType: 'series' },
      { kind: 'series', id: 'toy-box', title: 'Toy Story Collection', section: 'films', collectionType: 'boxset' }
    ];
    const cw = [
      { item_id: 'bluey-s1e01', title: 'Daddy Putdown', position_secs: 200, duration_secs: 420, collection_id: 'bluey', collection_title: 'Bluey' },
      { item_id: 'toy-story-2', title: 'Toy Story 2', position_secs: 100, duration_secs: 600, collection_id: 'toy-box', collection_title: 'Toy Story Collection' }
    ];
    expect(buildTabRails('series', cards, cw, {})[0].items[0].collectionType).toBe('series');
    expect(buildTabRails('films', cards, cw, {})[0].items[0].collectionType).toBe('boxset');
  });

  // A standalone film belongs to no collection, so there is no type to carry —
  // navTo drops it alongside the null series id and the film opens standalone.
  it('carries no collection type for a standalone CW tile', () => {
    const films = buildTabRails('films', TYPED, CW, {});
    expect(films[0].items[0].collectionType).toBeNull();
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
  it('splits playlists into their own Playlists rail, directly after Recently Played (TASK-234/318)', () => {
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

// TASK-376 — Music Videos: a section of its own, sibling of Music. A rail PER
// ARTIST holds that artist's music videos directly (no drill-down tile, unlike
// Music's own Artists rail) plus a Playlists rail of music-video playlists.
// Albums of music videos are explicitly out of scope (owner, 2026-08-06).
const MUSIC_VIDEOS = [
  { kind: 'video',  id: 'mv-haunted', title: 'Head Like a Haunted House', section: 'music-videos', artist: 'QOTSA' },
  { kind: 'video',  id: 'mv-noone',   title: 'No One Knows',              section: 'music-videos', artist: 'QOTSA' },
  { kind: 'video',  id: 'mv-chop',    title: 'Chop Suey!',                section: 'music-videos', artist: 'System of a Down' },
  { kind: 'series', id: 'mv-pl-rock', title: 'Rock Faves',                section: 'music-videos', collectionType: 'music-video-playlist' }
];

describe('Music Videos section (TASK-376)', () => {
  it('adds a Music Videos tab, titled Music Videos, right after Music', () => {
    const combined = MUSIC.concat(MUSIC_VIDEOS);
    expect(buildTabs(combined).map(t => t.id)).toEqual(['films', 'music', 'music-videos']);
    expect(Object.fromEntries(buildTabs(combined).map(t => [t.id, t.title]))['music-videos']).toBe('Music Videos');
  });

  it('stays out of the way — no tab when there is no music-video content yet (Story 6)', () => {
    expect(buildTabs(MUSIC).map(t => t.id)).not.toContain('music-videos');
  });

  it('shows a rail per artist (A-Z), each holding only that artist’s videos (A-Z by title)', () => {
    const rails = buildTabRails('music-videos', MUSIC_VIDEOS, [], {});
    expect(rails.map(r => r.id)).toEqual(['mv-playlists', 'mv-artist:QOTSA', 'mv-artist:System of a Down']);
    expect(rails.map(r => r.title)).toEqual(['Playlists', 'QOTSA', 'System of a Down']);
    const qotsa = rails.find(r => r.id === 'mv-artist:QOTSA');
    expect(qotsa.items.map(c => c.id)).toEqual(['mv-haunted', 'mv-noone']); // A-Z by title
    const sotd = rails.find(r => r.id === 'mv-artist:System of a Down');
    expect(sotd.items.map(c => c.id)).toEqual(['mv-chop']);
  });

  it('the Playlists rail holds the music-video playlists', () => {
    const rails = buildTabRails('music-videos', MUSIC_VIDEOS, [], {});
    expect(rails.find(r => r.id === 'mv-playlists').items.map(c => c.id)).toEqual(['mv-pl-rock']);
  });

  it('omits the Playlists rail when there are no music-video playlists', () => {
    const noPlaylist = MUSIC_VIDEOS.filter(c => c.collectionType !== 'music-video-playlist');
    expect(buildTabRails('music-videos', noPlaylist, [], {}).some(r => r.id === 'mv-playlists')).toBe(false);
  });

  it('omits a music video with no artist from every rail', () => {
    const noArtist = MUSIC_VIDEOS.concat([{ kind: 'video', id: 'mv-orphan', title: 'Orphan', section: 'music-videos' }]);
    const rails = buildTabRails('music-videos', noArtist, [], {});
    expect(rails.some(r => r.items.some(c => c.id === 'mv-orphan'))).toBe(false);
  });

  it('never leaks a music video into the Music tab’s Artists/Albums rails', () => {
    const combined = MUSIC.concat(MUSIC_VIDEOS);
    const musicRails = buildTabRails('music', combined, [], {});
    expect(musicRails.every(r => r.items.every(c => c.section !== 'music-videos'))).toBe(true);
  });

  it('never leaks a music video into the Films tab', () => {
    const combined = MUSIC.concat(MUSIC_VIDEOS);
    expect(buildTabRails('films', combined, [], {}).every(r => r.items.every(c => c.section !== 'music-videos'))).toBe(true);
  });

  it('a music-video playlist card routes to the playlist detail, same as a music playlist', () => {
    expect(cardRoute({ kind: 'series', section: 'music-videos', collectionType: 'music-video-playlist', id: 'mv-pl-rock' })).toBe('playlist');
  });

  it('a standalone music-video card routes to its own player entry, not the plain video route (TASK-374 — avoids the server-authoritative engine)', () => {
    expect(cardRoute({ kind: 'video', section: 'music-videos', id: 'mv-haunted' })).toBe('music-video');
  });

  it('tolerates null cards', () => {
    expect(buildTabRails('music-videos', null, [], {})).toEqual([]);
  });

  it('never pulls a non-music-videos card into a Music Videos rail (mixed sections)', () => {
    const mixed = MUSIC.concat(MUSIC_VIDEOS);
    const rails = buildTabRails('music-videos', mixed, [], {});
    const allIds = rails.flatMap(r => r.items.map(c => c.id));
    expect(allIds.sort()).toEqual(['mv-chop', 'mv-haunted', 'mv-noone', 'mv-pl-rock'].sort());
  });

  it('excludes a music-video playlist from the per-artist rails even when it carries an artist field', () => {
    const withArtistedPlaylist = MUSIC_VIDEOS.concat([
      { kind: 'series', id: 'mv-pl-qotsa', title: 'QOTSA Faves', section: 'music-videos', collectionType: 'music-video-playlist', artist: 'QOTSA' }
    ]);
    const rails = buildTabRails('music-videos', withArtistedPlaylist, [], {});
    expect(rails.find(r => r.id === 'mv-artist:QOTSA').items.map(c => c.id)).toEqual(['mv-haunted', 'mv-noone']);
    expect(rails.find(r => r.id === 'mv-playlists').items.map(c => c.id)).toEqual(['mv-pl-qotsa', 'mv-pl-rock']); // A-Z by title: QOTSA Faves, Rock Faves
  });
});

// TASK-424 — railsForSection wraps buildTabRails with the Music/Music Videos
// Playlists-rail guarantee (withPlaylistsRail/withMvPlaylistsRail), shared by
// the TV browse screen and the companion (whose ＋ create affordance is gated
// on landing on that rail — buildTabRails alone can't be trusted to have it).
describe('railsForSection (TASK-424)', () => {
  it('guarantees the Playlists rail on Music even with zero playlists', () => {
    const rails = railsForSection('music', MUSIC, [], {});
    expect(rails.some(r => r.id === 'playlists')).toBe(true);
  });

  it('guarantees the mv-playlists rail on Music Videos even with zero playlists', () => {
    const noPlaylist = MUSIC_VIDEOS.filter(c => c.collectionType !== 'music-video-playlist');
    const rails = railsForSection('music-videos', noPlaylist, [], {});
    expect(rails.some(r => r.id === 'mv-playlists')).toBe(true);
  });

  it('leaves a real Playlists rail as buildTabRails already built it (no double-injection)', () => {
    expect(railsForSection('music', WITH_PLAYLISTS, [], {}))
      .toEqual(buildTabRails('music', WITH_PLAYLISTS, [], {}));
  });

  it('passes every other section through unchanged — no guarantee to apply', () => {
    expect(railsForSection('films', MUSIC, [], {}))
      .toEqual(buildTabRails('films', MUSIC, [], {}));
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

// FEAT-045 (TASK-318) — the Music tab's lead rail is now "Recently Played",
// built from the backend `recents` [{source_type, source_id, last_played}]
// (TASK-317), newest-first. Each source_id maps to its existing browse tile:
// album/playlist by card id, artist by NAME (the tile's own id is prefixed
// 'artist:'). The old inferred Continue Listening (album roll-up + watch_progress)
// is GONE — the lead rail no longer reads cwRows/progress at all. These
// assertions are red on the old code (no recentlyPlayedRail; a progress-derived
// lead rail).
const RP_MUSIC = [
  { kind: 'series', id: 'ootb',     title: 'Out of the Blue', poster: 'ootb.jpg', section: 'music', artist: 'ELO' },
  { kind: 'series', id: 'rumours',  title: 'Rumours',         poster: 'rum.jpg',  section: 'music', artist: 'Fleetwood Mac' },
  { kind: 'series', id: 'pl-faves', title: 'Faves',           poster: null,       section: 'music', collectionType: 'playlist' }
];

describe('Recently Played rail (FEAT-045/TASK-318)', () => {
  it('leads with a "Recently Played" rail of the recents tiles, newest-first order preserved', () => {
    const recents = [
      { source_type: 'playlist', source_id: 'pl-faves', last_played: 3 },
      { source_type: 'album',    source_id: 'ootb',     last_played: 2 },
      { source_type: 'artist',   source_id: 'ELO',      last_played: 1 }
    ];
    const rails = buildTabRails('music', RP_MUSIC, [], {}, recents);
    expect(rails[0].id).toBe('recent');
    expect(rails[0].title).toBe('Recently Played');
    // Backend order kept (not re-sorted); an artist source maps by name to its tile.
    expect(rails[0].items.map(c => c.id)).toEqual(['pl-faves', 'ootb', 'artist:ELO']);
    expect(rails[0].items[2].kind).toBe('artist'); // artist source -> the synthesised artist tile
  });

  it('omits the rail entirely when recents is empty/absent (Story 9: leads with Playlists)', () => {
    expect(buildTabRails('music', RP_MUSIC, [], {}, []).some(r => r.id === 'recent')).toBe(false);
    expect(buildTabRails('music', RP_MUSIC, [], {}).some(r => r.id === 'recent')).toBe(false); // recents undefined
    expect(buildTabRails('music', RP_MUSIC, [], {}, []).map(r => r.id)).toEqual(['playlists', 'artists', 'albums']);
  });

  it('skips a recents id absent from the browse cards (no throw)', () => {
    const recents = [
      { source_type: 'album', source_id: 'ootb',  last_played: 2 },
      { source_type: 'album', source_id: 'ghost', last_played: 1 } // not in cards
    ];
    expect(buildTabRails('music', RP_MUSIC, [], {}, recents)[0].items.map(c => c.id)).toEqual(['ootb']);
  });

  it('does not read watch_progress — in-progress cwRows no longer create the lead rail', () => {
    const rails = buildTabRails('music', RP_MUSIC, MUSIC_CW, {}, []);
    expect(rails.every(r => r.id !== 'recent' && r.id !== 'continue')).toBe(true);
    expect(rails[0].id).toBe('playlists');
  });

  it('a recents tile routes as its own kind (album->album detail, fast access not a resume button)', () => {
    const recents = [{ source_type: 'album', source_id: 'ootb', last_played: 1 }];
    const tile = buildTabRails('music', RP_MUSIC, [], {}, recents)[0].items[0];
    expect(cardRoute(tile)).toBe('album');
  });
});

// A music track still never leaks into a VIDEO tab's Continue Watching rail
// (rowSection borrows the section from the row's browse card). Unchanged by
// TASK-318 — the video CW path still reads cwRows.
describe('video Continue Watching excludes music tracks (FEAT-027, unchanged)', () => {
  it('a music track row does not appear in the Films Continue Watching rail', () => {
    const films = buildTabRails('films', MUSIC, MUSIC_CW, {});
    expect(films[0].id).toBe('continue');
    expect(films[0].items.map(c => c.id)).toEqual(['toy-story']); // only the film, no track
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

  // TASK-373/374 — a music video is standalone: `kind` is still 'video' (media
  // is video, same as a film), so without this check it would fall through to
  // the plain 'video' route and fire the server-authoritative engine action the
  // owner ruled out reusing for a music video. Its own 'music-video' route lets
  // the browse screen send it into the player's own client-owned playthrough.
  it('routes a music-video item to its own player entry, not the plain video route', () => {
    expect(cardRoute({ kind: 'video', section: 'music-videos', id: 'mv1' })).toBe('music-video');
  });

  // A music-video playlist reuses the generic 'series'-shaped playlist card
  // (kind:'series', like a song playlist) and, per the owner (TASK-376), the
  // SAME 'playlist' route as any other playlist — it opens the playlist
  // detail screen rather than starting a direct playthrough.
  it('routes a music-video playlist to the playlist detail, same as a song playlist', () => {
    expect(cardRoute({ kind: 'series', section: 'music-videos', collectionType: 'music-video-playlist', id: 'pl-vids' })).toBe('playlist');
  });
});

// TASK-383 — CARD_ROUTES is the single source of truth arch-check's
// no-missing-card-route rule reads to enforce every dispatch table handles (or
// declares unhandled) every route cardRoute() can return; it must stay exactly
// the set cardRoute()'s branches above actually produce.
describe('CARD_ROUTES', () => {
  it('lists every value cardRoute() can return', () => {
    expect(CARD_ROUTES).toEqual(['artist', 'playlist', 'music-video', 'album', 'video', 'series', 'track', 'play-all', 'channel']);
  });
  it('cardRoute maps a TASK-486 Play All tile to "play-all" via the fallback branch', () => {
    expect(cardRoute({ kind: 'play-all', id: 'play-all:All' })).toBe('play-all');
  });
  it('cardRoute maps a TASK-563 channel tile to "channel" via the same fallback', () => {
    expect(cardRoute({ kind: 'channel', id: 'channel:cartoon-club' })).toBe('channel');
  });
});

// TASK-502 — the Home Movies tab no longer renders a browse rail per kid.
// TASK-444 added those rails; TASK-486's Play All tiles now open the same clip
// list, so the rails were a second route to one place. The `people` grouping
// itself survives as data feeding those tiles — asserted here through the
// tiles, since that is the only place it is now observable.
describe('Home Movies person rails removed (TASK-502)', () => {
  // Three kid clips (two of Millie's, mixed capture dates) plus one untagged.
  const HOME = [
    { kind: 'video', id: 'm-walk', title: 'Millie Walk', section: 'home-movies', people: ['millie'], tags: { date: '2026-01-05' } },
    { kind: 'video', id: 'm-park', title: 'At The Park', section: 'home-movies', people: ['millie'], tags: { date: '2026-01-10' } },
    { kind: 'video', id: 'o-swim', title: 'Ollie Swim',  section: 'home-movies', people: ['ollie'],  tags: { date: '2026-01-07' } },
    { kind: 'video', id: 'plain',  title: 'Plain Clip',  section: 'home-movies' }
  ];

  it('renders Play All and Play All by month only — no rail per kid', () => {
    const rails = buildTabRails('home-movies', HOME, [], {});
    expect(rails.map(r => r.title)).toEqual(['Play All', 'Play All by month']);
    expect(rails.map(r => r.id)).toEqual(['home-movies-play-all', 'home-movies-play-all-month']);
  });

  it('returns no person: rail for any kid, tagged or untagged', () => {
    const rails = buildTabRails('home-movies', HOME, [], {});
    expect(rails.filter(r => r.id.startsWith('person:'))).toEqual([]);
  });

  it('orders rails Continue → Play All (TASK-486) → Play All by month (TASK-491), and stops there', () => {
    const cw = [{ item_id: 'm-walk', title: 'Millie Walk', poster: 'm.jpg', position_secs: 5, duration_secs: 30, collection_id: null, collection_title: null }];
    const ids = buildTabRails('home-movies', HOME, cw, {}).map(r => r.id);
    expect(ids).toEqual(['continue', 'home-movies-play-all', 'home-movies-play-all-month']);
  });

  it('still builds one Play All tile per kid, title-cased slug, A-Z — the grouping outlived its rail', () => {
    const rails = buildTabRails('home-movies', HOME, [], {});
    const playAll = rails.find(r => r.id === 'home-movies-play-all');
    expect(playAll.items.map(t => t.title)).toEqual(['All', 'Millie', 'Ollie']);
    expect(playAll.items.map(t => t.navParams)).toEqual([
      { homeMoviesAll: 1 }, { homeMoviesPerson: 'millie' }, { homeMoviesPerson: 'ollie' }
    ]);
  });

  it('a clip tagged with more than one kid still yields a tile for each of them', () => {
    const both = HOME.concat([{ kind: 'video', id: 'both', title: 'Both Kids', section: 'home-movies', people: ['millie', 'ollie'], tags: { date: '2026-01-08' } }]);
    const onlyBoth = both.filter(c => c.id === 'both');
    const playAll = buildTabRails('home-movies', onlyBoth, [], {}).find(r => r.id === 'home-movies-play-all');
    expect(playAll.items.map(t => t.title)).toEqual(['All', 'Millie', 'Ollie']);
  });

  it('an untagged clip still keeps the rail alive without earning a tile of its own', () => {
    const onlyUntagged = HOME.filter(c => c.id === 'plain');
    const playAll = buildTabRails('home-movies', onlyUntagged, [], {}).find(r => r.id === 'home-movies-play-all');
    expect(playAll.items.map(t => t.title)).toEqual(['All']);
  });

  it('gives no tile to a kid nobody has tagged', () => {
    const noOllie = HOME.filter(c => c.id !== 'o-swim');
    const playAll = buildTabRails('home-movies', noOllie, [], {}).find(r => r.id === 'home-movies-play-all');
    expect(playAll.items.map(t => t.title)).toEqual(['All', 'Millie']);
  });

  it('drops the old Collections/Videos structural split (TASK-183 -> TASK-444)', () => {
    const rails = buildTabRails('home-movies', HOME, [], {});
    expect(rails.some(r => r.id === 'collections')).toBe(false);
    expect(rails.some(r => r.id === 'videos')).toBe(false);
  });

  it('a kind:series home-movie card is grouped by people like any other, no special-casing', () => {
    const withCollection = [
      { kind: 'series', id: 'holidays', title: 'Holidays', section: 'home-movies', people: ['sadie'], tags: { date: '2026-02-01' } }
    ];
    const playAll = buildTabRails('home-movies', withCollection, [], {}).find(r => r.id === 'home-movies-play-all');
    expect(playAll.items.map(t => t.title)).toEqual(['All', 'Sadie']);
  });
});

// TASK-486 — the Home Movies "Play All" tile rail: All + one tile per kid,
// replacing TASK-446's single header button. Kid tiles reuse EXACTLY the
// `people` tag set (personRails, TASK-444) — no separate tagging concept —
// and drop 'other' since "All" already covers untagged clips. Since TASK-502
// removed the browse rails that tag set also fed, these tiles are the only
// way into a single kid's clips.
describe('homeMoviesPlayAllRail (TASK-486)', () => {
  const PERSON_RAILS = [
    { id: 'person:millie', slug: 'millie', title: 'Millie', items: [{ id: 'm-walk' }] },
    { id: 'person:ollie', slug: 'ollie', title: 'Ollie', items: [{ id: 'o-swim' }] },
    { id: 'person:other', slug: 'other', title: 'Other', items: [{ id: 'plain' }] }
  ];

  it('leads with an All tile, then one tile per kid in the person rails\' own order', () => {
    const rail = homeMoviesPlayAllRail(PERSON_RAILS)[0];
    expect(rail.id).toBe('home-movies-play-all');
    expect(rail.title).toBe('Play All');
    expect(rail.items.map(t => t.title)).toEqual(['All', 'Millie', 'Ollie']);
  });

  it('drops the "other" (untagged) rail — no separate tile, All already covers it', () => {
    const rail = homeMoviesPlayAllRail(PERSON_RAILS)[0];
    expect(rail.items.some(t => t.title === 'Other')).toBe(false);
  });

  it('the All tile carries the TASK-446 home-movies-all nav params and its own prefixed id', () => {
    const rail = homeMoviesPlayAllRail(PERSON_RAILS)[0];
    const all = rail.items.find(t => t.title === 'All');
    expect(all.kind).toBe('play-all');
    expect(all.id).toBe('play-all:All');
    expect(all.navParams).toEqual({ homeMoviesAll: 1 });
  });

  it("a kid tile carries the person's own tag value as homeMoviesPerson and its own prefixed id", () => {
    const rail = homeMoviesPlayAllRail(PERSON_RAILS)[0];
    const millie = rail.items.find(t => t.title === 'Millie');
    expect(millie.kind).toBe('play-all');
    expect(millie.id).toBe('play-all:Millie');
    expect(millie.navParams).toEqual({ homeMoviesPerson: 'millie' });
  });

  it('tile ids are distinct across All + every kid', () => {
    const rail = homeMoviesPlayAllRail(PERSON_RAILS)[0];
    const ids = rail.items.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is omitted entirely when there are no person rails (no home movies at all)', () => {
    expect(homeMoviesPlayAllRail([])).toEqual([]);
    expect(homeMoviesPlayAllRail(null)).toEqual([]);
    expect(homeMoviesPlayAllRail(undefined)).toEqual([]);
  });

  it('still leads with an All tile when every clip is untagged (person rails = just "other")', () => {
    const rail = homeMoviesPlayAllRail([{ id: 'person:other', slug: 'other', title: 'Other', items: [{ id: 'plain' }] }])[0];
    expect(rail.items.map(t => t.title)).toEqual(['All']);
  });
});

// TASK-491 — the "Play All by month" tile rail: one tile per populated
// Year-Month, newest first, mirroring homeMoviesPlayAllRail's own tile shape
// (kind:'play-all', a homeMoviesMonth navParam instead of homeMoviesPerson).
describe('homeMoviesMonthRail (TASK-491)', () => {
  const HOME = [
    { kind: 'video', id: 'aug-2', title: 'Aug Clip 2', section: 'home-movies', tags: { date: '2026-08-15' } },
    { kind: 'video', id: 'aug-1', title: 'Aug Clip 1', section: 'home-movies', tags: { date: '2026-08-02' } },
    { kind: 'video', id: 'jul-1', title: 'Jul Clip',   section: 'home-movies', tags: { date: '2026-07-20' } }
  ];

  it('one tile per populated month, newest first, labelled "Mon YYYY"', () => {
    const rail = homeMoviesMonthRail(HOME)[0];
    expect(rail.id).toBe('home-movies-play-all-month');
    expect(rail.title).toBe('Play All by month');
    expect(rail.items.map(t => t.title)).toEqual(['Aug 2026', 'Jul 2026']);
  });

  it('a month tile carries the YYYY-MM value as homeMoviesMonth and its own prefixed id', () => {
    const rail = homeMoviesMonthRail(HOME)[0];
    const aug = rail.items.find(t => t.title === 'Aug 2026');
    expect(aug.kind).toBe('play-all');
    expect(aug.id).toBe('play-all:Aug 2026');
    expect(aug.navParams).toEqual({ homeMoviesMonth: '2026-08' });
  });

  it('never splits one month into more than one tile — two clips in the same month share a tile', () => {
    const rail = homeMoviesMonthRail(HOME)[0];
    expect(rail.items.length).toBe(2); // Aug + Jul, not one per clip
  });

  it('is omitted entirely when there are no home movies at all', () => {
    expect(homeMoviesMonthRail([])).toEqual([]);
    expect(homeMoviesMonthRail(null)).toEqual([]);
    expect(homeMoviesMonthRail(undefined)).toEqual([]);
  });

  it('a clip with no capture date gets no month tile (never a bogus/blank one)', () => {
    const undated = HOME.concat([{ kind: 'video', id: 'no-date', title: 'No Date', section: 'home-movies' }]);
    const rail = homeMoviesMonthRail(undated)[0];
    expect(rail.items.length).toBe(2); // still just Aug + Jul
  });

  it('labels every calendar month correctly, not just the two exercised above', () => {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const oneOfEach = MONTHS.map((name, i) => {
      const mm = String(i + 1).padStart(2, '0');
      return { kind: 'video', id: 'clip-' + mm, title: name, section: 'home-movies', tags: { date: '2026-' + mm + '-01' } };
    });
    const rail = homeMoviesMonthRail(oneOfEach)[0];
    expect(rail.items.map(t => t.title)).toEqual(MONTHS.slice().reverse().map(name => name + ' 2026'));
  });
});

// TASK-486 (revision) — the Play All LIST screen's own data, shared verbatim
// by the TV screen and its companion mirror (screen-home-movies-list-page.js /
// companion-home-movies-list.js), so the two can never disagree on scope.
describe('homeMoviesListTitle / homeMoviesListItems (TASK-486 revision)', () => {
  const HOME = [
    { kind: 'video', id: 'm-walk', title: 'Millie Walk', section: 'home-movies', people: ['millie'], tags: { date: '2026-01-05' } },
    { kind: 'video', id: 'm-park', title: 'At The Park', section: 'home-movies', people: ['millie'], tags: { date: '2026-01-10' } },
    { kind: 'video', id: 'both',   title: 'Both Kids',   section: 'home-movies', people: ['millie', 'ollie'], tags: { date: '2026-01-08' } },
    { kind: 'video', id: 'o-swim', title: 'Ollie Swim',  section: 'home-movies', people: ['ollie'], tags: { date: '2026-01-07' } },
    { kind: 'video', id: 'plain',  title: 'Plain Clip',  section: 'home-movies' },
    { kind: 'video', id: 'film-a', title: 'A Film',      section: 'films' }
  ];

  it('homeMoviesListTitle is "All" for no person, else the title-cased tag', () => {
    expect(homeMoviesListTitle(null)).toBe('All');
    expect(homeMoviesListTitle(undefined)).toBe('All');
    expect(homeMoviesListTitle('millie')).toBe('Millie');
  });

  it('homeMoviesListTitle names a month scope by its own label, taking priority over a person (TASK-491)', () => {
    expect(homeMoviesListTitle(null, '2026-08')).toBe('Aug 2026');
    expect(homeMoviesListTitle('millie', '2026-08')).toBe('Aug 2026');
  });

  it('homeMoviesSourceLabel names the Queue hero by the source scope: a month, a kid, or "All" (TASK-499)', () => {
    expect(homeMoviesSourceLabel('home-movie-month', '2026-08')).toBe('Aug 2026');
    expect(homeMoviesSourceLabel('home-movies-by-person', 'millie')).toBe('Millie');
    // The whole-catalog Play All source: "All", NOT its own source id
    // title-cased — the id is a scope name, never something a viewer reads.
    expect(homeMoviesSourceLabel('home-movies-all', 'home-movies-all')).toBe('All');
  });

  it('homeMoviesListItems with no person returns every home-movie clip, newest first, wrapped as {video}', () => {
    const items = homeMoviesListItems(HOME, null);
    expect(items.map(i => i.video.id)).toEqual(['m-park', 'both', 'o-swim', 'm-walk', 'plain']);
    expect(items.every(i => i.video)).toBe(true);
  });

  it('homeMoviesListItems excludes non-home-movie cards even with no person scope', () => {
    expect(homeMoviesListItems(HOME, null).some(i => i.video.id === 'film-a')).toBe(false);
  });

  it('homeMoviesListItems scoped to a person returns only that person\'s tagged clips, newest first', () => {
    const items = homeMoviesListItems(HOME, 'millie');
    expect(items.map(i => i.video.id)).toEqual(['m-park', 'both', 'm-walk']);
  });

  it('homeMoviesListItems scoped to a person with no clips is empty', () => {
    expect(homeMoviesListItems(HOME, 'nemo')).toEqual([]);
  });

  // The capture-date tie-break (TASK-444, once shared with the person browse
  // rails TASK-502 removed): two clips captured on the same day fall back to
  // A-Z by title, and two undated clips tie the same way rather than keeping
  // catalog order.
  it('homeMoviesListItems tie-breaks two clips captured on the same date A-Z by title', () => {
    const sameDate = [
      { kind: 'video', id: 'b', title: 'B Clip', section: 'home-movies', people: ['millie'], tags: { date: '2026-01-01' } },
      { kind: 'video', id: 'a', title: 'A Clip', section: 'home-movies', people: ['millie'], tags: { date: '2026-01-01' } }
    ];
    expect(homeMoviesListItems(sameDate, 'millie').map(i => i.video.id)).toEqual(['a', 'b']);
  });

  it('homeMoviesListItems tie-breaks two undated clips A-Z by title, after every dated one', () => {
    const mixed = [
      { kind: 'video', id: 'z-undated', title: 'Z Undated', section: 'home-movies', people: ['millie'] },
      { kind: 'video', id: 'a-undated', title: 'A Undated', section: 'home-movies', people: ['millie'] },
      { kind: 'video', id: 'dated', title: 'Dated', section: 'home-movies', people: ['millie'], tags: { date: '2026-01-01' } }
    ];
    expect(homeMoviesListItems(mixed, 'millie').map(i => i.video.id)).toEqual(['dated', 'a-undated', 'z-undated']);
  });

  it('homeMoviesListItems tolerates null/undefined cards', () => {
    expect(homeMoviesListItems(null, 'millie')).toEqual([]);
    expect(homeMoviesListItems(undefined, null)).toEqual([]);
  });

  it('homeMoviesListItems scoped to a month returns only that month\'s clips, newest first, undated clips excluded (TASK-491)', () => {
    const withFeb = HOME.concat([{ kind: 'video', id: 'feb-clip', title: 'Feb Clip', section: 'home-movies', tags: { date: '2026-02-01' } }]);
    const items = homeMoviesListItems(withFeb, null, '2026-01');
    expect(items.map(i => i.video.id)).toEqual(['m-park', 'both', 'o-swim', 'm-walk']);
  });

  it('homeMoviesListItems scoped to a month with no clips is empty', () => {
    expect(homeMoviesListItems(HOME, null, '2026-12')).toEqual([]);
  });

  it('homeMoviesListPlayParams carries the scope + an optional tapped-row video id', () => {
    expect(homeMoviesListPlayParams(null, undefined)).toEqual({ from: 'home-movies-list', homeMoviesAll: 1, video: undefined });
    expect(homeMoviesListPlayParams('millie', undefined)).toEqual({ from: 'home-movies-list', homeMoviesPerson: 'millie', video: undefined });
    expect(homeMoviesListPlayParams('millie', 'm-walk')).toEqual({ from: 'home-movies-list', homeMoviesPerson: 'millie', video: 'm-walk' });
  });

  it('homeMoviesListPlayParams carries a month scope instead, taking priority over a person (TASK-491)', () => {
    expect(homeMoviesListPlayParams(null, undefined, '2026-08')).toEqual({ from: 'home-movies-list', homeMoviesMonth: '2026-08', video: undefined });
    expect(homeMoviesListPlayParams('millie', 'm-walk', '2026-08')).toEqual({ from: 'home-movies-list', homeMoviesMonth: '2026-08', video: 'm-walk' });
  });
});

// Defensive/fallback branches — falsy fields, missing sections, inherited props,
// and null inputs that the readers must tolerate (TASK-315 coverage floor).
describe('home-rails edge-case fallbacks (TASK-315)', () => {
  it('withDurationSec copies only OWN properties (ignores inherited)', () => {
    var proto = { inherited: 'should-not-copy' };
    var card = Object.create(proto);
    card.kind = 'video'; card.id = 'v'; card.title = 'V'; card.duration = 42;
    var item = buildRails([card], {}).find(r => r.id === 'films').items[0];
    expect(item.hasOwnProperty('inherited')).toBe(false);
    expect(item.durationSec).toBe(42);
  });

  it('an unstamped card (no section) falls back to the Films section', () => {
    var card = { kind: 'video', id: 'legacy', title: 'Legacy' };   // no `section`
    expect(buildTabs([card]).map(t => t.id)).toEqual(['films']);
    expect(buildTabRails('films', [card], [], {})[0].items.map(c => c.id)).toEqual(['legacy']);
  });

  it('labelFor title-cases the slug when genreLabels is omitted (undefined)', () => {
    var card = { kind: 'video', id: 'x', title: 'X', section: 'films', genres: ['rom-com'] };
    // genreLabels arg omitted -> labelFor sees undefined labels -> `labels || {}`
    expect(buildTabRails('films', [card], []).find(r => r.id.startsWith('genre:')).title).toBe('Rom Com');
  });

  it('sorts rail items with missing titles as empty strings (both operands, no throw)', () => {
    var cards = [
      { kind: 'series', id: 'a', section: 'music', artist: 'Z' },   // no title
      { kind: 'series', id: 'b', section: 'music', artist: 'Z' }    // no title -> cmp('','') both fall back
    ];
    var albums = buildTabRails('music', cards, [], {}).find(r => r.id === 'albums');
    expect(albums.items.map(c => c.id).sort()).toEqual(['a', 'b']); // both present, no throw
  });

  it('a CW row absent from the browse cards resolves to no section and is dropped', () => {
    var cards = [{ kind: 'video', id: 'toy-story', title: 'Toy Story', section: 'films' }];
    var cw = [
      { item_id: 'toy-story', title: 'Toy Story', position_secs: 100, duration_secs: 600, collection_id: null, collection_title: null },
      { item_id: 'ghost-item', title: 'Ghost', position_secs: 5, duration_secs: 60, collection_id: null, collection_title: null } // not in cards -> rowCard null
    ];
    var cwRail = buildTabRails('films', cards, cw, {})[0];
    expect(cwRail.id).toBe('continue');
    expect(cwRail.items.map(c => c.id)).toEqual(['toy-story']); // orphan row dropped, no throw
  });

  it('cwCard uses an empty label when a row has no title (with and without a collection)', () => {
    var cards = [
      { kind: 'series', id: 'ootb', title: 'Out of the Blue', section: 'home-movies' },
      { kind: 'video', id: 'lone', title: 'Lone', section: 'home-movies' }
    ];
    var cw = [
      { item_id: 'ootb-02', collection_id: 'ootb', collection_title: 'Out of the Blue', position_secs: 10, duration_secs: 200 }, // no title, has collection
      { item_id: 'lone', collection_id: null, collection_title: null, position_secs: 10, duration_secs: 200 }                    // no title, standalone
    ];
    var cwRail = buildTabRails('home-movies', cards, cw, {})[0];
    var byId = Object.fromEntries(cwRail.items.map(i => [i.id, i]));
    expect(byId['ootb-02'].title).toBe('Out of the Blue · ');  // collection prefix, empty episode title
    expect(byId['lone'].title).toBe('');                        // standalone, empty title
  });

  it('buildTabRails tolerates null cards', () => {
    expect(buildTabRails('films', null, [], {})).toEqual([]);
    expect(buildTabRails('home-movies', null, [], {})).toEqual([]);
    expect(buildTabRails('music', null, [], {})).toEqual([]);
  });

  it('Home Movies groups by people regardless of `kind` (TASK-444 drops the kind split)', () => {
    var cards = [{ id: 'no-kind', title: 'No Kind', section: 'home-movies' }]; // kind absent, no people -> Other
    // Since TASK-502 that grouping renders no rail of its own; the Other group
    // shows up as the Play All rail existing at all (it is omitted when the
    // grouping is empty), with no tile of its own.
    var playAll = buildTabRails('home-movies', cards, [], {}).find(r => r.id === 'home-movies-play-all');
    expect(playAll.items.map(t => t.title)).toEqual(['All']);
  });

  it('albumsByArtist ignores non-music and other-artist cards (filter short-circuits)', () => {
    var cards = [
      { kind: 'series', id: 'ootb', title: 'Out of the Blue', section: 'music', artist: 'ELO', tags: { year: '1977' } },
      { kind: 'series', id: 'rumours', title: 'Rumours', section: 'music', artist: 'Fleetwood Mac' }, // music, different artist
      { kind: 'video', id: 'film', title: 'Film', section: 'films', artist: 'ELO' }                   // non-music (artist ignored)
    ];
    expect(albumsByArtist(cards, 'ELO').map(c => c.id)).toEqual(['ootb']);
  });

  it('albumsByArtist tie-breaks equal-year albums, tolerating missing titles on both sides', () => {
    var cards = [
      { kind: 'series', id: 'y1', section: 'music', artist: 'X', tags: { year: '1990' } },   // same year, no title
      { kind: 'series', id: 'y2', section: 'music', artist: 'X', tags: { year: '1990' } }    // same year, no title -> cmp('','')
    ];
    // equal years -> the tie-break compares both (missing) titles as '' -> no throw.
    expect(albumsByArtist(cards, 'X').map(c => c.id).sort()).toEqual(['y1', 'y2']);
  });

  it('albumsByArtist tolerates null cards', () => {
    expect(albumsByArtist(null, 'X')).toEqual([]);
  });
});

// TASK-327 mutation-hardening: inputs whose natural order differs from the sorted
// output, exact-value assertions, and the null-guard empties.
describe('home-rails mutation hardening (TASK-327)', () => {
  it('withDurationSec keeps an existing durationSec when the card carries no `duration`', () => {
    var item = buildRails([{ kind: 'video', id: 'x', title: 'X', durationSec: 300 }], {}).find(r => r.id === 'films').items[0];
    expect(item.durationSec).toBe(300);
  });

  it('buildRails titles the Series and Films rails', () => {
    var rails = buildRails(cards, {});
    expect(rails.find(r => r.id === 'series').title).toBe('Series');
    expect(rails.find(r => r.id === 'films').title).toBe('Films');
  });

  it('the Series tab uses the "TV Series" title', () => {
    expect(buildTabs([{ kind: 'series', id: 'bluey', title: 'Bluey', section: 'series' }])[0].title).toBe('TV Series');
  });

  it('a CW row whose collection_id is off-page still shows via the item own card', () => {
    var only = [{ kind: 'video', id: 'toy-story', title: 'Toy Story', section: 'films' }];
    var cw = [{ item_id: 'toy-story', collection_id: 'gone', collection_title: 'Gone', position_secs: 100, duration_secs: 600 }];
    var rail = buildTabRails('films', only, cw, {})[0];
    expect(rail.id).toBe('continue');
    expect(rail.items.map(c => c.id)).toEqual(['toy-story']);
    // TASK-542 — no card for the collection means no type to carry, and the
    // tile falls back to a standalone open rather than guessing a queue.
    expect(rail.items[0].collectionType).toBeNull();
  });

  it('a films card with neither genres nor a type lands in an "Other" rail', () => {
    var rail = buildTabRails('films', [{ kind: 'video', id: 'z', title: 'Z', section: 'films' }], [], {}).find(r => r.id.startsWith('genre:'));
    expect(rail.title).toBe('Other');
    expect(rail.items.map(c => c.id)).toEqual(['z']);
  });

  it('genre rails AND their items sort A-Z from reverse-ordered input', () => {
    var revd = [
      { kind: 'video', id: 'z1', title: 'Zzz', section: 'films', genres: ['zeta'] },
      { kind: 'video', id: 'a1', title: 'Aaa', section: 'films', genres: ['alpha'] },
      { kind: 'video', id: 'a2', title: 'Aab', section: 'films', genres: ['alpha'] }
    ];
    var rails = buildTabRails('films', revd, [], {});
    expect(rails.map(r => r.title)).toEqual(['Alpha', 'Zeta']);           // rails A-Z
    expect(rails[0].items.map(c => c.id)).toEqual(['a1', 'a2']);          // items A-Z within
  });

  it('sorting is case-insensitive (a mixed-case rail is A-Z, not ASCII case order)', () => {
    var pl = [
      { kind: 'series', id: 'z', title: 'zebra', section: 'music', collectionType: 'playlist' },
      { kind: 'series', id: 'a', title: 'Apple', section: 'music', collectionType: 'playlist' }
    ];
    var rail = buildTabRails('music', pl, [], {}).find(r => r.id === 'playlists');
    expect(rail.items.map(c => c.id)).toEqual(['a', 'z']);   // Apple before zebra
  });

  it('a rail sorts an untitled item as empty-string, before a titled one', () => {
    var pl = [
      { kind: 'series', id: 'titled', title: 'Middle', section: 'music', collectionType: 'playlist' },
      { kind: 'series', id: 'untitled', section: 'music', collectionType: 'playlist' }
    ];
    var rail = buildTabRails('music', pl, [], {}).find(r => r.id === 'playlists');
    expect(rail.items.map(c => c.id)).toEqual(['untitled', 'titled']);
  });

  it('the Artists rail is A-Z from reverse-ordered input, and indexes only music cards', () => {
    var revd = [
      { kind: 'series', id: 'z-alb', title: 'ZA', section: 'music', artist: 'Zeta', poster: 'z.jpg' },
      { kind: 'series', id: 'a-alb', title: 'AA', section: 'music', artist: 'Alpha', poster: 'a.jpg' },
      { kind: 'video',  id: 'film',  title: 'Film', section: 'films', artist: 'Alpha' }   // non-music: must not inflate Alpha
    ];
    var artists = buildTabRails('music', revd, [], {}).find(r => r.id === 'artists');
    expect(artists.items.map(c => c.title)).toEqual(['Alpha', 'Zeta']);
    expect(artists.items.find(c => c.artist === 'Alpha').subLabel).toBe('1 album');
  });

  it('Recently Played resolves only music sources (a films id is not indexed)', () => {
    var only = [{ kind: 'video', id: 'toy-story', title: 'Toy Story', section: 'films' }];
    var rails = buildTabRails('music', only, [], {}, [{ source_type: 'album', source_id: 'toy-story', last_played: 1 }]);
    expect(rails.some(r => r.id === 'recent')).toBe(false);
  });

  it('the music rails carry their titles (Playlists / Artists / Albums)', () => {
    var rails = buildTabRails('music', WITH_PLAYLISTS, [], {});
    expect(rails.find(r => r.id === 'playlists').title).toBe('Playlists');
    expect(rails.find(r => r.id === 'artists').title).toBe('Artists');
    expect(rails.find(r => r.id === 'albums').title).toBe('Albums');
  });

  it('albumsByArtist orders newest-year first from reverse input, tie-breaking equal years by title', () => {
    var recs = [
      { kind: 'series', id: 'old',  title: 'Old',  section: 'music', artist: 'X', tags: { year: '1990' } },
      { kind: 'series', id: 'new',  title: 'New',  section: 'music', artist: 'X', tags: { year: '2020' } },
      { kind: 'series', id: 'same-z', title: 'Zed', section: 'music', artist: 'X', tags: { year: '2020' } }
    ];
    // 2020s A-Z (New < Zed), then 1990.
    expect(albumsByArtist(recs, 'X').map(c => c.id)).toEqual(['new', 'same-z', 'old']);
  });

  it('albumsByArtist tie-breaks an equal-year pair where ONE album is untitled', () => {
    var recs = [
      { kind: 'series', id: 'titled',  title: 'Beta', section: 'music', artist: 'X', tags: { year: '2020' } },
      { kind: 'series', id: 'untitled',               section: 'music', artist: 'X', tags: { year: '2020' } }
    ];
    // same year -> title tiebreak; the untitled one falls back to '' and sorts first.
    expect(albumsByArtist(recs, 'X').map(c => c.id)).toEqual(['untitled', 'titled']);
  });

  it('empty content yields no rails (the continueRail / recentlyPlayedRail null-guards return [])', () => {
    expect(buildTabRails('films', [], null, {})).toEqual([]);
    expect(buildTabRails('music', [], [], {}, null)).toEqual([]);
  });

  it('the synthesised Playlists rail lands right after Recently Played, keeping the rails below it', () => {
    var out = withPlaylistsRail([
      { id: 'recent', title: 'Recently Played', items: [] },
      { id: 'artists', title: 'Artists', items: [] },
      { id: 'albums', title: 'Albums', items: [] }
    ]);
    expect(out.map(r => r.id)).toEqual(['recent', 'playlists', 'artists', 'albums']);
  });
});
