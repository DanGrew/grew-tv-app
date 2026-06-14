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
  'dancing-queen':    { id: 'dancing-queen',    title: 'Dancing Queen',    profile: 'kids',   duration: 230,  poster: 'dq.jpg',        subtitles: null, mediaType: 'audio', ext: 'm4a', artist: 'ABBA', available: true }
};

const SERIES = {
  bluey: {
    id: 'bluey', title: 'Bluey', profile: 'kids', poster: 'bluey.jpg', type: 'animation', format: 'tv-series', tags: { year: '2018' },
    items: [
      { season: 1, episode: 1, video: VIDEOS['bluey-s1e01'] },
      { season: 1, episode: 2, video: VIDEOS['bluey-s1e02'] },
      { season: 1, episode: 3, video: VIDEOS['bluey-s1e03'] }
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
    { id: 'kids',   name: 'Kids',   profile: 'kids',   photo: null },
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
  await page.route('**/api/settings', function(route) {
    var post = route.request().method() === 'POST';
    [post].filter(Boolean).forEach(function() { settings = Object.assign({}, settings, JSON.parse(route.request().postData())); });
    return json(route, 200, settings);
  });
  await page.route('**/api/browse**', function(route) {
    var profile = new URL(route.request().url()).searchParams.get('profile');
    return json(route, 200, BROWSE[profile] || { profile: profile, content: [] });
  });
  await page.route('**/api/continue-watching**', function(route) {
    var person = new URL(route.request().url()).searchParams.get('person');
    if (!person) return json(route, 400, { error: 'person required' });
    return json(route, 200, { person: person, content: midWatchRows(progress[person] || {}) });
  });
  await page.route('**/api/video/*', function(route) {
    var v = VIDEOS[lastSegment(route.request().url(), '/api/video/')];
    return v ? json(route, 200, v) : json(route, 404, { error: 'not found' });
  });
  await page.route('**/api/series/*', function(route) {
    var s = SERIES[lastSegment(route.request().url(), '/api/series/')];
    return s ? json(route, 200, s) : json(route, 404, { error: 'not found' });
  });
  await page.route('**/api/album/*', function(route) {
    var a = ALBUMS[lastSegment(route.request().url(), '/api/album/')];
    return a ? json(route, 200, a) : json(route, 404, { error: 'not found' });
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
}

module.exports = { VIDEOS, SERIES, ALBUMS, MUSIC_CARDS, BROWSE, CONFIG, nextOf, installApi };
