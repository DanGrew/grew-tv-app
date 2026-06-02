export const MESSAGE_TYPES = {
  CONTEXT: 'context',
  INTENT: 'intent',
  SNAPSHOT: 'snapshot',
  SNAPSHOT_REQUEST: 'snapshot_request',
  ERROR: 'error',
  PING: 'ping',
  PONG: 'pong'
};

export const SESSION_ID = 'grew-tv';

export function createMessage(type, payload, opts) {
  return {
    type,
    session_id: SESSION_ID,
    message_id: crypto.randomUUID(),
    version: (opts && opts.version != null) ? opts.version : null,
    timestamp: Date.now(),
    payload: payload != null ? payload : {}
  };
}

export function createIntent(intent, params) {
  return createMessage(MESSAGE_TYPES.INTENT, {
    intent,
    intent_id: crypto.randomUUID(),
    params: params != null ? params : {}
  });
}

export function createSnapshotRequest() {
  return createMessage(MESSAGE_TYPES.SNAPSHOT_REQUEST, {});
}

export function isStaleContext(incoming, current) {
  return incoming.version <= current.version;
}
