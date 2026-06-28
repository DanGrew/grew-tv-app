import { describe, it, expect } from 'vitest';
import {
  actionEnabled, tileOpenableDesynced, tileOffDesynced
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

describe('tile openability when desynced', () => {
  it('series and album are locally openable (detail self-loads)', () => {
    expect(tileOpenableDesynced('series')).toBe(true);
    expect(tileOpenableDesynced('album')).toBe(true);
  });

  it('artist, playlist and bare video are NOT openable yet', () => {
    expect(tileOpenableDesynced('artist')).toBe(false);
    expect(tileOpenableDesynced('playlist')).toBe(false);
    expect(tileOpenableDesynced('video')).toBe(false);
  });
});

describe('tileOffDesynced (grey non-openable tiles)', () => {
  it('never greys a tile while synced', () => {
    expect(tileOffDesynced('artist', false)).toBe(false);
    expect(tileOffDesynced('video', false)).toBe(false);
  });

  it('greys only non-openable tiles while desynced', () => {
    expect(tileOffDesynced('series', true)).toBe(false);
    expect(tileOffDesynced('album', true)).toBe(false);
    expect(tileOffDesynced('artist', true)).toBe(true);
    expect(tileOffDesynced('playlist', true)).toBe(true);
    expect(tileOffDesynced('video', true)).toBe(true);
  });
});
