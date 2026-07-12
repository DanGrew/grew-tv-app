import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createCompanionMode, appStateDrivesNav, navIntentsAllowed, SYNCED, DESYNCED
} from '../../core/companion-mode.js';

// sessionStorage does not exist in the `node` vitest environment — back it with a
// plain in-memory Map (the same vi.stubGlobal approach nav-trail.test.js uses).
function makeStorage() {
  var store = {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; }
  };
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', makeStorage());
});

describe('appStateDrivesNav / navIntentsAllowed predicates', () => {
  it('both seams open when synced', () => {
    expect(appStateDrivesNav(SYNCED)).toBe(true);
    expect(navIntentsAllowed(SYNCED)).toBe(true);
  });

  it('both seams closed when desynced', () => {
    expect(appStateDrivesNav(DESYNCED)).toBe(false);
    expect(navIntentsAllowed(DESYNCED)).toBe(false);
  });

  // Anything not literally DESYNCED is treated as driving (fail-open): a missing
  // or unknown mode never silently suppresses the TV.
  it('treats an unknown mode as synced (fail-open)', () => {
    expect(appStateDrivesNav(undefined)).toBe(true);
    expect(navIntentsAllowed('something-else')).toBe(true);
  });
});

describe('createCompanionMode', () => {
  it('defaults to synced (unchanged behaviour)', () => {
    var m = createCompanionMode();
    expect(m.mode()).toBe(SYNCED);
    expect(m.mode()).toBe('synced');   // pins the literal SYNCED value
    expect(m.isDesynced()).toBe(false);
    expect(m.drivesNav()).toBe(true);
    expect(m.intentsAllowed()).toBe(true);
  });

  it('setDesynced closes both seams', () => {
    var m = createCompanionMode();
    m.setDesynced();
    expect(m.isDesynced()).toBe(true);
    expect(m.mode()).toBe('desynced');   // pins the literal DESYNCED value
    expect(m.drivesNav()).toBe(false);
    expect(m.intentsAllowed()).toBe(false);
  });

  it('persists under the grew-tv:companion-mode storage key', () => {
    // Seeding the real key must be read back as the mode (pins MODE_KEY).
    sessionStorage.setItem('grew-tv:companion-mode', DESYNCED);
    expect(createCompanionMode().isDesynced()).toBe(true);
  });

  it('toggle flips the mode and returns the new mode', () => {
    var m = createCompanionMode();
    expect(m.toggle()).toBe(DESYNCED);
    expect(m.isDesynced()).toBe(true);
    expect(m.toggle()).toBe(SYNCED);
    expect(m.isDesynced()).toBe(false);
  });

  // The whole point of persistence: the companion is multi-page, so a fresh
  // instance on the next page must read the SAME mode from sessionStorage.
  it('persists across instances (survives a page load)', () => {
    var first = createCompanionMode();
    first.setDesynced();
    var afterNav = createCompanionMode();
    expect(afterNav.isDesynced()).toBe(true);
    afterNav.setSynced();
    expect(createCompanionMode().isDesynced()).toBe(false);
  });

  it('degrades to synced when sessionStorage is unavailable (never throws)', () => {
    vi.stubGlobal('sessionStorage', undefined);
    var m = createCompanionMode();
    expect(m.mode()).toBe(SYNCED);
    expect(function() { m.setDesynced(); m.toggle(); }).not.toThrow();
  });
});

describe('local navigation stack', () => {
  it('starts empty', () => {
    var m = createCompanionMode();
    expect(m.depth()).toBe(0);
    expect(m.current()).toBe(null);
    expect(m.back()).toBe(null);
  });

  it('push / current / back track the top entry', () => {
    var m = createCompanionMode();
    m.push({ page: 'browse' });
    m.push({ page: 'detail', params: { id: 'film-1' } });
    expect(m.depth()).toBe(2);
    expect(m.current().page).toBe('detail');
    expect(m.back().page).toBe('browse');
    expect(m.depth()).toBe(1);
  });

  it('setSynced clears the local stack (re-sync contract)', () => {
    var m = createCompanionMode();
    m.setDesynced();
    m.push({ page: 'browse' });
    m.push({ page: 'detail' });
    m.setSynced();
    expect(m.depth()).toBe(0);
    expect(m.current()).toBe(null);
  });

  it('reset empties the local stack without touching the mode', () => {
    var m = createCompanionMode();
    m.setDesynced();
    m.push({ page: 'browse' });
    m.push({ page: 'detail' });
    m.reset();
    expect(m.depth()).toBe(0);
    expect(m.current()).toBe(null);
    expect(m.isDesynced()).toBe(true);   // mode untouched by reset
  });
});
