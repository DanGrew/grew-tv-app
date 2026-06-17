import { vi } from 'vitest';
import { installErrorReporter, reportError, reportWarn } from '../../core/error-reporter.js';

// Global browser-error capture (TASK-213): JS errors + unhandled rejections +
// reportWarn -> /log, never throwing, never recursing.

function lastBody(fetchMock) {
  var call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return JSON.parse(call[1].body);
}

// A minimal fake window: captures onerror + the unhandledrejection listener.
function fakeWindow() {
  var win = { onerror: null, _rejection: null, addEventListener: null };
  win.addEventListener = vi.fn((type, fn) => {
    win._rejection = type === 'unhandledrejection' ? fn : win._rejection;
  });
  return win;
}

describe('error-reporter', () => {
  var fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { origin: 'http://kiosk.local:8765', pathname: '/app/homeview/video.html', href: 'http://kiosk.local:8765/app/homeview/video.html' });
    vi.stubGlobal('localStorage', { getItem: () => 'ollie', setItem: () => {} });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('window.onerror posts {level:"error", code:"js_error"} with location context', () => {
    var win = fakeWindow();
    installErrorReporter(win, 'video.html');
    var ret = win.onerror('TypeError: x is undefined', 'app.js', 12, 5);
    var body = lastBody(fetchMock);
    expect(body.level).toBe('error');
    expect(body.code).toBe('js_error');
    expect(body.message).toContain('TypeError');
    expect(body.context).toEqual({ page: 'video.html', person: 'ollie', url: 'app.js', line: 12, col: 5 });
    expect(ret).toBe(false);   // don't swallow the browser's default logging
  });

  it('unhandledrejection posts {code:"unhandled_rejection"} with the reason message', () => {
    var win = fakeWindow();
    installErrorReporter(win);
    win._rejection({ reason: { message: 'boom' } });
    var body = lastBody(fetchMock);
    expect(body.code).toBe('unhandled_rejection');
    expect(body.message).toBe('boom');
    expect(body.context.page).toBe('/app/homeview/video.html');   // defaults to location.pathname
  });

  it('reportWarn posts {level:"warn"}', () => {
    reportWarn('poster_fetch_failed', 'cover 404', { id: 'film-x' });
    var body = lastBody(fetchMock);
    expect(body.level).toBe('warn');
    expect(body.code).toBe('poster_fetch_failed');
    expect(body.context).toEqual({ id: 'film-x' });
  });

  it('does not recurse: an error raised while reporting drops the nested report', () => {
    // fetch (the post) re-enters the reporter — the guard must drop the nested call.
    fetchMock.mockImplementation(() => {
      reportError('js_error', 'secondary boom');         // nested while a report is in flight
      return Promise.resolve();
    });
    reportError('js_error', 'primary boom');
    expect(fetchMock).toHaveBeenCalledTimes(1);           // nested report suppressed
  });

  it('is idempotent per window — a second install does not stack handlers', () => {
    var win = fakeWindow();
    installErrorReporter(win);
    installErrorReporter(win);
    expect(win.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('never throws out of the reporter even if posting fails synchronously', () => {
    fetchMock.mockImplementation(() => { throw new Error('post failed'); });
    expect(() => reportError('js_error', 'x')).not.toThrow();
  });
});
