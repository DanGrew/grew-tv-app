import { vi } from 'vitest';
import { getProfile, setProfile, getParam, navTo } from '../../core/state.js';

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
});
