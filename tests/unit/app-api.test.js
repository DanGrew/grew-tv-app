import { loadBrowse, loadVideo, loadSeries, loadNext, loadProgress, saveProgress, loadContinueWatching, loadConfig, loadSettings, saveSettings, scanDevices, mediaUrl, loadLyrics } from '../../core/app-api.js';

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

describe('loadSeries', () => {
  it('GETs /api/series/{id}', async () => {
    var calls = fakeFetch({ id: 'bluey', items: [] });
    await loadSeries('http://s', 'bluey');
    expect(calls[0].url).toBe('http://s/api/series/bluey');
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
  it('POSTs /api/settings with the captionsOn body', async () => {
    var calls = fakeFetch({ captionsOn: false });
    await saveSettings('http://s', false);
    expect(calls[0].url).toBe('http://s/api/settings');
    expect(calls[0].opts.method).toBe('POST');
    expect(calls[0].opts.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(calls[0].opts.body)).toEqual({ captionsOn: false });
  });
});

describe('scanDevices', () => {
  it('GETs /scan, no-store', async () => {
    var calls = fakeFetch({ devices: ['TV'] });
    await scanDevices('http://s');
    expect(calls[0].url).toBe('http://s/scan');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
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
