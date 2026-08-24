import {
  loadBrowse, loadVideo, loadSeries, loadSeriesTitle, loadNext, loadProgress, saveProgress,
  loadContinueWatching, loadConfig, loadSettings, saveSettings, scanDevices,
  mediaUrl, loadLyrics, resetProgress, playbackAction, videoPlaybackAction, musicVideoPlaybackAction,
  loadVideoPlayback, loadMusicVideoPlayback, loadPlayback, loadAlbum, loadPlaylist, loadTracks, loadEpisodes, createPlaylist,
  addToPlaylist, addSourceToPlaylist, movePlaylistTrack, removeFromPlaylist,
  deletePlaylist, renamePlaylist, queuePlaybackAction, loadQueuePlayback
} from '../../core/app-api.js';

function fakeFetch(body, ok) {
  var calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: ok !== false, status: ok === false ? 500 : 200, json: async () => body, text: async () => body }; };
  return calls;
}

describe('loadBrowse', () => {
  it('GETs /api/browse with profile query, no-store', async () => {
    var calls = fakeFetch({ profile: 'kids', content: [] });
    await loadBrowse('http://s', 'kids');
    expect(calls[0].url).toBe('http://s/api/browse?profile=kids');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
  it('resolves parsed JSON', async () => {
    fakeFetch({ profile: 'kids', content: [{ id: 'a' }] });
    expect(await loadBrowse('http://s', 'kids')).toEqual({ profile: 'kids', content: [{ id: 'a' }] });
  });
  it('rejects on non-ok response', async () => {
    fakeFetch({}, false);
    await expect(loadBrowse('http://s', 'kids')).rejects.toBe(500);
  });
});

describe('loadVideo', () => {
  it('GETs /api/video/{id}', async () => {
    var calls = fakeFetch({ id: 'toy-story-main' });
    await loadVideo('http://s', 'toy-story-main');
    expect(calls[0].url).toBe('http://s/api/video/toy-story-main');
  });
});

describe('loadTracks', () => {
  it('GETs /api/tracks, no-store', async () => {
    var calls = fakeFetch({ tracks: [{ id: 'ootb-02', album_id: 'ootb' }] });
    await loadTracks('http://s');
    expect(calls[0].url).toBe('http://s/api/tracks');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
  it('unwraps the { tracks: [...] } envelope to the track array', async () => {
    fakeFetch({ tracks: [{ id: 'ootb-02', album_id: 'ootb' }] });
    expect(await loadTracks('http://s')).toEqual([{ id: 'ootb-02', album_id: 'ootb' }]);
  });
  it('yields an empty array when the envelope has no tracks', async () => {
    fakeFetch({});
    expect(await loadTracks('http://s')).toEqual([]);
  });
  it('rejects on a non-ok response', async () => {
    fakeFetch({}, false);
    await expect(loadTracks('http://s')).rejects.toBe(500);
  });
});

describe('loadEpisodes', () => {
  it('GETs /api/episodes, no-store', async () => {
    var calls = fakeFetch({ episodes: [{ id: 'bluey-s1e03', series_id: 'bluey' }] });
    await loadEpisodes('http://s');
    expect(calls[0].url).toBe('http://s/api/episodes');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
  it('unwraps the { episodes: [...] } envelope to the episode array', async () => {
    fakeFetch({ episodes: [{ id: 'bluey-s1e03', series_id: 'bluey' }] });
    expect(await loadEpisodes('http://s')).toEqual([{ id: 'bluey-s1e03', series_id: 'bluey' }]);
  });
  it('yields an empty array when the envelope has no episodes', async () => {
    fakeFetch({});
    expect(await loadEpisodes('http://s')).toEqual([]);
  });
  it('rejects on a non-ok response', async () => {
    fakeFetch({}, false);
    await expect(loadEpisodes('http://s')).rejects.toBe(500);
  });
});

describe('loadSeries', () => {
  it('GETs /api/series/{id}', async () => {
    var calls = fakeFetch({ id: 'bluey', items: [] });
    await loadSeries('http://s', 'bluey');
    expect(calls[0].url).toBe('http://s/api/series/bluey');
  });
});

describe('loadSeriesTitle', () => {
  it('GETs the same /api/series/{id} route and resolves just the title', async () => {
    var calls = fakeFetch({ id: 'bluey', title: 'Bluey', items: [] });
    expect(await loadSeriesTitle('http://s', 'bluey')).toBe('Bluey');
    expect(calls[0].url).toBe('http://s/api/series/bluey');
  });
  it('rejects on non-ok response rather than resolving undefined', async () => {
    fakeFetch({}, false);
    await expect(loadSeriesTitle('http://s', 'bluey')).rejects.toBe(500);
  });
});

describe('loadNext', () => {
  it('GETs /api/next/{series}/{video}', async () => {
    var calls = fakeFetch({ next: null });
    await loadNext('http://s', 'bluey', 'bluey-s1e01');
    expect(calls[0].url).toBe('http://s/api/next/bluey/bluey-s1e01');
  });
});

describe('loadProgress', () => {
  it('GETs /api/progress/{id} keyed by the active person, no-store (FEAT-026)', async () => {
    var calls = fakeFetch({ item_id: 'a', position_secs: 90, duration_secs: 600 });
    await loadProgress('http://s', 'a', 'oliver');
    expect(calls[0].url).toBe('http://s/api/progress/a?person=oliver');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
  it('url-encodes the person id', async () => {
    var calls = fakeFetch({ item_id: 'a', position_secs: 0 });
    await loadProgress('http://s', 'a', 'mum & dad');
    expect(calls[0].url).toBe('http://s/api/progress/a?person=mum%20%26%20dad');
  });
  it('resolves parsed JSON', async () => {
    fakeFetch({ item_id: 'a', position_secs: 90, duration_secs: 600 });
    expect(await loadProgress('http://s', 'a', 'oliver')).toEqual({ item_id: 'a', position_secs: 90, duration_secs: 600 });
  });
});

describe('saveProgress', () => {
  it('POSTs /api/progress/{id} carrying the active person id (FEAT-026 regression)', async () => {
    var calls = fakeFetch({ ok: true });
    await saveProgress('http://s', 'a', 90, 600, 'oliver');
    expect(calls[0].url).toBe('http://s/api/progress/a?person=oliver');
    expect(calls[0].opts.method).toBe('POST');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ position_secs: 90, duration_secs: 600 });
  });
});

describe('loadContinueWatching', () => {
  it('GETs /api/continue-watching with profile AND the active person (FEAT-026)', async () => {
    var calls = fakeFetch({ person: 'oliver', content: [] });
    await loadContinueWatching('http://s', 'kids', 'oliver');
    expect(calls[0].url).toBe('http://s/api/continue-watching?profile=kids&person=oliver');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
});

describe('loadConfig', () => {
  it('GETs /media/config.json from the content root', async () => {
    var calls = fakeFetch({ pin: '1234', profiles: [] });
    await loadConfig('http://s');
    expect(calls[0].url).toBe('http://s/media/config.json');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
  it('rejects when the file is absent', async () => {
    fakeFetch({}, false);
    await expect(loadConfig('http://s')).rejects.toBe(500);
  });
});

describe('loadSettings', () => {
  it('GETs /api/settings', async () => {
    var calls = fakeFetch({ captionsOn: true });
    await loadSettings('http://s');
    expect(calls[0].url).toBe('http://s/api/settings');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
  it('resolves parsed JSON', async () => {
    fakeFetch({ captionsOn: false });
    expect(await loadSettings('http://s')).toEqual({ captionsOn: false });
  });
});

describe('saveSettings', () => {
  it('POSTs /api/settings with the patch body verbatim', async () => {
    var calls = fakeFetch({ captionsOn: false });
    await saveSettings('http://s', { captionsOn: false });
    expect(calls[0].url).toBe('http://s/api/settings');
    expect(calls[0].opts.method).toBe('POST');
    expect(calls[0].opts.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(calls[0].opts.body)).toEqual({ captionsOn: false });
  });

  it('sends a partial lyricsOn patch', async () => {
    var calls = fakeFetch({ lyricsOn: false });
    await saveSettings('http://s', { lyricsOn: false });
    expect(JSON.parse(calls[0].opts.body)).toEqual({ lyricsOn: false });
  });
});

describe('scanDevices', () => {
  it('GETs /scan, no-store, resolving the parsed json', async () => {
    var calls = fakeFetch({ devices: ['TV'] });
    var res = await scanDevices('http://s');
    expect(calls[0].url).toBe('http://s/scan');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
    expect(res).toEqual({ devices: ['TV'] });   // resolves r.json(), not undefined
  });
});

// Every POST helper sends method:POST + the JSON content-type header + a JSON body
// to a fixed url. One table pins all four so no request-shape field goes unasserted.
describe('POST request shapes (method + json header + body + url)', () => {
  var posts = [
    { name: 'saveProgress', run: () => saveProgress('http://s', 'a', 90, 600, 'oliver'), url: 'http://s/api/progress/a?person=oliver', body: { position_secs: 90, duration_secs: 600 } },
    { name: 'playbackAction', run: () => playbackAction('http://s', 'next', 'mom', { track_id: 't1' }), url: 'http://s/api/playback/next?person=mom', body: { track_id: 't1' } },
    { name: 'videoPlaybackAction', run: () => videoPlaybackAction('http://s', 'play-source', 'dad', { source_id: 'bluey' }), url: 'http://s/api/video-playback/play-source?person=dad', body: { source_id: 'bluey' } },
    { name: 'musicVideoPlaybackAction', run: () => musicVideoPlaybackAction('http://s', 'play-video', 'kids', { video_id: 'mv-01' }), url: 'http://s/api/music-video-playback/play-video?person=kids', body: { video_id: 'mv-01' } },
    { name: 'saveSettings', run: () => saveSettings('http://s', { captionsOn: false }), url: 'http://s/api/settings', body: { captionsOn: false } },
    { name: 'createPlaylist', run: () => createPlaylist('http://s', 'My Mix', 'kids'), url: 'http://s/api/playlists/create', body: { name: 'My Mix', profile: 'kids', collection_type: 'playlist' } },
    { name: 'addToPlaylist', run: () => addToPlaylist('http://s', 'pl', 't1'), url: 'http://s/api/playlists/add-track', body: { playlist_id: 'pl', track_id: 't1' } },
    { name: 'addSourceToPlaylist', run: () => addSourceToPlaylist('http://s', 'pl', 'album', 'ootb'), url: 'http://s/api/playlists/add-source', body: { playlist_id: 'pl', source_type: 'album', source_id: 'ootb' } },
    { name: 'movePlaylistTrack', run: () => movePlaylistTrack('http://s', 'pl', 2, 'up'), url: 'http://s/api/playlists/move-track', body: { playlist_id: 'pl', index: 2, direction: 'up' } },
    { name: 'removeFromPlaylist', run: () => removeFromPlaylist('http://s', 'pl', 3), url: 'http://s/api/playlists/remove-track', body: { playlist_id: 'pl', index: 3 } },
    { name: 'deletePlaylist', run: () => deletePlaylist('http://s', 'pl-1'), url: 'http://s/api/playlists/delete', body: { playlist_id: 'pl-1' } },
    { name: 'renamePlaylist', run: () => renamePlaylist('http://s', 'pl', 'New Name'), url: 'http://s/api/playlists/rename', body: { playlist_id: 'pl', name: 'New Name' } }
  ];
  posts.forEach(function(p) {
    it(p.name + ' POSTs a JSON body to the right url', async () => {
      var calls = fakeFetch({ id: 'x' });
      await p.run();
      expect(calls[0].url).toBe(p.url);
      expect(calls[0].opts.method).toBe('POST');
      expect(calls[0].opts.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(calls[0].opts.body)).toEqual(p.body);
    });
  });
});

describe('loadLyrics', () => {
  it('GETs the .lrc from /media/{name}, no-store, resolving the raw text', async () => {
    var calls = fakeFetch('[00:06.00]hi');
    var text = await loadLyrics('http://s', 'ootb-02.lrc');
    expect(calls[0].url).toBe('http://s/media/ootb-02.lrc');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
    expect(text).toBe('[00:06.00]hi');
  });
  it('rejects on a missing/!ok response (caller falls back to no-lyrics)', async () => {
    fakeFetch('', false);
    await expect(loadLyrics('http://s', 'gone.lrc')).rejects.toBe(500);
  });
});

describe('mediaUrl', () => {
  it('builds /media/{name}', () => {
    expect(mediaUrl('http://s', 'toy-story-main.mp4')).toBe('http://s/media/toy-story-main.mp4');
  });
  it('returns empty string for falsy name', () => {
    expect(mediaUrl('http://s', null)).toBe('');
    expect(mediaUrl('http://s', '')).toBe('');
  });
});

// The `person || ''` guard: an absent person serializes to an empty query value
// (the backend 400s, but the client must still form a valid URL, never "undefined").
describe('person-keyed reads default an absent person to empty', () => {
  it('loadContinueWatching omits the person value when none passed', async () => {
    var calls = fakeFetch({ content: [] });
    await loadContinueWatching('http://s', 'kids');
    expect(calls[0].url).toBe('http://s/api/continue-watching?profile=kids&person=');
  });
  it('saveProgress omits the person value when none passed', async () => {
    var calls = fakeFetch({ ok: true });
    await saveProgress('http://s', 'a', 90, 600);
    expect(calls[0].url).toBe('http://s/api/progress/a?person=');
  });
  it('loadProgress omits the person value when none passed', async () => {
    var calls = fakeFetch({ item_id: 'a' });
    await loadProgress('http://s', 'a');
    expect(calls[0].url).toBe('http://s/api/progress/a?person=');
  });
});

describe('resetProgress', () => {
  it('DELETEs /api/progress/{id} keyed by the active person', async () => {
    var calls = fakeFetch({});
    await resetProgress('http://s', 'a', 'oliver');
    expect(calls[0].url).toBe('http://s/api/progress/a?person=oliver');
    expect(calls[0].opts.method).toBe('DELETE');
  });
  it('defaults an absent person to empty', async () => {
    var calls = fakeFetch({});
    await resetProgress('http://s', 'a');
    expect(calls[0].url).toBe('http://s/api/progress/a?person=');
  });
});

describe('playbackAction', () => {
  it('POSTs /api/playback/{action} with the person and body', async () => {
    var calls = fakeFetch({});
    await playbackAction('http://s', 'next', 'mom', { track_id: 't1' });
    expect(calls[0].url).toBe('http://s/api/playback/next?person=mom');
    expect(calls[0].opts.method).toBe('POST');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ track_id: 't1' });
  });
  it('defaults an absent person and body', async () => {
    var calls = fakeFetch({});
    await playbackAction('http://s', 'toggle-shuffle');
    expect(calls[0].url).toBe('http://s/api/playback/toggle-shuffle?person=');
    expect(JSON.parse(calls[0].opts.body)).toEqual({});
  });
});

describe('videoPlaybackAction', () => {
  it('POSTs /api/video-playback/{action} with the person and body', async () => {
    var calls = fakeFetch({});
    await videoPlaybackAction('http://s', 'play-source', 'dad', { source_id: 'bluey' });
    expect(calls[0].url).toBe('http://s/api/video-playback/play-source?person=dad');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ source_id: 'bluey' });
  });
  it('defaults an absent person and body', async () => {
    var calls = fakeFetch({});
    await videoPlaybackAction('http://s', 'next');
    expect(calls[0].url).toBe('http://s/api/video-playback/next?person=');
    expect(JSON.parse(calls[0].opts.body)).toEqual({});
  });
});

describe('musicVideoPlaybackAction', () => {
  it('POSTs /api/music-video-playback/{action} with the person and body', async () => {
    var calls = fakeFetch({});
    await musicVideoPlaybackAction('http://s', 'toggle-shuffle', 'kids', { foo: 1 });
    expect(calls[0].url).toBe('http://s/api/music-video-playback/toggle-shuffle?person=kids');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ foo: 1 });
  });
  it('defaults an absent person and body', async () => {
    var calls = fakeFetch({});
    await musicVideoPlaybackAction('http://s', 'next');
    expect(calls[0].url).toBe('http://s/api/music-video-playback/next?person=');
    expect(JSON.parse(calls[0].opts.body)).toEqual({});
  });
});

describe('queuePlaybackAction', () => {
  it('POSTs /api/queue/{mediaType}/{action} with the person and body', async () => {
    var calls = fakeFetch({});
    await queuePlaybackAction('http://s', 'home-movie', 'play-source', 'dad', { source_type: 'home-movies-by-person', source_id: 'millie' });
    expect(calls[0].url).toBe('http://s/api/queue/home-movie/play-source?person=dad');
    expect(calls[0].opts.method).toBe('POST');
    expect(calls[0].opts.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(calls[0].opts.body)).toEqual({ source_type: 'home-movies-by-person', source_id: 'millie' });
  });
  it('defaults an absent person and body', async () => {
    var calls = fakeFetch({});
    await queuePlaybackAction('http://s', 'home-movie', 'next');
    expect(calls[0].url).toBe('http://s/api/queue/home-movie/next?person=');
    expect(JSON.parse(calls[0].opts.body)).toEqual({});
  });
});

describe('loadQueuePlayback', () => {
  it('GETs /api/queue/{mediaType} keyed by person', async () => {
    var calls = fakeFetch({ queue: [] });
    await loadQueuePlayback('http://s', 'home-movie', 'mom');
    expect(calls[0].url).toBe('http://s/api/queue/home-movie?person=mom');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
  it('defaults an absent person', async () => {
    var calls = fakeFetch({});
    await loadQueuePlayback('http://s', 'home-movie');
    expect(calls[0].url).toBe('http://s/api/queue/home-movie?person=');
  });
});

describe('loadVideoPlayback / loadPlayback', () => {
  it('loadVideoPlayback GETs /api/video-playback keyed by person', async () => {
    var calls = fakeFetch({ override_queue: [] });
    await loadVideoPlayback('http://s', 'mom');
    expect(calls[0].url).toBe('http://s/api/video-playback?person=mom');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
  it('loadVideoPlayback defaults an absent person', async () => {
    var calls = fakeFetch({});
    await loadVideoPlayback('http://s');
    expect(calls[0].url).toBe('http://s/api/video-playback?person=');
  });
  it('loadPlayback GETs /api/playback keyed by person', async () => {
    var calls = fakeFetch({ play_next: [] });
    await loadPlayback('http://s', 'dad');
    expect(calls[0].url).toBe('http://s/api/playback?person=dad');
  });
  it('loadPlayback defaults an absent person', async () => {
    var calls = fakeFetch({});
    await loadPlayback('http://s');
    expect(calls[0].url).toBe('http://s/api/playback?person=');
  });
  it('loadMusicVideoPlayback GETs /api/music-video-playback keyed by person', async () => {
    var calls = fakeFetch({ now_playing: null });
    await loadMusicVideoPlayback('http://s', 'mom');
    expect(calls[0].url).toBe('http://s/api/music-video-playback?person=mom');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
  it('loadMusicVideoPlayback defaults an absent person', async () => {
    var calls = fakeFetch({});
    await loadMusicVideoPlayback('http://s');
    expect(calls[0].url).toBe('http://s/api/music-video-playback?person=');
  });
});

describe('loadAlbum / loadPlaylist', () => {
  it('loadAlbum GETs /api/album/{id}', async () => {
    var calls = fakeFetch({ id: 'ootb', items: [] });
    await loadAlbum('http://s', 'ootb');
    expect(calls[0].url).toBe('http://s/api/album/ootb');
  });
  it('loadPlaylist GETs /api/playlist/{id}', async () => {
    var calls = fakeFetch({ id: 'pl-1', items: [] });
    await loadPlaylist('http://s', 'pl-1');
    expect(calls[0].url).toBe('http://s/api/playlist/pl-1');
  });
});

describe('createPlaylist', () => {
  it('POSTs name + profile + a default collection_type of "playlist" and resolves the created record on 200', async () => {
    var calls = fakeFetch({ id: 'my-mix' });
    var rec = await createPlaylist('http://s', 'My Mix', 'kids');
    expect(calls[0].url).toBe('http://s/api/playlists/create');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ name: 'My Mix', profile: 'kids', collection_type: 'playlist' });
    expect(rec).toEqual({ id: 'my-mix' });
  });
  // TASK-378 — a 4th arg names the collectionType (Music Videos' ＋ passes
  // 'music-video-playlist'); omitted/undefined keeps the pre-378 'playlist' default.
  it('POSTs the given collection_type when the 4th arg is passed', async () => {
    var calls = fakeFetch({ id: 'qotsa-faves' });
    await createPlaylist('http://s', 'QOTSA Faves', 'kids', 'music-video-playlist');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ name: 'QOTSA Faves', profile: 'kids', collection_type: 'music-video-playlist' });
  });
  it('rejects with the status on a non-2xx (e.g. blank name)', async () => {
    fakeFetch({}, false);
    await expect(createPlaylist('http://s', '', 'kids')).rejects.toBe(500);
  });
});

// The 204-contract playlist mutations: resolve the response on 2xx, reject the
// status otherwise (mirrors createPlaylist but keeps the raw response, not JSON).
describe('204-contract playlist mutations resolve on ok / reject on error', () => {
  var cases = [
    { name: 'addToPlaylist', call: (ok) => { fakeFetch({}, ok); return addToPlaylist('http://s', 'pl', 't1'); }, url: 'http://s/api/playlists/add-track', body: { playlist_id: 'pl', track_id: 't1' } },
    { name: 'addSourceToPlaylist', call: (ok) => { fakeFetch({}, ok); return addSourceToPlaylist('http://s', 'pl', 'album', 'ootb'); }, url: 'http://s/api/playlists/add-source', body: { playlist_id: 'pl', source_type: 'album', source_id: 'ootb' } },
    { name: 'movePlaylistTrack', call: (ok) => { fakeFetch({}, ok); return movePlaylistTrack('http://s', 'pl', 2, 'up'); }, url: 'http://s/api/playlists/move-track', body: { playlist_id: 'pl', index: 2, direction: 'up' } },
    { name: 'removeFromPlaylist', call: (ok) => { fakeFetch({}, ok); return removeFromPlaylist('http://s', 'pl', 3); }, url: 'http://s/api/playlists/remove-track', body: { playlist_id: 'pl', index: 3 } },
    { name: 'renamePlaylist', call: (ok) => { fakeFetch({}, ok); return renamePlaylist('http://s', 'pl', 'New Name'); }, url: 'http://s/api/playlists/rename', body: { playlist_id: 'pl', name: 'New Name' } }
  ];
  cases.forEach(function(c) {
    it(c.name + ' resolves the response on a 2xx', async () => {
      var res = await c.call(true);
      expect(res.ok).toBe(true);
    });
    it(c.name + ' rejects the status on a non-2xx', async () => {
      await expect(c.call(false)).rejects.toBe(500);
    });
  });

  it('addToPlaylist POSTs the expected url + body', async () => {
    var calls = fakeFetch({});
    await addToPlaylist('http://s', 'pl', 't1');
    expect(calls[0].url).toBe('http://s/api/playlists/add-track');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ playlist_id: 'pl', track_id: 't1' });
  });
});

describe('deletePlaylist', () => {
  it('POSTs /api/playlists/delete with the playlist_id', async () => {
    var calls = fakeFetch({});
    await deletePlaylist('http://s', 'pl-1');
    expect(calls[0].url).toBe('http://s/api/playlists/delete');
    expect(calls[0].opts.method).toBe('POST');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ playlist_id: 'pl-1' });
  });
});
