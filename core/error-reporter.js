// Global browser-error capture (TASK-213) — the half that did not exist before:
// JavaScript errors and unhandled promise rejections in the kiosk/browser, shipped
// to the server's /log sink so a client-side crash is actually visible (the server
// log is blind to the browser). Also a reportWarn() helper for caught/recoverable
// issues (failed poster fetch, WS reconnect, …).
//
// Lives in core/ for unit-testability, so it must not name the DOM-global token
// (no-dom-in-core gate). installErrorReporter() therefore takes the page-global
// object as a `win` PARAMETER (same trick as server-config.wsUrl(hostname)) — the
// entry page passes its own global in. Bare `location` is allowed in core.

import { postLog } from './log.js';
import { getPerson } from './state.js';

// Recursion guard: an error raised *inside* the reporter (or an onerror that
// re-fires while we post) must not loop. While a report is in flight we drop
// any nested report.
var reporting = false;

function ctxFor(page, url, line, col) {
  return {
    page: page == null ? location.pathname : page,
    person: getPerson(),
    url: url == null ? location.href : url,
    line: line == null ? null : line,
    col: col == null ? null : col
  };
}

function send(level, code, message, context) {
  if (reporting) return;
  reporting = true;
  try {
    postLog({
      level: level,
      code: code,
      message: String(message == null ? '' : message),
      context: context || {}
    });
  } catch (e) {
    // The reporter must never throw out of itself.
  }
  reporting = false;
}

export function reportError(code, message, context) {
  send('error', code, message, context);
}

export function reportWarn(code, message, context) {
  send('warn', code, message, context);
}

function rejectionReason(e) {
  var r = e && e.reason;
  if (r == null) return 'unhandledrejection';
  if (r.message != null) return r.message;
  return String(r);
}

// Wire the global handlers onto `win`. Idempotent per `win`: a second call on
// the same object (e.g. a page that double-boots) is a no-op so handlers can't
// stack.
export function installErrorReporter(win, page) {
  if (win.__grewErrInstalled) return;
  win.__grewErrInstalled = true;
  win.onerror = function(message, url, line, col) {
    reportError('js_error', message, ctxFor(page, url, line, col));
    return false;
  };
  win.addEventListener('unhandledrejection', function(e) {
    reportError('unhandled_rejection', rejectionReason(e), ctxFor(page));
  });
}
