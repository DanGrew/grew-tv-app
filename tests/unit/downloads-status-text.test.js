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
});
