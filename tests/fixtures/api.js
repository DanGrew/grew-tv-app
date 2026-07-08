// v3 API fixtures (FEAT-016) + a Playwright route installer. The app talks to
// /api/browse, /api/video/{id}, /api/series/{id}, /api/next/{s}/{v} and streams
// content from /media/{name}; these routes stand in for the media-manager.

const VIDEOS = {
  'toy-story-main':   { id: 'toy-story-main',   title: 'Toy Story',        profile: 'kids',   duration: 4860, poster: 'toy-story.jpg', subtitles: 'toy-story-main.vtt', type: 'animation', format: 'film',      tags: { year: '1995' }, available: true },
  'finding-nemo-main':{ id: 'finding-nemo-main',title: 'Finding Nemo',     profile: 'kids',   duration: 6000, poster: 'nemo.jpg',      subtitles: null,                type: 'animation', format: 'film',      tags: null, available: true },
  'dark-knight-main': { id: 'dark-knight-main', title: 'The Dark Knight',  profile: 'adults', duration: 9120, poster: 'dk.jpg',        subtitles: null,                type: 'action',    format: 'film',      tags: null, available: true },
  'bluey-s1e01':      { id: 'bluey-s1e01',      title: 'Daddy Putdown',    profile: 'kids',   duration: 420,  poster: 'bluey.jpg',     subtitles: 'bluey-s1e01.vtt',   type: 'animation', format: 'tv-series', tags: null, available: true },
  'bluey-s1e02':      { id: 'bluey-s1e02',      title: 'The Weekend',      profile: 'kids',   duration: 430,  poster: 'bluey.jpg',     subtitles: null,                type: 'animation', format: 'tv-series', tags: null, available: true },
  'bluey-s1e03':      { id: 'bluey-s1e03',      title: 'Hammerbarn',       profile: 'kids',   duration: 440,  poster: 'bluey.jpg',     subtitles: null,                type: 'animation', format: 'tv-series', tags: null, available: true },
  // FEAT-018 audio: album tracks + a standalone single. mediaType audio + ext m4a
  // drive {id}.m4a + the <audio> player; artist drives the now-playing line.
  'ootb-01':          { id: 'ootb-01',          title: 'Turn to Stone',    profile: 'kids',   duration: 227,  poster: 'ootb.jpg',      subtitles: null, mediaType: 'audio', ext: 'm4a', artist: 'ELO',  available: true },
  'ootb-02':          { id: 'ootb-02',          title: 'Mr. Blue Sky',     profile: 'kids',   duration: 245,  poster: 'ootb.jpg',      subtitles: null, mediaType: 'audio', ext: 'm4a', artist: 'ELO',  lyrics: 'ootb-02.lrc', available: true },
  'ootb-03':          { id: 'ootb-03',          title: 'Sweet Talkin Woman',profile: 'kids',  duration: 228,  poster: 'ootb.jpg',      subtitles: null, mediaType: 'audio', ext: 'm4a', artist: 'ELO',  available: true },
  'dancing-queen':    { id: 'dancing-queen',    title: 'Dancing Queen',    profile: 'kids',   duration: 230,  poster: 'dq.jpg',        subtitles: null, mediaType: 'audio', ext: 'm4a', artist: 'ABBA', available: true },
  // TASK-123: a multi-season series for the season-selector tests. Not on any
  // browse rail (opened by direct nav) so it can't disturb the rail-count suites.
  'ib-s1e1':          { id: 'ib-s1e1',          title: 'First Day',        profile: 'kids',   duration: 1500, poster: 'ib-s1e1.jpg',   subtitles: null, type: 'comedy', format: 'tv-series', tags: null, available: true },
  'ib-s1e2':          { id: 'ib-s1e2',          title: 'Bunk Off',         profile: 'kids',   duration: 1500, poster: 'ib-s1e2.jpg',   subtitles: null, type: 'comedy', format: 'tv-series', tags: null, available: true },
  'ib-s2e1':          { id: 'ib-s2e1',          title: 'The Field Trip',   profile: 'kids',   duration: 1500, poster: 'ib-s2e1.jpg',   subtitles: null, type: 'comedy', format: 'tv-series', tags: null, available: true }
};

const SERIES = {
  bluey: {
    id: 'bluey', title: 'Bluey', profile: 'kids', poster: 'bluey.jpg', type: 'animation', format: 'tv-series', tags: { year: '2018' },
    items: [
      { season: 1, episode: 1, video: VIDEOS['bluey-s1e01'] },
      { season: 1, episode: 2, video: VIDEOS['bluey-s1e02'] },
      { season: 1, episode: 3, video: VIDEOS['bluey-s1e03'] }
    ]
  },
  // TASK-122/123: carries seasons[] (per-season poster art) so /api/series drives
  // the season chip selector. Two seasons; bluey above stays seasons-less so the
  // legacy single-list + inline-divider path is still covered.
  inbetweeners: {
    id: 'inbetweeners', title: 'The Inbetweeners', profile: 'kids', poster: 'ib.jpg', type: 'comedy', format: 'tv-series', tags: { year: '2008' },
    seasons: [
      { season: 1, poster: 'ib-s1.jpg' },
      { season: 2, poster: 'ib-s2.jpg' }
    ],
    items: [
      { season: 1, episode: 1, video: VIDEOS['ib-s1e1'] },
      { season: 1, episode: 2, video: VIDEOS['ib-s1e2'] },
      { season: 2, episode: 1, video: VIDEOS['ib-s2e1'] }
    ]
  },
  // TASK-243: an album series (collectionType 'album') reached through /api/series,
  // so the shared companion detail screen can be driven into album context — where
  // it hides the Back button (the breadcrumb covers back). TV series above keep it.
  'ootb-album': {
    id: 'ootb-album', title: 'Out of the Blue', profile: 'kids', poster: 'ootb.jpg', collectionType: 'album', artist: 'ELO', tags: { year: '1977' },
    items: [
      { episode: 1, video: VIDEOS['ootb-01'] },
      { episode: 2, video: VIDEOS['ootb-02'] },
      { episode: 3, video: VIDEOS['ootb-03'] }
    ]
  }
};

