import { vi } from 'vitest';
import { getProfile, setProfile, getPerson, setPerson, getCaptions, setCaptions, initCaptions, getParam, navTo } from '../../core/state.js';

describe('getProfile / setProfile', () => {
  var store;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem:    (k) => store[k] ?? null,
      setItem:    (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; }
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns null when not set', () => {
    expect(getProfile()).toBe(null);
  });
  it('returns profile after setProfile', () => {
    setProfile('kids');
    expect(getProfile()).toBe('kids');
  });
  it('updates profile', () => {
    setProfile('kids');
    setProfile('adults');
    expect(getProfile()).toBe('adults');
  });
});

// FEAT-026 TASK-156: the active person is the watch-progress key (who's
// watching), stored separately from the content-class profile above.
describe('getPerson / setPerson', () => {
  var store;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem:    (k) => store[k] ?? null,
      setItem:    (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; }
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns null when not set', () => {
    expect(getPerson()).toBe(null);
  });
  it('returns the active person id after setPerson', () => {
    setPerson('oliver');
    expect(getPerson()).toBe('oliver');
  });
  it('is independent of the profile key', () => {
    setPerson('mom');
    setProfile('adults');
    expect(getPerson()).toBe('mom');
    expect(getProfile()).toBe('adults');
  });
});

// FEAT-023: captions are server-backed (single source of truth), no longer read
// from localStorage. getCaptions() returns an in-memory cache seeded by
// initCaptions(); setCaptions() writes through to the backend.
describe('captions (server-backed)', () => {
  var store, calls;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem:    (k) => store[k] ?? null,
      setItem:    (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; }
    });
    calls = [];
    global.fetch = async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({ captionsOn: false }) };
    };
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('setCaptions updates the cache and POSTs to the backend', async () => {
    setCaptions(false);
    expect(getCaptions()).toBe(false);
    expect(calls[0].url).toContain('/api/settings');
    expect(calls[0].opts.method).toBe('POST');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ captionsOn: false });
    setCaptions(true);
    expect(getCaptions()).toBe(true);
  });

  it('initCaptions seeds the cache from the backend GET', async () => {
    await initCaptions('http://s');
    expect(calls[0].url).toBe('http://s/api/settings');
    expect(getCaptions()).toBe(false);   // backend says off
  });

  it('migrates a legacy localStorage key to the backend then deletes it', async () => {
    store['grew-tv:captions'] = 'off';
    await initCaptions('http://s');
    expect(getCaptions()).toBe(false);                       // legacy 'off' honoured
    expect(calls[0].opts.method).toBe('POST');               // pushed, not GET
    expect(JSON.parse(calls[0].opts.body)).toEqual({ captionsOn: false });
    expect(store['grew-tv:captions']).toBeUndefined();       // key removed
  });

  it('keeps the legacy key when the migration push fails (offline)', async () => {
    store['grew-tv:captions'] = 'on';
    global.fetch = async () => { throw new Error('offline'); };
    await initCaptions('http://s');
    expect(store['grew-tv:captions']).toBe('on');            // not deleted -> retries next boot
  });

  it('offline init keeps the current cached value and never throws', async () => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ captionsOn: true }) });
    await initCaptions('http://s');                          // seed ON from backend
    expect(getCaptions()).toBe(true);
    global.fetch = async () => { throw new Error('offline'); };
    await expect(initCaptions('http://s')).resolves.toBe(true);
    expect(getCaptions()).toBe(true);                        // cache preserved
  });
});

describe('getParam', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns param from search string', () => {
    vi.stubGlobal('location', { search: '?film=abc&item=2' });
    expect(getParam('film')).toBe('abc');
    expect(getParam('item')).toBe('2');
  });
  it('returns null for missing param', () => {
    vi.stubGlobal('location', { search: '' });
    expect(getParam('film')).toBe(null);
  });
});

describe('navTo', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sets location.href to page with no params', () => {
    var loc = { href: '' };
    vi.stubGlobal('location', loc);
    navTo('browse.html', {});
    expect(loc.href).toBe('browse.html');
  });
  it('appends params as query string', () => {
    var loc = { href: '' };
    vi.stubGlobal('location', loc);
    navTo('detail.html', { film: 'foo' });
    expect(loc.href).toBe('detail.html?film=foo');
  });
  it('encodes param values', () => {
    var loc = { href: '' };
    vi.stubGlobal('location', loc);
    navTo('video.html', { film: 'foo bar' });
    expect(loc.href).toBe('video.html?film=foo%20bar');
  });
  it('handles multiple params', () => {
    var loc = { href: '' };
    vi.stubGlobal('location', loc);
    navTo('video.html', { film: 'abc', item: '2' });
    expect(loc.href).toBe('video.html?film=abc&item=2');
  });
  it('drops null/undefined params instead of serializing them (BUG-005)', () => {
    var loc = { href: '' };
    vi.stubGlobal('location', loc);
    // A standalone film passes series:undefined; it must NOT become series=undefined
    // (which getParam would read back as the truthy string "undefined").
    navTo('video.html', { video: 'toy-story-main', from: 'browse', series: undefined });
    expect(loc.href).toBe('video.html?video=toy-story-main&from=browse');
    loc.href = '';
    navTo('video.html', { video: 'bluey-s1e01', series: null });
    expect(loc.href).toBe('video.html?video=bluey-s1e01');
  });
  it('keeps an empty-string param value', () => {
    var loc = { href: '' };
    vi.stubGlobal('location', loc);
    navTo('browse.html', { tab: '' });
    expect(loc.href).toBe('browse.html?tab=');
  });
});
