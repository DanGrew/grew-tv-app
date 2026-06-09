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
  'ootb-02':          { id: 'ootb-02',          title: 'Mr. Blue Sky',     profile: 'kids',   duration: 245,  poster: 'ootb.jpg',      subtitles: null, mediaType: 'audio', ext: 'm4a', artist: 'ELO',  available: true },
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

// FEAT-018 albums: a series row format:"album"; items[].episode is the track
// number. /api/album/{id} resolves to this shape (same as /api/series).
// Browse cards for the music tab (FEAT-018). Kept out of the default BROWSE so
// the existing video-only tests still see exactly Series/Films/Home Movies; the
// music e2e overrides /api/browse to append these.
const MUSIC_CARDS = [
  { kind: 'series', id: 'ootb',          title: 'Out of the Blue', poster: 'ootb.jpg', type: null, format: 'album', artist: 'ELO',  clipCount: 3 },
  { kind: 'video',  id: 'dancing-queen', title: 'Dancing Queen',   poster: 'dq.jpg',   type: null, format: null,    mediaType: 'audio', artist: 'ABBA', duration: 230 }
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
      { kind: 'video',  id: 'toy-story-main',    title: 'Toy Story',    poster: 'toy-story.jpg', duration: 4860, type: 'animation', format: 'film',       genres: ['animation', 'comedy'], people: null },
      { kind: 'video',  id: 'finding-nemo-main', title: 'Finding Nemo', poster: 'nemo.jpg',      duration: 6000, type: 'animation', format: 'film',       genres: null,                    people: null },
      { kind: 'series', id: 'bluey',             title: 'Bluey',        poster: 'bluey.jpg',                     type: 'animation', format: 'tv-series',  genres: ['animation'],           people: null },
      { kind: 'video',  id: 'millie-walk',       title: 'Millie Walk',  poster: 'millie.jpg',    duration: 30,   type: 'home',      format: 'home-movie', genres: null,                    people: ['millie'] }
    ]
  },
  adults: {
    profile: 'adults',
    genreLabels: {},
    content: [
      { kind: 'video', id: 'dark-knight-main', title: 'The Dark Knight', poster: 'dk.jpg', duration: 9120, type: 'action', format: 'film', genres: ['action'], people: null }
    ]
  }
};

// Continue-watching is empty by default; tests that exercise the CW rail
// override the route with their own payload.
const CONTINUE = {
  kids:   { profile: 'kids',   content: [] },
  adults: { profile: 'adults', content: [] }
};

// Profiles + Adults PIN gate (GET /media/config.json, TASK-120). Kids open,
// Adults locked behind PIN 1234. Photos null -> emoji placeholder. Tests that
// exercise photos or a different PIN override the route.
const CONFIG = {
  pin: '1234',
  profiles: [
    { id: 'kids',   label: 'Kids',   locked: false, photo: null },
    { id: 'adults', label: 'Adults', locked: true,  photo: null }
  ]
};

// Per-video watch progress (GET /api/progress/{id}). Empty by default — every
// video reads as the zero-state record; tests that need a resume point override
// the route. Backend is the FEAT-017 source of truth, not localStorage.
const PROGRESS = {};

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
  var settings = { captionsOn: true };
  await page.route('**/api/settings', function(route) {
    var post = route.request().method() === 'POST';
    [post].filter(Boolean).forEach(function() { settings = JSON.parse(route.request().postData()); });
    return json(route, 200, settings);
  });
  await page.route('**/api/browse**', function(route) {
    var profile = new URL(route.request().url()).searchParams.get('profile');
    return json(route, 200, BROWSE[profile] || { profile: profile, content: [] });
  });
  await page.route('**/api/continue-watching**', function(route) {
    var profile = new URL(route.request().url()).searchParams.get('profile');
    return json(route, 200, CONTINUE[profile] || { profile: profile, content: [] });
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
    var id = lastSegment(route.request().url(), '/api/progress/');
    var p = PROGRESS[id] || { item_id: id, position_secs: 0, duration_secs: null, completed: false, last_watched: null };
    return json(route, 200, p);
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

module.exports = { VIDEOS, SERIES, ALBUMS, MUSIC_CARDS, BROWSE, CONTINUE, PROGRESS, CONFIG, nextOf, installApi };
