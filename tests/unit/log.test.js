import { vi } from 'vitest';
import { postLog, logEvent, makeSeekCoalescer, SOURCE_TV } from '../../core/log.js';

// App-side logging emitter (TASK-213). Host-relative POST to <origin>/log,
// strictly fire-and-forget, with seek coalescing.

function lastBody(fetchMock) {
  var call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return JSON.parse(call[1].body);
}

describe('postLog / logEvent', () => {
  var fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { origin: 'http://kiosk.local:8765' });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('posts to the host-relative /log on the page origin (not a hardcoded host)', () => {
    logEvent('play', { itemId: 'film-x' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://kiosk.local:8765/log');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);   // survives a stop-on-unload post
  });

  it('logEvent uses the backend {event, item, context} shape', () => {
    logEvent('seek', { itemId: 'film-x', positionSec: 42, source: SOURCE_TV });
    var body = lastBody(fetchMock);
    expect(body.event).toBe('seek');
    expect(body.item).toBe('film-x');
    expect(body.context).toEqual({ itemId: 'film-x', positionSec: 42, source: 'TV' });
  });

  it('item is null when context has no itemId', () => {
    logEvent('stop', {});
    expect(lastBody(fetchMock).item).toBe(null);
  });

  it('defaults an omitted context to an empty object (item null)', () => {
    logEvent('ended');
    var body = lastBody(fetchMock);
    expect(body.event).toBe('ended');
    expect(body.item).toBe(null);
    expect(body.context).toEqual({});
  });

  it('swallows a rejected fetch — never throws, resolves', async () => {
    fetchMock.mockReturnValue(Promise.reject(new Error('network down')));
    await expect(postLog({ event: 'play' })).resolves.toBeUndefined();
  });

  it('swallows a fetch that throws synchronously', () => {
    fetchMock.mockImplementation(() => { throw new Error('no network stack'); });
    expect(() => postLog({ event: 'play' })).not.toThrow();
  });

  it('a synchronous fetch throw still resolves to a promise (the catch returns one)', async () => {
    fetchMock.mockImplementation(() => { throw new Error('no network stack'); });
    await expect(postLog({ event: 'play' })).resolves.toBeUndefined();
  });
});

describe('makeSeekCoalescer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires onSettle ONCE ~500ms after a burst of seeks settles', () => {
    var spy = vi.fn();
    var onSeek = makeSeekCoalescer(spy, 500);
    onSeek(); onSeek(); onSeek();          // rapid scrub burst
    vi.advanceTimersByTime(499);
    expect(spy).not.toHaveBeenCalled();    // still settling
    vi.advanceTimersByTime(2);
    expect(spy).toHaveBeenCalledTimes(1);  // exactly one event for the whole burst
  });

  it('re-arms on each seek so an ongoing scrub never fires early', () => {
    var spy = vi.fn();
    var onSeek = makeSeekCoalescer(spy, 500);
    onSeek();
    vi.advanceTimersByTime(400);
    onSeek();                               // new seek resets the timer
    vi.advanceTimersByTime(400);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
