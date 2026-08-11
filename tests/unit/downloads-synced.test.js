import { vi } from 'vitest';
import { syncedPlaylistIds, isSynced, markSynced } from '../../core/downloads-synced.js';

var KEY = 'grew-tv.downloads.synced';

var store;
beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; }
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('syncedPlaylistIds', () => {
  it('is empty when nothing has been synced', () => {
    expect(syncedPlaylistIds()).toEqual([]);
  });
  it('reads back a persisted list', () => {
    store[KEY] = JSON.stringify(['pl-a', 'pl-b']);
    expect(syncedPlaylistIds()).toEqual(['pl-a', 'pl-b']);
  });
  it('falls back to [] on garbage JSON', () => {
    store[KEY] = 'not json';
    expect(syncedPlaylistIds()).toEqual([]);
  });
  it('falls back to [] when the stored value is not an array', () => {
    store[KEY] = JSON.stringify({ not: 'an array' });
    expect(syncedPlaylistIds()).toEqual([]);
  });
});

describe('isSynced', () => {
  it('is false for an id never marked', () => {
    expect(isSynced('pl-a')).toBe(false);
  });
  it('is true once the id has been marked', () => {
    markSynced('pl-a');
    expect(isSynced('pl-a')).toBe(true);
  });
});

describe('markSynced', () => {
  it('adds the id to the persisted set', () => {
    markSynced('pl-a');
    expect(syncedPlaylistIds()).toEqual(['pl-a']);
  });
  it('does not duplicate an id marked twice', () => {
    markSynced('pl-a');
    markSynced('pl-a');
    expect(syncedPlaylistIds()).toEqual(['pl-a']);
  });
  it('preserves other ids already marked', () => {
    markSynced('pl-a');
    markSynced('pl-b');
    expect(syncedPlaylistIds().sort()).toEqual(['pl-a', 'pl-b']);
  });
});
