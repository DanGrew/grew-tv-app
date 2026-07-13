export const MESSAGE_TYPES = {
  CONTEXT: 'context',
  INTENT: 'intent',
  SNAPSHOT: 'snapshot',
  SNAPSHOT_REQUEST: 'snapshot_request',
  APP_STATE: 'app_state',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong',
  // FEAT-026 Phase 2 (TASK-157/158): device + person registries, addressed relay.
  REGISTER_DEVICE: 'register_device',
  ACTIVATE_PERSON: 'activate_person',
  REGISTER_COMPANION: 'register_companion',
  LIST_DEVICES: 'list_devices',
  PERSON_ACTIVE: 'person_active',
  PERSON_BUSY: 'person_busy',
  DEACTIVATED: 'deactivated',
  DEVICES: 'devices'
};

// Companion -> app intents (FEAT-017). Extends the legacy skip intents.
// FEAT-018 (TASK-132) adds the music pair: SHUFFLE toggles the queue order,
// PLAY_ALBUM teleports the TV to an album (a single track reuses PLAY with id).
// FEAT-031 (TASK-214) adds PLAY_ARTIST — the companion's artist Play header
// drives the TV's artist screen to the player on that artist source (Shuffle
// reuses SHUFFLE, mirroring the album-detail header pair).
export const INTENTS = {
  PLAY: 'play',
  SKIP: 'skip',
  NEXT: 'next',
  PREV: 'prev',
  SET_PROFILE: 'setProfile',
  TOGGLE_CAPTIONS: 'toggleCaptions',
  SHUFFLE: 'shuffle',
  PLAY_ALBUM: 'playAlbum',
  PLAY_ARTIST: 'playArtist'
};

// Graduated relative skips: ±10s / 30s / 2m / 10m / 30m. Relative only —
// no absolute seek crosses the wire (companion never knows true position).
export const SKIP_DELTAS = [10, 30, 120, 600, 1800];

export const SESSION_ID = 'grew-tv';

export function uuid() {
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
    // FEAT-026 TASK-158: the active person rides the snapshot so a targeting
    // companion can key its Continue-Watching reads per person (closes the
    // TASK-155 carry-forward — CW was left without ?person=).
    person: s.person != null ? s.person : null,
    captionsOn: !!s.captionsOn,
    shuffle: !!s.shuffle,
    // TASK-239: the ambient-lyrics pref rides the snapshot so the companion audio
    // player's Lyrics pill seeds + stays in sync with the TV (mirrors shuffle).
    lyricsOn: !!s.lyricsOn
  });
}

// FEAT-026 Phase 2 (TASK-158) — registry/relay builders consumed by TASK-157.
// A screen self-registers a durable device_id, then declares its active person;
// a companion declares the screen it drives and can list screens to pick one.
export function createRegisterDevice(deviceId, label) {
  return createMessage(MESSAGE_TYPES.REGISTER_DEVICE, {
    device_id: deviceId,
    label: label != null ? label : null
  });
}
export function createActivatePerson(deviceId, personId, takeover) {
  return createMessage(MESSAGE_TYPES.ACTIVATE_PERSON, {
    device_id: deviceId,
    person_id: personId,
    takeover: !!takeover
  });
}
export function createRegisterCompanion(deviceId) {
  return createMessage(MESSAGE_TYPES.REGISTER_COMPANION, { device_id: deviceId });
}
export function createListDevices() {
  return createMessage(MESSAGE_TYPES.LIST_DEVICES, {});
}

export function createSkipIntent(deltaSec) {
  return createIntent(INTENTS.SKIP, { deltaSec: deltaSec });
}
export function createSetProfileIntent(profile) {
  return createIntent(INTENTS.SET_PROFILE, { profile: profile });
}
export function createToggleCaptionsIntent() {
  return createIntent(INTENTS.TOGGLE_CAPTIONS, {});
}
export function createPlayAlbumIntent(id) {
  return createIntent(INTENTS.PLAY_ALBUM, { id: id != null ? id : null });
}
export function createPlayArtistIntent(id) {
  return createIntent(INTENTS.PLAY_ARTIST, { id: id != null ? id : null });
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
  // globalThis is universal (browser kiosk + node), so read the ambient timers off
  // it directly rather than a typeof guard a Node test runner can never observe.
  var schedule = o.setInterval || globalThis.setInterval;
  var cancel = o.clearInterval || globalThis.clearInterval;
  var timer = null;
  return {
    start: function() { if (timer == null && schedule) timer = schedule(emit, intervalMs); },
    stop: function() { if (timer != null && cancel) { cancel(timer); timer = null; } },
    running: function() { return timer != null; }
  };
}
