import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { push, pop, peek, truncateTo, clear, pushUnique } from '../../core/nav-trail.js';

// sessionStorage does not exist in the `node` vitest environment — back it with
// a plain in-memory Map, the same vi.stubGlobal approach state.test.js uses for
// localStorage / location.
function makeStorage() {
  var store = {};
  return {
    getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; },
    _store: store
  };
}

describe('nav-trail', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', makeStorage());
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  function entry(page, params, scrollY, focusedId) {
    return { page: page, params: params, scrollY: scrollY, focusedId: focusedId };
  }

  it('peek/pop on an empty trail return null and do not throw', () => {
    expect(peek()).toBe(null);
    expect(pop()).toBe(null);
  });

  it('push then peek returns the top entry without removing it', () => {
    push(entry('browse.html', { tab: 'films' }, 120, 'tile-a'));
    expect(peek()).toEqual(entry('browse.html', { tab: 'films' }, 120, 'tile-a'));
    // still there
    expect(peek()).not.toBe(null);
  });

  it('pop is LIFO and returns the full entry (scroll + focus carried)', () => {
    push(entry('browse.html', { tab: 'films' }, 0, 'rail-1'));
    push(entry('rail-grid.html', { rail: 'r1' }, 300, 'boxset-7'));
    var top = pop();
    expect(top).toEqual(entry('rail-grid.html', { rail: 'r1' }, 300, 'boxset-7'));
    expect(top.scrollY).toBe(300);
    expect(top.focusedId).toBe('boxset-7');
    // parent still beneath
    expect(peek().page).toBe('browse.html');
  });

  it('pop empties the trail back to null after the last entry', () => {
    push(entry('browse.html', {}, 0, null));
    expect(pop()).not.toBe(null);
    expect(pop()).toBe(null);
    expect(peek()).toBe(null);
  });

  it('the trail survives a fresh module read (persisted to sessionStorage, not in-memory)', () => {
    push(entry('detail.html', { series: 's1' }, 50, 'ep-3'));
    // a "new page load" reads the same backing store
    expect(peek()).toEqual(entry('detail.html', { series: 's1' }, 50, 'ep-3'));
  });

  describe('truncateTo (breadcrumb ancestor click)', () => {
    function deepTrail() {
      push(entry('browse.html', { tab: 'films' }, 0, 'rail-1'));      // index 0 — Home
      push(entry('rail-grid.html', { rail: 'r1' }, 100, 'boxset-7')); // index 1 — rail
      push(entry('detail.html', { series: 'bx9' }, 200, 'series-2')); // index 2 — boxset
    }

    it('drops the clicked ancestor and everything deeper, keeping its ancestors', () => {
      deepTrail();
      // click the "rail" crumb: rail becomes current, only Home remains its ancestor
      truncateTo('rail-grid.html', { rail: 'r1' });
      expect(peek()).toEqual(entry('browse.html', { tab: 'films' }, 0, 'rail-1'));
      expect(pop()).not.toBe(null);
      expect(pop()).toBe(null);
    });

    it('matches params order-insensitively', () => {
      push(entry('rail-grid.html', { rail: 'r1', tab: 'films' }, 0, 'x'));
      push(entry('detail.html', { series: 's1' }, 0, 'y'));
      // same params, different key order
      truncateTo('rail-grid.html', { tab: 'films', rail: 'r1' });
      // rail entry was the click target -> dropped, nothing above it -> empty
      expect(peek()).toBe(null);
    });

    it('clears the trail when the clicked target is not in it (fall back to default)', () => {
      deepTrail();
      truncateTo('audio.html', { artist: 'nobody' });
      expect(peek()).toBe(null);
    });

    it('clicking the Home crumb empties the trail', () => {
      deepTrail();
      truncateTo('browse.html', { tab: 'films' });
      expect(peek()).toBe(null);
    });
  });

  describe('pushUnique', () => {
    function e(page, params) { return { page: page, params: params, label: page }; }

    it('pushes when the trail is empty', () => {
      pushUnique(e('artist.html', { artist: 'elo' }));
      expect(peek()).toMatchObject({ page: 'artist.html', params: { artist: 'elo' } });
    });

    it('does NOT stack a duplicate of the current top (same page + params)', () => {
      pushUnique(e('artist.html', { artist: 'elo' }));
      pushUnique(e('artist.html', { artist: 'elo' }));
      expect(peek()).toMatchObject({ page: 'artist.html', params: { artist: 'elo' } });
      pop();
      expect(peek()).toBe(null);
    });

    it('matches the top order-insensitively', () => {
      push(e('browse.html', { tab: 'music', rail: 'r1' }));
      pushUnique({ page: 'browse.html', params: { rail: 'r1', tab: 'music' }, label: 'x' });
      pop();
      expect(peek()).toBe(null);
    });

    it('pushes when page or params differ from the top', () => {
      pushUnique(e('browse.html', { tab: 'music' }));
      pushUnique(e('artist.html', { artist: 'elo' }));
      expect(peek().page).toBe('artist.html');
      pop();
      expect(peek().page).toBe('browse.html');
    });
  });

  it('clear empties the trail', () => {
    push(entry('browse.html', {}, 0, null));
    push(entry('detail.html', { series: 's1' }, 0, 'a'));
    clear();
    expect(peek()).toBe(null);
    expect(pop()).toBe(null);
  });

  it('tolerates a malformed sessionStorage value (degrades to empty, never throws)', () => {
    sessionStorage.setItem('grew-tv:nav-trail', '{not json');
    expect(peek()).toBe(null);
    expect(() => push(entry('browse.html', {}, 0, null))).not.toThrow();
    expect(peek().page).toBe('browse.html');
  });
});