// FEAT-018 albums: items[].episode is the track number. /api/album/{id} resolves
// to this shape (same as /api/series).
// Browse cards for the Music tab (FEAT-027): a series card with section:"music".
// A track is never a standalone browse card (a single is a 1-track album), so
// there is no audio-single card here. Kept out of the default BROWSE so the
// video-only tests still see exactly Series/Films/Home Movies; the music e2e
// overrides /api/browse to append these.
// Three albums across two artists (ELO x2, ABBA x1) so the FEAT-029 Artists rail
// shows multiple tiles and the artist drill-down can be filtered. Only `ootb`
// has a resolvable /api/album detail (ALBUMS below); the others exist to populate
// the Artists/Albums rails and the drill-down grid.
// `hasLyrics` (backend MAX(v.lyrics IS NOT NULL) over members) drives the Lyrics
// badge — ootb has a track with an .lrc (ootb-02), the others have none.
const MUSIC_CARDS = [
  { kind: 'series', id: 'ootb',         title: 'Out of the Blue', poster: 'ootb.jpg',    type: null, section: 'music', artist: 'ELO',  clipCount: 3, tags: { year: '1977' }, hasLyrics: true },
  { kind: 'series', id: 'elo-time',     title: 'Time',            poster: 'time.jpg',    type: null, section: 'music', artist: 'ELO',  clipCount: 2, tags: { year: '1981' } },
  { kind: 'series', id: 'abba-arrival', title: 'Arrival',         poster: 'arrival.jpg', type: null, section: 'music', artist: 'ABBA', clipCount: 2, tags: { year: '1976' } }
];

const ALBUMS = {
  ootb: {
    id: 'ootb', title: 'Out of the Blue', profile: 'kids', poster: 'ootb.jpg', format: 'album', artist: 'ELO',
    items: [
      { episode: 1, video: VIDEOS['ootb-01'] },
      { episode: 2, video: VIDEOS['ootb-02'] },
      { episode: 3, video: VIDEOS['ootb-03'] }
    ]
  }
};

// FEAT-036 playlists: a user playlist is state-DB-resident but /api/playlist/{id}
// projects it into the SAME detail shape as /api/album so the app reuses the
// album-detail layout. season/episode are null (a playlist is flat — no track
// numbers; episodeLabel falls back to the bare title). The cross-album order
// (an ELO track then an ABBA-less reuse) is preserved verbatim. An EMPTY playlist
// is valid (pl-empty) and must still list + open.
const PLAYLISTS = {
  'pl-roadtrip': {
    id: 'pl-roadtrip', title: 'Road Trip', profile: 'kids', collectionType: 'playlist', poster: null, seasons: [],
    coverArt: ['ootb.jpg', 'abba.jpg'],
    items: [
      { season: null, episode: null, video: VIDEOS['ootb-03'] },
      { season: null, episode: null, video: VIDEOS['ootb-01'] }
    ]
  },
  'pl-empty': {
    id: 'pl-empty', title: 'Empty Mix', profile: 'kids', collectionType: 'playlist', poster: null, seasons: [], items: []
  }
};

// Playlist browse cards (collectionType:'playlist', section music) — the backend
// projects them into get_browse_list. Injected by the playlist e2e onto the music
// browse so the Playlists rail renders; kept out of the default music cards.
const PLAYLIST_CARDS = [
  { kind: 'series', id: 'pl-roadtrip', title: 'Road Trip', poster: null, type: null, section: 'music', collectionType: 'playlist', artist: null, clipCount: 2, tags: null, coverArt: ['ootb.jpg', 'abba.jpg'] },
  { kind: 'series', id: 'pl-empty',    title: 'Empty Mix', poster: null, type: null, section: 'music', collectionType: 'playlist', artist: null, clipCount: 0, tags: null }
];

const BROWSE = {
  kids: {
    profile: 'kids',
    genreLabels: { animation: 'Animation', comedy: 'Comedy' },
    content: [
      { kind: 'video',  id: 'toy-story-main',    title: 'Toy Story',    poster: 'toy-story.jpg', duration: 4860, type: 'animation', section: 'films',       genres: ['animation', 'comedy'], people: null },
      { kind: 'video',  id: 'finding-nemo-main', title: 'Finding Nemo', poster: 'nemo.jpg',      duration: 6000, type: 'animation', section: 'films',       genres: null,                    people: null },
      { kind: 'series', id: 'bluey',             title: 'Bluey',        poster: 'bluey.jpg',                     type: 'animation', section: 'series',      genres: ['animation'],           people: null },
      { kind: 'video',  id: 'millie-walk',       title: 'Millie Walk',  poster: 'millie.jpg',    duration: 30,   type: 'home',      section: 'home-movies', genres: null,                    people: ['millie'] }
    ]
  },
  adults: {
    profile: 'adults',
    genreLabels: {},
    content: [
      { kind: 'video', id: 'dark-knight-main', title: 'The Dark Knight', poster: 'dk.jpg', duration: 9120, type: 'action', section: 'films', genres: ['action'], people: null }
    ]
  }
};

