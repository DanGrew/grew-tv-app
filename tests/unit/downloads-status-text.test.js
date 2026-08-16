import { vi } from 'vitest';
import { playlistStatusText, syncFailureText } from '../../core/downloads-status-text.js';

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

// BUG-064 — the post-sync status line naming what failed.
describe('syncFailureText', () => {
  it('is null when nothing failed', () => {
    expect(syncFailureText({ 'pl-a': { failed: [] } })).toBeNull();
  });
  it('names one failed track and its reason', () => {
    expect(syncFailureText({ 'pl-a': { failed: [{ title: 'Sweet Talkin Woman', reason: 'HTTP 404' }] } }))
      .toBe('1 track failed — Sweet Talkin Woman (HTTP 404)');
  });
  it('pluralises and lists every failed track across every playlist in the batch', () => {
    expect(syncFailureText({
      'pl-a': { failed: [{ title: 'Track A', reason: 'HTTP 404' }] },
      'pl-b': { failed: [{ title: 'Track B', reason: 'disk full' }] }
    })).toBe('2 tracks failed — Track A (HTTP 404), Track B (disk full)');
  });
  it('is null for an empty results map', () => {
    expect(syncFailureText({})).toBeNull();
  });

  // BUG-416 — a playlist whose .m3u failed to write must be named too, even
  // when every track landed (no per-track failure).
  describe('playlistFileError (BUG-416)', () => {
    it('names a playlist-file write failure when no track failed', () => {
      expect(syncFailureText({ 'pl-a': { failed: [], playlistFileError: 'playlist file "Road Trip.m3u" failed to write: disk full' } }))
        .toBe('playlist file "Road Trip.m3u" failed to write: disk full');
    });
    it('lists both a track failure and a playlist-file failure together', () => {
      expect(syncFailureText({
        'pl-a': { failed: [{ title: 'Track A', reason: 'HTTP 404' }], playlistFileError: null },
        'pl-b': { failed: [], playlistFileError: 'playlist file "B.m3u" failed to write: disk full' }
      })).toBe('1 track failed — Track A (HTTP 404) — playlist file "B.m3u" failed to write: disk full');
    });
  });
});
