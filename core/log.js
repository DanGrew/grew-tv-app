// App-side logging emitter (TASK-213) — the browser's own view of what the
// player did and what crashed, POSTed to the media-manager's /log sink. This is
// the COMPLEMENT to the server-side request/WS log: the server can't see a JS
// exception, a buffer stall, or the user's play/seek sequence — this can.
//
// Host-relative: posts to `location.origin` (the origin the app was loaded
// from), never a hardcoded localhost, so it follows the app to whatever LAN host
// the kiosk/device opened it on (cf. TASK-134 / BUG-009). Bare `location` (not
// the page-global form) keeps this inside the core layer — the no-dom-in-core
// gate forbids the DOM-global tokens but allows `location` (cf. state.js).
//
// Strictly fire-and-forget: every post swallows all errors and never awaits in
// the playback path, so logging can never throw into playback, surface in the
// UI, or block when the server is unreachable (offline device, kiosk booting
// before the server is up). `keepalive` lets a stop-on-unload post still flush.

export var SOURCE_TV = 'TV';

export function postLog(body) {
  try {
    return fetch(location.origin + '/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    }).catch(function() {});
  } catch (e) {
    // fetch itself can throw synchronously (bad input / no network stack);
    // a logging hiccup must never reach the caller.
    return Promise.resolve();
  }
}

// Playback lifecycle + health event -> the backend's {event, item, context}
// shape (telemetry.py _PLAYBACK_EVENTS). `event` is a lowercase name the server
// maps onto its PLAY_*/SEEK/BUFFER_*/FRAME_DROPPED constants; health events
// (buffer_start/buffer_end/frame_dropped) ride this SAME shape — first-class
// playback events, not the warn channel.
export function logEvent(event, context) {
  var ctx = context || {};
  return postLog({ event: event, item: ctx.itemId || null, context: ctx });
}

// Coalesce a burst of seeks into ONE event ~`delayMs` after scrubbing settles
// (TASK-213): every call (re)arms the timer, so only the final seek of a burst
// fires `onSettle`. Returned function is what the player calls on each `seeked`.
export function makeSeekCoalescer(onSettle, delayMs) {
  var timer = null;
  return function() {
    clearTimeout(timer);
    timer = setTimeout(onSettle, delayMs);
  };
}