// Continue-watching + per-video progress are person-keyed and STATEFUL (FEAT-026
// TASK-155 / TASK-154 contract): a POST to /api/progress sticks for later GET and
// CW reads under the SAME ?person=, and a different person sees a different set —
// so switching the active person changes which resume / CW the app shows. The
// store is seeded per installApi() call (per test page) in installApi below.
// Both /api/progress and /api/continue-watching 400 when ?person= is absent,
// mirroring the backend. Tests that want fixed CW/resume still override the route.

// Persons + adult PIN gate (GET /media/config.json, FEAT-026 TASK-156). Two
// persons whose ids happen to match their content class (allowed) so the wider
// suite can drive the gate via #btn-kids / #btn-adults: the kid selects freely,
// the adult is gated behind the defaultPin 1234. Photos null -> emoji
// placeholder. Tests that exercise N persons, photos, per-person pins or absent
// config override this route.
const CONFIG = {
  defaultPin: '1234',
  persons: [
    { id: 'kids',   name: 'Kids',   profile: 'kids',   photo: null, emoji: '🦖' },
    { id: 'adults', name: 'Adults', profile: 'adults', photo: null }
  ]
};

function zeroProgress(id) {
  return { item_id: id, position_secs: 0, duration_secs: null, completed: false, last_watched: null };
}

// Mid-watch rows for a person's store: saved, started, not yet finished — the
// CW set (newest first by last_watched). Enriched with the video's title/poster
// the way the backend joins catalog metadata onto progress rows, so the Home
// Continue-Watching rail can render tiles. No `format`/`section` on the row
// (FEAT-027): the app borrows the section from the matching browse card. (Films
// only here: collection_* null — series-episode CW joins are exercised by the
// homeview suite's override.)
function midWatchRows(store) {
  return Object.keys(store).map(function(id) { return store[id]; })
    .filter(function(r) { return r.position_secs > 0 && r.position_secs < r.duration_secs; })
    .sort(function(a, b) { return (b.last_watched || 0) - (a.last_watched || 0); })
    .map(function(r) {
      var v = VIDEOS[r.item_id] || {};
      return { item_id: r.item_id, title: v.title, poster: v.poster, collection_id: null, collection_title: null, position_secs: r.position_secs, duration_secs: r.duration_secs, last_watched: r.last_watched };
    });
}

function nextOf(seriesId, videoId) {
  var s = SERIES[seriesId];
  if (!s) return null;
  var idx = s.items.findIndex(function(it) { return it.video.id === videoId; });
  return (idx > -1 && s.items[idx + 1]) ? s.items[idx + 1] : null;
}

function json(route, status, data) {
  return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(data) });
}

function lastSegment(url, marker) {
  return decodeURIComponent(url.split(marker)[1].split('?')[0]);
}

// Mirror the backend's server-generated id (db/playlist_store _slugify): lower,
// non-alnum -> '-', collapsed. Enough for the create e2e to predict the new id.
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// TASK-326: pure response builders — the objects installApi's routes emit, factored
// out of the route handlers so the stub<->contract shape test
// (tests/unit/stub-contract-shape.test.js) can call the SAME emission path without a
// browser. Each contract-covered route handler below delegates to one of these; the
// shape test binds their emitted key-sets to the backend's frozen contract fixtures.
function browseResponse(profile) {
  return BROWSE[profile] || { profile: profile, content: [] };
}
function videoResponse(id) { return VIDEOS[id]; }
function albumResponse(id) { return ALBUMS[id]; }
function playlistResponse(store, id) { return store[id]; }
function continueWatchingResponse(person, store) {
  // FEAT-045/TASK-317: `recents` (last 5 opened music sources, newest-first) rides
  // this response. Empty by default — the Recently Played rail is then omitted; a
  // test wanting it overrides the route with a populated `recents`.
  return { person: person, content: midWatchRows(store), recents: [] };
}

