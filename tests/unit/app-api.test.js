import { loadBrowse, loadVideo, loadSeries, loadNext, loadProgress, loadConfig, loadSettings, saveSettings, scanDevices, mediaUrl } from '../../core/app-api.js';

function fakeFetch(body, ok) {
  var calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: ok !== false, status: ok === false ? 500 : 200, json: async () => body }; };
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
  it('GETs /api/progress/{id}, no-store', async () => {
    var calls = fakeFetch({ item_id: 'a', position_secs: 90, duration_secs: 600 });
    await loadProgress('http://s', 'a');
    expect(calls[0].url).toBe('http://s/api/progress/a');
    expect(calls[0].opts).toEqual({ cache: 'no-store' });
  });
  it('resolves parsed JSON', async () => {
    fakeFetch({ item_id: 'a', position_secs: 90, duration_secs: 600 });
    expect(await loadProgress('http://s', 'a')).toEqual({ item_id: 'a', position_secs: 90, duration_secs: 600 });
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

describe('mediaUrl', () => {
  it('builds /media/{name}', () => {
    expect(mediaUrl('http://s', 'toy-story-main.mp4')).toBe('http://s/media/toy-story-main.mp4');
  });
  it('returns empty string for falsy name', () => {
    expect(mediaUrl('http://s', null)).toBe('');
    expect(mediaUrl('http://s', '')).toBe('');
  });
});
