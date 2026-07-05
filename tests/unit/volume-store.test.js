import { vi } from 'vitest';
import { readVolume, writeVolume } from '../../core/volume-store.js';

var KEY = 'grew-tv.volume';

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

describe('readVolume', () => {
  it('defaults to 1 when unset', () => expect(readVolume()).toBe(1));
  it('round-trips a set value', () => {
    store[KEY] = '0.4';
    expect(readVolume()).toBe(0.4);
  });
  it('clamps above 1 down to 1', () => {
    store[KEY] = '5';
    expect(readVolume()).toBe(1);
  });
  it('clamps below 0 up to 0', () => {
    store[KEY] = '-3';
    expect(readVolume()).toBe(0);
  });
  it('garbage/NaN falls back to 1', () => {
    store[KEY] = 'loud';
    expect(readVolume()).toBe(1);
  });
});

describe('writeVolume', () => {
  it('persists a value readable by readVolume', () => {
    writeVolume(0.25);
    expect(readVolume()).toBe(0.25);
  });
  it('clamps out-of-range before storing (as a string)', () => {
    writeVolume(9);
    expect(store[KEY]).toBe('1');
    writeVolume(-1);
    expect(store[KEY]).toBe('0');
  });
});