async function installApi(page) {
  // Global settings (FEAT-023). Stateful per install so a POST sticks for later
  // GETs — stickiness now lives in the backend, not localStorage. Default ON.
  // A POST is a partial patch (captionsOn and/or lyricsOn), merged like the
  // real backend.
  var settings = { captionsOn: true, lyricsOn: true };
  // Per-person progress store (FEAT-026): person id -> { itemId -> record }.
  // Stateful across this page so a saveProgress POST drives the same person's
  // later resume GET + CW. Different persons keep separate sets.
  var progress = {};
  // Per-install playlist store (FEAT-036). Cloned from the shared fixture so the
  // create / add-track routes can MUTATE (add a playlist, append a track) without
  // leaking state into another test that runs later in the same worker — the
  // earlier in-place mutation made pl-roadtrip grow a row across tests.
  var playlists = JSON.parse(JSON.stringify(PLAYLISTS));
  await page.route('**/api/settings', function(route) {
    var post = route.request().method() === 'POST';
    [post].filter(Boolean).forEach(function() { settings = Object.assign({}, settings, JSON.parse(route.request().postData())); });
    return json(route, 200, settings);
  });
  await page.route('**/api/browse**', function(route) {
    var profile = new URL(route.request().url()).searchParams.get('profile');
    return json(route, 200, browseResponse(profile));
  });
  await page.route('**/api/continue-watching**', function(route) {
    var person = new URL(route.request().url()).searchParams.get('person');
    if (!person) return json(route, 400, { error: 'person required' });
    return json(route, 200, continueWatchingResponse(person, progress[person] || {}));
  });
  await page.route('**/api/video/*', function(route) {
    var v = videoResponse(lastSegment(route.request().url(), '/api/video/'));
    return v ? json(route, 200, v) : json(route, 404, { error: 'not found' });
  });
  await page.route('**/api/series/*', function(route) {
    var s = SERIES[lastSegment(route.request().url(), '/api/series/')];
    return s ? json(route, 200, s) : json(route, 404, { error: 'not found' });
  });
  await page.route('**/api/album/*', function(route) {
    var a = albumResponse(lastSegment(route.request().url(), '/api/album/'));
    return a ? json(route, 200, a) : json(route, 404, { error: 'not found' });
  });
  await page.route('**/api/playlist/*', function(route) {
    var p = playlistResponse(playlists, lastSegment(route.request().url(), '/api/playlist/'));
    return p ? json(route, 200, p) : json(route, 404, { error: 'not found' });
  });
  // FEAT-036/TASK-208 playlist actions. create -> 200 + the created record (the
  // server mints the slug id); blank name -> 400. delete -> 204. create registers
  // the new playlist into PLAYLISTS so its detail (/api/playlist/{id}) then loads.
  await page.route('**/api/playlists/create', function(route) {
    var body = JSON.parse(route.request().postData());
    var name = (body.name || '').trim();
    if (!name) return json(route, 400, { error: 'name must not be blank' });
    var id = 'pl-' + slugify(name);
    playlists[id] = { id: id, title: name, profile: body.profile, collectionType: 'playlist', poster: null, seasons: [], items: [] };
    return json(route, 200, { id: id, name: name, profile: body.profile, track_ids: [], created: 't0', modified: 't0' });
  });
  await page.route('**/api/playlists/delete', function(route) {
    return route.fulfill({ status: 204, body: '' });
  });
  // FEAT-036/TASK-210 rename. 204 on success / 400 on a blank name; the id is
  // PERMANENT (not re-slugged), so we mutate the existing record's title in place so
  // a follow-up detail GET reflects the new name. An unknown playlist 400s.
  await page.route('**/api/playlists/rename', function(route) {
    var body = JSON.parse(route.request().postData());
    var name = (body.name || '').trim();
    var pl = playlists[body.playlist_id];
    if (!pl) return json(route, 400, { error: 'unknown playlist' });
    if (!name) return json(route, 400, { error: 'name must not be blank' });
    pl.title = name;
    return route.fulfill({ status: 204, body: '' });
  });
  // FEAT-036/TASK-206 add-track. The backend appends in order, gated catalog-known
  // AND profile-match, 204 on success / 400 on a bad/mismatched track. Here we
  // append the resolved track to the named playlist (so a follow-up detail GET
  // reflects it) and 204; an unknown playlist 400s, mirroring the contract.
  await page.route('**/api/playlists/add-track', function(route) {
    var body = JSON.parse(route.request().postData());
    var pl = playlists[body.playlist_id];
    if (!pl) return json(route, 400, { error: 'unknown playlist' });
    pl.items.push({ season: null, episode: null, video: VIDEOS[body.track_id] || { id: body.track_id } });
    return route.fulfill({ status: 204, body: '' });
  });
  // FEAT-036/TASK-212 add-source (bulk-add). Snapshot a whole album or another
  // playlist's CURRENT tracks onto the target (the server resolves source tracks
  // at add-time). 204 on success; 400 on unknown target/source or a self-add,
  // mirroring the backend contract.
  await page.route('**/api/playlists/add-source', function(route) {
    var body = JSON.parse(route.request().postData());
    var pl = playlists[body.playlist_id];
    if (!pl) return json(route, 400, { error: 'unknown playlist' });
    if (body.source_type === 'playlist' && body.source_id === body.playlist_id) return json(route, 400, { error: 'cannot add a playlist into itself' });
    var src = ({ album: ALBUMS[body.source_id], playlist: playlists[body.source_id] })[body.source_type];
    if (!src) return json(route, 400, { error: 'unknown source' });
    src.items.forEach(function(it) { pl.items.push({ season: null, episode: null, video: it.video }); });
    return route.fulfill({ status: 204, body: '' });
  });
  // FEAT-036/TASK-211 move-track. Swap the entry at `index` with its up/down
  // neighbour BY POSITION (so duplicates stay addressable); an off-end move is a
  // no-op. 204 / 400-on-unknown, mirroring the backend contract.
  await page.route('**/api/playlists/move-track', function(route) {
    var body = JSON.parse(route.request().postData());
    var pl = playlists[body.playlist_id];
    if (!pl) return json(route, 400, { error: 'unknown playlist' });
    var j = body.index + ({ up: -1, down: 1 })[body.direction];
    if (j >= 0 && j < pl.items.length) {
      var tmp = pl.items[body.index]; pl.items[body.index] = pl.items[j]; pl.items[j] = tmp;
    }
    return route.fulfill({ status: 204, body: '' });
  });
  // FEAT-036/TASK-211 remove-track. Drop the entry at `index` BY POSITION. 204 /
  // 400-on-unknown.
  await page.route('**/api/playlists/remove-track', function(route) {
    var body = JSON.parse(route.request().postData());
    var pl = playlists[body.playlist_id];
    if (!pl) return json(route, 400, { error: 'unknown playlist' });
    pl.items.splice(body.index, 1);
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/progress/*', function(route) {
    var req = route.request();
    var person = new URL(req.url()).searchParams.get('person');
    if (!person) return json(route, 400, { error: 'person required' });
    var id = lastSegment(req.url(), '/api/progress/');
    var store = progress[person] = progress[person] || {};
    if (req.method() === 'POST') {
      var body = JSON.parse(req.postData());
      store[id] = { item_id: id, position_secs: body.position_secs, duration_secs: body.duration_secs, completed: false, last_watched: Object.keys(store).length + 1 };
      return json(route, 200, store[id]);
    }
    return json(route, 200, store[id] || zeroProgress(id));
  });
  await page.route('**/api/next/*/*', function(route) {
    var tail = route.request().url().split('/api/next/')[1].split('?')[0].split('/');
    return json(route, 200, { next: nextOf(decodeURIComponent(tail[0]), decodeURIComponent(tail[1])) });
  });
  await page.route('**/media/**', function(route) {
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
  });
  // Registered after the generic /media route so it wins (Playwright: last match
  // first). The profile screen fetches this on load.
  await page.route('**/media/config.json', function(route) {
    return json(route, 200, CONFIG);
  });
  // TASK-297: companion pages now resolve the WS port from /api/config.wsPort
  // (core/server-config.js fetchWsUrl) instead of hardcoding 8766. Serve 8766 here
  // so the resolved ws url stays ws://host:8766 and the routeWebSocket(/:8766/)
  // stub below still matches. (The TV app still hardcodes 8766 via connectApp.)
  await page.route('**/api/config', function(route) {
    return json(route, 200, { wsPort: 8766, contentBase: '' });
  });
  // Default WebSocket stub (FEAT-026). Every screen boots connectApp(ws://:8766),
  // a port the app HARDCODES (core/server-config.js WS_PORT). With no route these
  // connect to whatever real media-manager is live on :8766 and register on its
  // shared device/person registry. Under parallel CI load many pages claim the
  // same person, one gets `person_busy`, the picker opens the take-over prompt, and
  // nav to browse never happens — the repo-wide e2e flake (74 cases, all stuck on
  // `#screen-browse` never appearing). routeWebSocket handles the socket locally
  // (we never call connectToServer) so nothing touches a real server. Grant
  // `person_active` so the picker proceeds immediately, no 600ms grace wait. Tests
  // needing a scripted verdict (profile.test.js busy/take-over, homeview BUG-008/009
  // intent capture) register their own routeWebSocket AFTER this; Playwright matches
  // most-recent-first, so theirs wins.
  await page.routeWebSocket(/:8766/, function(ws) {
    ws.onMessage(function(message) {
      var msg = JSON.parse(message);
      [msg].filter(function(m) { return m.type === 'activate_person' && m.payload.person_id; }).forEach(function(m) {
        ws.send(JSON.stringify({ type: 'person_active', payload: { person_id: m.payload.person_id, device_id: m.payload.device_id } }));
      });
    });
  });
}

