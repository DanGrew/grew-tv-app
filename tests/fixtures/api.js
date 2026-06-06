// v3 API fixtures (FEAT-016) + a Playwright route installer. The app talks to
// /api/browse, /api/video/{id}, /api/series/{id}, /api/next/{s}/{v} and streams
// content from /media/{name}; these routes stand in for the media-manager.

const VIDEOS = {
  'toy-story-main':   { id: 'toy-story-main',   title: 'Toy Story',        profile: 'kids',   duration: 4860, poster: 'toy-story.jpg', subtitles: 'toy-story-main.vtt', type: 'animation', format: 'film',      tags: { year: '1995' }, available: true },
  'finding-nemo-main':{ id: 'finding-nemo-main',title: 'Finding Nemo',     profile: 'kids',   duration: 6000, poster: 'nemo.jpg',      subtitles: null,                type: 'animation', format: 'film',      tags: null, available: true },
  'dark-knight-main': { id: 'dark-knight-main', title: 'The Dark Knight',  profile: 'adults', duration: 9120, poster: 'dk.jpg',        subtitles: null,                type: 'action',    format: 'film',      tags: null, available: true },
  'bluey-s1e01':      { id: 'bluey-s1e01',      title: 'Daddy Putdown',    profile: 'kids',   duration: 420,  poster: 'bluey.jpg',     subtitles: 'bluey-s1e01.vtt',   type: 'animation', format: 'tv-series', tags: null, available: true },
  'bluey-s1e02':      { id: 'bluey-s1e02',      title: 'The Weekend',      profile: 'kids',   duration: 430,  poster: 'bluey.jpg',     subtitles: null,                type: 'animation', format: 'tv-series', tags: null, available: true },
  'bluey-s1e03':      { id: 'bluey-s1e03',      title: 'Hammerbarn',       profile: 'kids',   duration: 440,  poster: 'bluey.jpg',     subtitles: null,                type: 'animation', format: 'tv-series', tags: null, available: true }
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

const BROWSE = {
  kids: {
    profile: 'kids',
    content: [
      { kind: 'video',  id: 'toy-story-main',    title: 'Toy Story',    poster: 'toy-story.jpg', duration: 4860, type: 'animation', format: 'film' },
      { kind: 'video',  id: 'finding-nemo-main', title: 'Finding Nemo', poster: 'nemo.jpg',      duration: 6000, type: 'animation', format: 'film' },
      { kind: 'series', id: 'bluey',             title: 'Bluey',        poster: 'bluey.jpg',                     type: 'animation', format: 'tv-series' }
    ]
  },
  adults: {
    profile: 'adults',
    content: [
      { kind: 'video', id: 'dark-knight-main', title: 'The Dark Knight', poster: 'dk.jpg', duration: 9120, type: 'action', format: 'film' }
    ]
  }
};

// Continue-watching is empty by default; tests that exercise the CW rail
// override the route with their own payload.
const CONTINUE = {
  kids:   { profile: 'kids',   content: [] },
  adults: { profile: 'adults', content: [] }
};

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
  await page.route('**/api/next/*/*', function(route) {
    var tail = route.request().url().split('/api/next/')[1].split('?')[0].split('/');
    return json(route, 200, { next: nextOf(decodeURIComponent(tail[0]), decodeURIComponent(tail[1])) });
  });
  await page.route('**/media/**', function(route) {
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
  });
}

module.exports = { VIDEOS, SERIES, BROWSE, CONTINUE, nextOf, installApi };
