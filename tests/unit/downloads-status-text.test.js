import { vi } from 'vitest';
import { playlistStatusText } from '../../core/downloads-status-text.js';

var store;
beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; }
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('playlistStatusText', () => {
  it('is "Not synced" when never synced and not currently syncing', () => {
    expect(playlistStatusText('pl-a', undefined)).toBe('Not synced');
  });
  it('is "Synced" once marked synced (via downloads-synced)', () => {
    store['grew-tv.downloads.synced'] = JSON.stringify(['pl-a']);
    expect(playlistStatusText('pl-a', undefined)).toBe('Synced');
  });
  it('is the progress line when progress is given, regardless of synced state', () => {
    expect(playlistStatusText('pl-a', { done: 3, total: 8 })).toBe('Syncing — 3/8');
  });
  it('progress takes priority over an already-synced status', () => {
    store['grew-tv.downloads.synced'] = JSON.stringify(['pl-a']);
    expect(playlistStatusText('pl-a', { done: 1, total: 2 })).toBe('Syncing — 1/2');
  });

  // BUG-066 — the track count leads, before any sync starts.
  describe('track count (BUG-066)', () => {
    it('prefixes "N tracks" ahead of Not synced', () => {
      expect(playlistStatusText('pl-a', undefined, 12)).toBe('12 tracks — Not synced');
    });
    it('prefixes "N tracks" ahead of Synced', () => {
      store['grew-tv.downloads.synced'] = JSON.stringify(['pl-a']);
      expect(playlistStatusText('pl-a', undefined, 12)).toBe('12 tracks — Synced');
    });
    it('singularises "1 track"', () => {
      expect(playlistStatusText('pl-a', undefined, 1)).toBe('1 track — Not synced');
    });
    it('shows "0 tracks" for a valid empty playlist, not a blank prefix', () => {
      expect(playlistStatusText('pl-a', undefined, 0)).toBe('0 tracks — Not synced');
    });
    it('omits the prefix when clipCount is absent (older caller / not yet loaded)', () => {
      expect(playlistStatusText('pl-a', undefined, undefined)).toBe('Not synced');
    });
    it('does not prefix the mid-sync progress line', () => {
      expect(playlistStatusText('pl-a', { done: 1, total: 2 }, 12)).toBe('Syncing — 1/2');
    });
  });
});
