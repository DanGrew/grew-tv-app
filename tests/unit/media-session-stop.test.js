import { vi } from 'vitest';
import { claimStop, releaseStop } from '../../core/media-session-stop.js';

// TASK-599 — the remote's ⏹ Stop reaches the page only as a Media Session
// `stop` action. Only `stop` is ever touched, and a browser that can't take it
// never throws back into the player.

var handlers;
beforeEach(() => {
  handlers = {};
  vi.stubGlobal('navigator', {
    mediaSession: { setActionHandler: (action, fn) => { handlers[action] = fn; } }
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('claimStop', () => {
  it('points the stop action at the given handler', () => {
    var stop = () => {};
    claimStop(stop);
    expect(handlers.stop).toBe(stop);
  });
  it('claims stop alone, leaving play/pause to the browser', () => {
    claimStop(() => {});
    expect(Object.keys(handlers)).toEqual(['stop']);
  });
  it('does not throw with no Media Session', () => {
    vi.stubGlobal('navigator', {});
    expect(() => claimStop(() => {})).not.toThrow();
  });
  it('does not throw when the browser refuses the stop action', () => {
    vi.stubGlobal('navigator', { mediaSession: { setActionHandler: () => { throw new TypeError('unsupported'); } } });
    expect(() => claimStop(() => {})).not.toThrow();
  });
});

describe('releaseStop', () => {
  it('clears the stop action', () => {
    claimStop(() => {});
    releaseStop();
    expect(handlers).toEqual({ stop: null });
  });
  it('does not throw with no Media Session', () => {
    vi.stubGlobal('navigator', {});
    expect(() => releaseStop()).not.toThrow();
  });
});
