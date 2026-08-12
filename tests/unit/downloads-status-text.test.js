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
});
