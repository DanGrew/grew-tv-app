import { vi } from 'vitest';
import { getProfile, setProfile, getPerson, setPerson, getCaptions, setCaptions, initCaptions, getLyrics, setLyrics, initLyrics, getParam, navTo, getDevice, ensureDevice, getDeviceLabel, setDeviceLabel } from '../../core/state.js';

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

// FEAT-023: lyrics preference is server-backed, exactly like captions — an
// in-memory cache seeded by initLyrics(), written through by setLyrics(). NOT
// localStorage.
describe('lyrics (server-backed)', () => {
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
      return { ok: true, status: 200, json: async () => ({ lyricsOn: false }) };
    };
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('setLyrics updates the cache and POSTs lyricsOn to the backend', async () => {
    setLyrics(false);
    expect(getLyrics()).toBe(false);
    expect(calls[0].url).toBe('/api/settings');   // server defaults to '' before init
    expect(calls[0].opts.method).toBe('POST');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ lyricsOn: false });
    setLyrics(true);
    expect(getLyrics()).toBe(true);
  });

  it('setLyrics swallows a rejected write-through (fire-and-forget catch)', async () => {
    global.fetch = async () => { throw new Error('offline'); };
    setLyrics(false);
    expect(getLyrics()).toBe(false);
    await Promise.resolve(); await Promise.resolve();   // flush the .catch handler
  });

  it('initLyrics seeds the cache from the backend GET', async () => {
    await initLyrics('http://s');
    expect(calls[0].url).toBe('http://s/api/settings');
    expect(getLyrics()).toBe(false);   // backend says off
  });

  it('offline init keeps the current cached value and never throws', async () => {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ lyricsOn: true }) });
    await initLyrics('http://s');                            // seed ON from backend
    expect(getLyrics()).toBe(true);
    global.fetch = async () => { throw new Error('offline'); };
    await expect(initLyrics('http://s')).resolves.toBe(true);
    expect(getLyrics()).toBe(true);                          // cache preserved
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
    expect(calls[0].url).toBe('/api/settings');   // server defaults to '' before init
    expect(calls[0].opts.method).toBe('POST');
    expect(JSON.parse(calls[0].opts.body)).toEqual({ captionsOn: false });
    setCaptions(true);
    expect(getCaptions()).toBe(true);
  });

  it('setCaptions swallows a rejected write-through (fire-and-forget catch)', async () => {
    global.fetch = async () => { throw new Error('offline'); };
    setCaptions(false);
    expect(getCaptions()).toBe(false);          // cache still updates locally
    await Promise.resolve(); await Promise.resolve();   // flush the .catch handler
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

  it('migrates a legacy "on" as captions ON', async () => {
    store['grew-tv:captions'] = 'on';
    await initCaptions('http://s');
    expect(getCaptions()).toBe(true);                        // legacy 'on' -> ON (not 'off')
    expect(store['grew-tv:captions']).toBeUndefined();       // pushed ok -> key removed
  });

  it('keeps the legacy key when the migration push fails (offline)', async () => {
    store['grew-tv:captions'] = 'on';
    global.fetch = async () => { throw new Error('offline'); };
    // On a failed push the migration still resolves to the (retained) local choice.
    await expect(initCaptions('http://s')).resolves.toBe(true);
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

// FEAT-026 TASK-158: durable device identity — WHICH screen this is, minted once.
describe('device identity', () => {
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

  it('getDevice is null until a device is minted', () => {
    expect(getDevice()).toBe(null);
  });
  it('ensureDevice mints a uuid once and returns the same id thereafter', () => {
    var id = ensureDevice();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ensureDevice()).toBe(id);   // set-and-forget: stable across calls
    expect(getDevice()).toBe(id);
  });
  it('getDeviceLabel returns an explicit label once set', () => {
    setDeviceLabel('Living Room');
    expect(getDeviceLabel()).toBe('Living Room');
  });
  it('getDeviceLabel falls back to "Screen · <short-id>" when unset', () => {
    var label = getDeviceLabel();
    expect(label).toMatch(/^Screen · [0-9a-f]{4}$/);   // short id = first 4 of the minted uuid
    expect(label.endsWith(getDevice().slice(0, 4))).toBe(true);
  });
});

// BUG-003: both toggles default ON in the in-memory cache until the backend
// answers. A fresh module import proves the initial value, isolated from the
// mutations other tests make to the shared module-level cache.
describe('server-backed defaults (BUG-003)', () => {
  it('captions default ON before initCaptions', async () => {
    vi.resetModules();
    const mod = await import('../../core/state.js');
    expect(mod.getCaptions()).toBe(true);
  });
  it('lyrics default ON before initLyrics', async () => {
    vi.resetModules();
    const mod = await import('../../core/state.js');
    expect(mod.getLyrics()).toBe(true);
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
  it('tolerates an omitted params object', () => {
    var loc = { href: '' };
    vi.stubGlobal('location', loc);
    navTo('browse.html');
    expect(loc.href).toBe('browse.html');
  });
});
