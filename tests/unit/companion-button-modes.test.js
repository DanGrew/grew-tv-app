import { describe, it, expect } from 'vitest';
import {
  actionEnabled, desyncOpenPage, tileOpenableDesynced, tileOffDesynced
} from '../../core/companion-button-modes.js';

describe('actionEnabled (safe-by-default button gating)', () => {
  it('enables everything when synced', () => {
    expect(actionEnabled('add-playlist', false)).toBe(true);
    expect(actionEnabled('switch-profile', false)).toBe(true);
    expect(actionEnabled('anything-undeclared', false)).toBe(true);
  });

  it('keeps whitelisted per-person / local actions enabled when desynced', () => {
    expect(actionEnabled('add-playlist', true)).toBe(true);
    expect(actionEnabled('add-queue', true)).toBe(true);
    expect(actionEnabled('local-nav', true)).toBe(true);
    expect(actionEnabled('season', true)).toBe(true);
    expect(actionEnabled('toggle-sync', true)).toBe(true);
  });

  it('disables TV-driving and undeclared actions when desynced (safe default)', () => {
    expect(actionEnabled('switch-profile', true)).toBe(false);
    expect(actionEnabled('play', true)).toBe(false);
    expect(actionEnabled('totally-new-button', true)).toBe(false);
  });
});

describe('desyncOpenPage (route -> companion page)', () => {
  it('routes each openable type to the right self-loading page', () => {
    expect(desyncOpenPage('series')).toBe('detail.html');
    expect(desyncOpenPage('album')).toBe('detail.html');
    expect(desyncOpenPage('playlist')).toBe('playlist.html');
    expect(desyncOpenPage('artist')).toBe('artist.html');
  });
  // A playlist MUST NOT route to detail.html — that calls /api/series and 404s.
  it('never sends a playlist to detail (the /api/series 404 bug)', () => {
    expect(desyncOpenPage('playlist')).not.toBe('detail.html');
  });
  it('a bare video/film has no desync page (play-only)', () => {
    expect(desyncOpenPage('video')).toBe(null);
    expect(desyncOpenPage('create-playlist')).toBe(null);
  });
});

describe('tile openability when desynced', () => {
  it('series, album, playlist and artist are locally openable', () => {
    expect(tileOpenableDesynced('series')).toBe(true);
    expect(tileOpenableDesynced('album')).toBe(true);
    expect(tileOpenableDesynced('playlist')).toBe(true);
    expect(tileOpenableDesynced('artist')).toBe(true);
  });

  it('a bare video/film is NOT openable (play-only)', () => {
    expect(tileOpenableDesynced('video')).toBe(false);
  });
});

describe('tileOffDesynced (grey non-openable tiles)', () => {
  it('never greys a tile while synced', () => {
    expect(tileOffDesynced('artist', false)).toBe(false);
    expect(tileOffDesynced('video', false)).toBe(false);
  });

  it('greys only non-openable tiles while desynced (films), not collections', () => {
    expect(tileOffDesynced('series', true)).toBe(false);
    expect(tileOffDesynced('album', true)).toBe(false);
    expect(tileOffDesynced('playlist', true)).toBe(false);
    expect(tileOffDesynced('artist', true)).toBe(false);
    expect(tileOffDesynced('video', true)).toBe(true);
  });
});