// FEAT-031 (TASK-187): a faithful mini playback backend for the e2e player
// suites. The app is server-authoritative now — it POSTs to
// /api/playback/{action} and renders the `playback` snapshot the server pushes
// over the per-person WS relay. This stands in for media-manager: it applies a
// tiny engine to each action and pushes the resolved snapshot to the page, the
// same HTTP-action -> WS-snapshot loop the real backend runs (and replays the
// latest snapshot on (re)connect so the player re-syncs after a reload).
function albumOrder(albumId) {
  var a = ALBUMS[albumId];
  return a ? a.items.map(function(it) { return it.video.id; }) : [];
}

// TASK-214: an artist source resolves to every audio track by that artist (the
// id is the artist name, matching the `?artist=` param the audio page sends as
// source_id). Lets the e2e play-source action paint a real now-playing line.
function artistOrder(artist) {
  return Object.keys(VIDEOS).filter(function(k) {
    return VIDEOS[k].artist === artist && VIDEOS[k].mediaType === 'audio';
  });
}

// FEAT-036: a playlist source resolves to its stored track order (the id is the
// playlist id, matching the `?playlist=` param the audio page sends as source_id).
function playlistOrder(id) {
  var p = PLAYLISTS[id];
  return p ? p.items.map(function(it) { return it.video.id; }) : [];
}

function sourceOrder(type, id) {
  var BY_TYPE = { artist: artistOrder, playlist: playlistOrder };
  return (BY_TYPE[type] || albumOrder)(id);
}

