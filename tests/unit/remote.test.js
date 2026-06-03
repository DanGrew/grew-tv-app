import { vi } from 'vitest';
import { startWatchdog } from '../../core/remote.js';

describe('startWatchdog', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('does not close ws when ping is recent', () => {
    var closed = false;
    var ws = { close: function() { closed = true; } };
    var lastPing = Date.now();
    startWatchdog(function() { return ws; }, function() { return lastPing; });
    vi.advanceTimersByTime(5000);
    expect(closed).toBe(false);
  });

  it('closes ws when no ping received for more than 20s', () => {
    var closed = false;
    var ws = { close: function() { closed = true; } };
    var lastPing = Date.now() - 25000;
    startWatchdog(function() { return ws; }, function() { return lastPing; });
    vi.advanceTimersByTime(5000);
    expect(closed).toBe(true);
  });

  it('does not throw when ws is null', () => {
    expect(function() {
      startWatchdog(function() { return null; }, function() { return Date.now() - 25000; });
      vi.advanceTimersByTime(5000);
    }).not.toThrow();
  });

  it('closes again on next tick if ws reconnects and goes stale', () => {
    var closeCount = 0;
    var lastPing = Date.now() - 25000;
    var ws = { close: function() { closeCount++; } };
    startWatchdog(function() { return ws; }, function() { return lastPing; });
    vi.advanceTimersByTime(5000);
    vi.advanceTimersByTime(5000);
    expect(closeCount).toBe(2);
  });
});
