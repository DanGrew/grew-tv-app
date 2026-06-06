export const MESSAGE_TYPES = {
  CONTEXT: 'context',
  INTENT: 'intent',
  SNAPSHOT: 'snapshot',
  SNAPSHOT_REQUEST: 'snapshot_request',
  APP_STATE: 'app_state',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong'
};

// Companion -> app intents (FEAT-017). Extends the legacy skip intents.
export const INTENTS = {
  PLAY: 'play',
  SKIP: 'skip',
  NEXT: 'next',
  PREV: 'prev',
  SET_PROFILE: 'setProfile',
  TOGGLE_CAPTIONS: 'toggleCaptions'
};

// Graduated relative skips: ±10s / 30s / 2m / 10m / 30m. Relative only —
// no absolute seek crosses the wire (companion never knows true position).
export const SKIP_DELTAS = [10, 30, 120, 600, 1800];

export const SESSION_ID = 'grew-tv';

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function createMessage(type, payload, opts) {
  return {
    type,
    session_id: SESSION_ID,
    message_id: uuid(),
    version: (opts && opts.version != null) ? opts.version : null,
    timestamp: Date.now(),
    payload: payload != null ? payload : {}
  };
}

export function createIntent(intent, params) {
  return createMessage(MESSAGE_TYPES.INTENT, {
    intent,
    intent_id: uuid(),
    params: params != null ? params : {}
  });
}

export function createSnapshotRequest() {
  return createMessage(MESSAGE_TYPES.SNAPSHOT_REQUEST, {});
}

export function isStaleContext(incoming, current) {
  return incoming.version <= current.version;
}

// app -> companion full state snapshot (last-wins, never a delta). Missing
// fields normalise so a partial caller can't leak undefined onto the wire.
export function createAppState(state) {
  var s = state != null ? state : {};
  return createMessage(MESSAGE_TYPES.APP_STATE, {
    screen: s.screen != null ? s.screen : null,
    itemId: s.itemId != null ? s.itemId : null,
    episodeId: s.episodeId != null ? s.episodeId : null,
    positionSec: s.positionSec != null ? s.positionSec : 0,
    durationSec: s.durationSec != null ? s.durationSec : null,
    playing: !!s.playing,
    profile: s.profile != null ? s.profile : null,
    captionsOn: !!s.captionsOn
  });
}

export function createPlayIntent(id) {
  return createIntent(INTENTS.PLAY, { id: id != null ? id : null });
}
export function createSkipIntent(deltaSec) {
  return createIntent(INTENTS.SKIP, { deltaSec: deltaSec });
}
export function createNextIntent() { return createIntent(INTENTS.NEXT, {}); }
export function createPrevIntent() { return createIntent(INTENTS.PREV, {}); }
export function createSetProfileIntent(profile) {
  return createIntent(INTENTS.SET_PROFILE, { profile: profile });
}
export function createToggleCaptionsIntent() {
  return createIntent(INTENTS.TOGGLE_CAPTIONS, {});
}

// Local position interpolation between heartbeats. elapsedSec is measured
// against the COMPANION's own receive clock (not the app timestamp) so
// cross-device clock skew can never desync the scrub bar.
export function interpolatePosition(snap, elapsedSec) {
  if (snap == null) return 0;
  var base = snap.positionSec != null ? snap.positionSec : 0;
  var pos = snap.playing ? base + Math.max(0, elapsedSec || 0) : base;
  if (snap.durationSec != null) pos = Math.min(pos, snap.durationSec);
  return Math.max(0, pos);
}

// ~1 Hz emit scaffold for the player screen (wired in TASK-119). Scheduler is
// injectable so it unit-tests without real timers. Idempotent start/stop.
export function createHeartbeat(emit, opts) {
  var o = opts != null ? opts : {};
  var intervalMs = o.intervalMs != null ? o.intervalMs : 1000;
  var schedule = o.setInterval || (typeof setInterval !== 'undefined' ? setInterval : null);
  var cancel = o.clearInterval || (typeof clearInterval !== 'undefined' ? clearInterval : null);
  var timer = null;
  return {
    start: function() { if (timer == null && schedule) timer = schedule(emit, intervalMs); },
    stop: function() { if (timer != null && cancel) { cancel(timer); timer = null; } },
    running: function() { return timer != null; }
  };
}