async function installPlaybackBackend(page) {
  // TASK-188: a materialized queue (override + source permutation + next
  // permutation), so the Queue View renders all four sections and edits round
  // trip. Each row carries a STABLE entry_id (a counter, survives reorder) — the
  // contract the overlay keys remove/move on.
  // nowPos mirrors the backend `current_position` (updated by the `position`
  // action, echoed as now_playing.position, reset to 0 whenever now-playing
  // changes — like db/playback_engine.py). Only the now-playing track carries it;
  // queue entries stay at 0.
  var state = { now: null, nowPos: 0, shuffle: false, repeat: false, sourceType: null, sourceId: null, override: [], source: [], then: [] };
  var live = null;
  var seq = 0;
  function mkEntry(id) { seq += 1; return { entry_id: 'e' + seq, track_id: id }; }

  function resolve(id) {
    var v = VIDEOS[id] || { id: id };
    return { track_id: id, title: v.title, artist: v.artist, poster: v.poster, ext: v.ext, duration: v.duration, position: 0 };
  }
  function resolveEntry(e) { return Object.assign(resolve(e.track_id), { entry_id: e.entry_id }); }
  // THEN is gated on repeat ALONE (BUG-015): a non-repeat source ends on
  // permutation exhaustion, shuffle or not, so shuffle has no say. repeat off ->
  // [] (the view shows "Source ends"); repeat on -> the next permutation.
  function computeThen(order) {
    if (state.repeat) return order.map(mkEntry);
    return [];
  }
  // Pending "Play Next" hides the durable playing head (front when it is the
  // now-playing track) — it is playing, not pending (FEAT-040, mirrors the backend).
  function pendingOverride() {
    var q = state.override.slice();
    return (q[0] && q[0].track_id === state.now) ? q.slice(1) : q;
  }
  function snapshot() {
    return {
      person_id: 'kids',
      now_playing: [state.now].filter(Boolean).map(resolve).map(function(np) { np.position = state.nowPos; return np; }).concat([null])[0],
      play_next: pendingOverride().map(resolveEntry),
      from_source: state.source.map(resolveEntry),
      then: state.then.map(resolveEntry),
      shuffle: state.shuffle, repeat: state.repeat,
      source_type: state.sourceType, source_id: state.sourceId
    };
  }
  function push() {
    [live].filter(Boolean).forEach(function(ws) { ws.send(JSON.stringify({ type: 'playback', payload: snapshot() })); });
  }

  function moveIn(list, entryId, toIndex) {
    var i = list.findIndex(function(e) { return e.entry_id === entryId; });
    if (i < 0) return false;
    var e = list.splice(i, 1)[0];
    list.splice(toIndex, 0, e);
    return true;
  }
  // Single neighbour swap within whichever list holds the entry (the engine's
  // `direction` move — matches api/playback.py move-queue-entry without to_index).
  function swapDir(entryId, dir) {
    [state.override, state.source, state.then].forEach(function(list) {
      var i = list.findIndex(function(e) { return e.entry_id === entryId; });
      var j = dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return;
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    });
  }
  function dropEntry(list, entryId) { return list.filter(function(e) { return e.entry_id !== entryId; }); }

  var ENGINE = {
    'play-source': function(b) {
      var order = sourceOrder(b.source_type, b.source_id);
      state.sourceType = b.source_type; state.sourceId = b.source_id; state.shuffle = !!b.shuffle;
      state.now = order[0] || null; state.nowPos = 0;
      state.source = order.slice(1).map(mkEntry);
      state.then = computeThen(order); state.override = [];
    },
    // Skip-to / play a row: set now-playing. A matching queued pick is consumed;
    // a skip into the source advances the permutation past that track (so the
    // now-playing track never also sits in from_source).
    'play-track': function(b) {
      state.now = b.track_id; state.nowPos = 0;
      var queued = state.override.filter(function(e) { return e.track_id === b.track_id; })[0];
      [queued].filter(Boolean).forEach(function(e) { state.override = dropEntry(state.override, e.entry_id); });
      var i = sourceOrder(state.sourceType, state.sourceId).indexOf(b.track_id);
      [queued ? -1 : i].filter(function(x) { return x >= 0; }).forEach(function(x) {
        state.source = sourceOrder(state.sourceType, state.sourceId).slice(x + 1).map(mkEntry);
      });
    },
    // Advance (durable head, FEAT-040): drop the finished head (override front when
    // it is now-playing), then the new front (override, kept) or the source head
    // becomes now-playing — a played override entry STAYS in the queue (consumed
    // only when it finishes), a source entry is consumed as before.
    'next': function() {
      [state.override[0]].filter(function(e) { return e && e.track_id === state.now; })
        .forEach(function(e) { state.override = dropEntry(state.override, e.entry_id); });
      var nextEntry = state.override.concat(state.source)[0];
      [nextEntry].filter(Boolean).forEach(function(e) {
        state.now = e.track_id; state.nowPos = 0;
        state.source = dropEntry(state.source, e.entry_id);
      });
    },
    'previous': function() {},
    'toggle-shuffle': function() { state.shuffle = !state.shuffle; state.then = computeThen(sourceOrder(state.sourceType, state.sourceId)); },
    'toggle-repeat':  function() { state.repeat = !state.repeat; state.then = computeThen(sourceOrder(state.sourceType, state.sourceId)); },
    'queue-track':        function(b) { state.override.unshift(mkEntry(b.track_id)); },
    // FEAT-040/TASK-254: play the override-queue head WITHOUT consuming it (durable
    // head, resumable on re-entry — matches api/playback play-queue). Empty -> no-op.
    'play-queue':         function() {
      [state.override[0]].filter(Boolean).forEach(function(e) { state.now = e.track_id; state.nowPos = 0; });
    },
    'remove-queue-entry': function(b) {
      state.override = dropEntry(state.override, b.entry_id);
      state.source = dropEntry(state.source, b.entry_id);
      state.then = dropEntry(state.then, b.entry_id);
    },
    'move-queue-entry':   function(b) {
      [b.direction].filter(Boolean).forEach(function(dir) { swapDir(b.entry_id, dir); });
      [b.to_index].filter(function(x) { return x != null; }).forEach(function(ti) {
        moveIn(state.override, b.entry_id, ti) || moveIn(state.source, b.entry_id, ti) || moveIn(state.then, b.entry_id, ti);
      });
    },
    'position':           function(b) { state.nowPos = b.current_position; }
  };
  var NO_BROADCAST = { position: true };

  await page.routeWebSocket(/:8766/, function(ws) {
    live = ws;
    function reply(type, payload) { ws.send(JSON.stringify({ type: type, payload: payload })); }
    // Reconnect-restore: replay the latest snapshot so the player re-syncs.
    [state.now].filter(Boolean).forEach(push);
    // Satisfy the device/person handshake the screens run through on the way to
    // the player (TASK-158): grant the person lock + answer device listing so the
    // profile picker proceeds and content screens keep their lock.
    ws.onMessage(function(raw) {
      var m = JSON.parse(raw);
      var REPLY = {
        list_devices:    function() { reply('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }); },
        activate_person: function() { [m.payload.person_id].filter(Boolean).forEach(function(pid) { reply('person_active', { person_id: pid }); }); },
        register_companion: function() {},
        // TASK-189: a companion (re)connect asks for the current state; the real
        // backend replays the device context + app_state + last playback snapshot
        // over the per-person relay. The app_state carries the active person the
        // companion keys its POSTs on; the playback snapshot paints the Queue View.
        snapshot_request: function() {
          reply('context', { context_id: 'audio', version: 1 });
          reply('app_state', { person: 'kids', profile: 'kids', screen: 'player' });
          push();
        }
      };
      [REPLY[m.type]].filter(Boolean).forEach(function(fn) { fn(); });
    });
  });
  // GET /api/playback?person= -> read-only music snapshot (FEAT-040/TASK-254 Play
  // Queue). Registered before the action route; matched first for the query URL.
  await page.route(/\/api\/playback\?/, function(route) {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot()) });
  });
  await page.route('**/api/playback/*', function(route) {
    var action = decodeURIComponent(route.request().url().split('/api/playback/')[1].split('?')[0]);
    var body = JSON.parse(route.request().postData() || '{}');
    [ENGINE[action]].filter(Boolean).forEach(function(fn) { fn(body); });
    route.fulfill({ status: 204, body: '' });
    [NO_BROADCAST[action]].filter(function(x) { return !x; }).forEach(push);
  });
  // Seed the backend state before the page connects (no WS yet, so no push) — a
  // companion test stands up a playing source + queue, then navigates the page,
  // and the snapshot_request replay renders it. Mirrors driving the real backend.
  function seed(action, body) { [ENGINE[action]].filter(Boolean).forEach(function(fn) { fn(body || {}); }); }
  return { seed: seed, snapshot: snapshot };
}

// FEAT-037 (TASK-222): the VIDEO twin of installPlaybackBackend — a faithful mini
// video-playback backend for the persistent-player e2e. The series/boxset player is
// server-authoritative: it POSTs to /api/video-playback/{action} and renders the
// `video_playback` snapshot the server pushes over the per-person WS relay (a
// SEPARATE channel from music). This applies the index-based TASK-220 engine
// (next/prev walk + repeat-wrap, repeat defaults ON for a series) and pushes the
// resolved snapshot, the same HTTP-action -> WS-snapshot loop the real backend runs.
function seriesOrderIds(id) {
  var s = SERIES[id];
  return s ? s.items.map(function(it) { return it.video.id; }) : [];
}

async function installVideoPlaybackBackend(page) {
  var state = { sourceType: null, sourceId: null, idx: 0, repeat: false, queue: [], current: null };
  var live = null;
  function order() { return seriesOrderIds(state.sourceId); }
  function resolve(id) {
    var v = VIDEOS[id] || { id: id };
    return { item_id: id, title: v.title, poster: v.poster, duration: v.duration, subtitles: v.subtitles, type: v.type, ext: v.ext };
  }
  // FEAT-040/TASK-247: now_playing is the queued item when one is playing
  // (state.current), else the source item at the index.
  function nowPlayingId() { return [state.current].filter(Boolean).concat([order()[state.idx]])[0]; }
  // Pending queue = stored queue minus the now-playing head (it plays but stays
  // stored for resume; hidden from the displayed pending list — FEAT-040 play-queue).
  function pendingQueue() {
    var q = state.queue;
    return (q.length && state.current && q[0].video_id === state.current) ? q.slice(1) : q;
  }
  function snapshot() {
    var o = order();
    return {
      person_id: 'kids',
      now_playing: [nowPlayingId()].filter(Boolean).map(resolve).concat([null])[0],
      current_item_index: state.idx,
      items: o.map(resolve),
      override_queue: pendingQueue().map(function(e) { var r = resolve(e.video_id); r.entry_id = e.entry_id; return r; }),
      source_type: state.sourceType, source_id: state.sourceId,
      repeat: state.repeat, shuffle: false
    };
  }
  function push() {
    [live].filter(Boolean).forEach(function(ws) { ws.send(JSON.stringify({ type: 'video_playback', payload: snapshot() })); });
  }
  function wrap(i, len) { return ((i % len) + len) % len; }

  var ENGINE = {
    // repeat defaults ON for a series (the 'start again' loop) when not sent;
    // item_id starts on a chosen member (else item 0).
    'play-source': function(b) {
      state.sourceType = b.source_type; state.sourceId = b.source_id;
      state.repeat = b.repeat === undefined ? true : !!b.repeat;
      var i = order().indexOf(b.item_id);
      state.idx = i >= 0 ? i : 0;
    },
    'next': function() {
      var len = order().length;
      // the playing head is consumed only when advancing past it (it's the current).
      if (state.queue.length && state.current === state.queue[0].video_id) state.queue.shift();
      if (state.queue.length) { state.current = state.queue[0].video_id; return; }
      state.current = null;
      if (!len) return;
      state.idx = state.repeat ? wrap(state.idx + 1, len) : Math.min(state.idx + 1, len - 1);
    },
    'play-item': function(b) {
      var i = order().indexOf(b.item_id);
      state.current = null;
      state.idx = i >= 0 ? i : state.idx;
    },
    'play-video': function(b) {
      state.sourceType = null; state.sourceId = null; state.idx = 0;
      state.current = b.video_id;
    },
    'play-queue': function() {
      // play the FRONT without removing it (resumable; source kept). empty -> no-op.
      [state.queue[0]].filter(Boolean).forEach(function(e) { state.current = e.video_id; });
    },
    'queue-video': function(b) {
      // append (FEAT-040 fix): a newly-queued video goes to the END of the queue.
      state.queue.push({ entry_id: 'e' + (state.queue.length + 1), video_id: b.video_id });
    },
    'remove-queue-entry': function(b) {
      state.queue = state.queue.filter(function(e) { return e.entry_id !== b.entry_id; });
    },
    'move-queue-entry': function(b) {
      var i = state.queue.findIndex(function(e) { return e.entry_id === b.entry_id; });
      var j = i + (b.direction === 'up' ? -1 : 1);
      if (i < 0 || j < 0 || j >= state.queue.length) return;
      var tmp = state.queue[i]; state.queue[i] = state.queue[j]; state.queue[j] = tmp;
    },
    'previous': function() {
      var len = order().length;
      if (!len) return;
      state.idx = state.repeat ? wrap(state.idx - 1, len) : Math.max(state.idx - 1, 0);
    },
    'toggle-repeat': function() { state.repeat = !state.repeat; },
    'position': function() {}
  };
  var NO_BROADCAST = { position: true };

  await page.routeWebSocket(/:8766/, function(ws) {
    live = ws;
    function reply(type, payload) { ws.send(JSON.stringify({ type: type, payload: payload })); }
    // Reconnect-restore: replay the latest snapshot so the player re-syncs.
    [state.sourceType].filter(Boolean).forEach(push);
    // The device/person handshake the screens run through on the way to the player
    // (TASK-158): grant the lock + answer device listing so the picker proceeds.
    ws.onMessage(function(raw) {
      var m = JSON.parse(raw);
      var REPLY = {
        list_devices:    function() { reply('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }); },
        activate_person: function() { [m.payload.person_id].filter(Boolean).forEach(function(pid) { reply('person_active', { person_id: pid }); }); },
        register_companion: function() {},
        snapshot_request: function() {
          reply('context', { context_id: 'video', version: 1 });
          reply('app_state', { person: 'kids', profile: 'kids', screen: 'player' });
          push();
        }
      };
      [REPLY[m.type]].filter(Boolean).forEach(function(fn) { fn(); });
    });
  });
  // GET /api/video-playback?person= -> read-only snapshot (FEAT-040 Play Queue).
  // Registered before the action route; matched first for the query-form URL.
  await page.route(/\/api\/video-playback\?/, function(route) {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot()) });
  });
  await page.route('**/api/video-playback/*', function(route) {
    var action = decodeURIComponent(route.request().url().split('/api/video-playback/')[1].split('?')[0]);
    var body = JSON.parse(route.request().postData() || '{}');
    [ENGINE[action]].filter(Boolean).forEach(function(fn) { fn(body); });
    route.fulfill({ status: 204, body: '' });
    [NO_BROADCAST[action]].filter(function(x) { return !x; }).forEach(push);
  });
  function seed(action, body) { [ENGINE[action]].filter(Boolean).forEach(function(fn) { fn(body || {}); }); }
  return { seed: seed, snapshot: snapshot };
}

module.exports = {
  VIDEOS, SERIES, ALBUMS, MUSIC_CARDS, PLAYLISTS, PLAYLIST_CARDS, BROWSE, CONFIG, nextOf,
  installApi, installPlaybackBackend, installVideoPlaybackBackend,
  // TASK-326: pure response builders + the CW row builder, so the stub<->contract
  // shape test can exercise the exact objects the routes above emit.
  browseResponse, videoResponse, albumResponse, playlistResponse, continueWatchingResponse, midWatchRows
};
