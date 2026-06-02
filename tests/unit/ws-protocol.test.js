import {
  MESSAGE_TYPES,
  SESSION_ID,
  createMessage,
  createIntent,
  createSnapshotRequest,
  isStaleContext
} from '../../core/ws-protocol.js';

describe('MESSAGE_TYPES', () => {
  it('has CONTEXT', () => expect(MESSAGE_TYPES.CONTEXT).toBe('context'));
  it('has INTENT', () => expect(MESSAGE_TYPES.INTENT).toBe('intent'));
  it('has SNAPSHOT', () => expect(MESSAGE_TYPES.SNAPSHOT).toBe('snapshot'));
  it('has SNAPSHOT_REQUEST', () => expect(MESSAGE_TYPES.SNAPSHOT_REQUEST).toBe('snapshot_request'));
  it('has ERROR', () => expect(MESSAGE_TYPES.ERROR).toBe('error'));
  it('has PING', () => expect(MESSAGE_TYPES.PING).toBe('ping'));
  it('has PONG', () => expect(MESSAGE_TYPES.PONG).toBe('pong'));
});

describe('SESSION_ID', () => {
  it('is grew-tv', () => expect(SESSION_ID).toBe('grew-tv'));
});

describe('createMessage', () => {
  it('sets type', () => {
    const msg = createMessage('context', {}, {});
    expect(msg.type).toBe('context');
  });

  it('sets session_id', () => {
    const msg = createMessage('context', {}, {});
    expect(msg.session_id).toBe('grew-tv');
  });

  it('sets message_id as uuid', () => {
    const msg = createMessage('context', {}, {});
    expect(msg.message_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets timestamp', () => {
    const before = Date.now();
    const msg = createMessage('context', {}, {});
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('sets payload', () => {
    const msg = createMessage('context', { foo: 1 }, {});
    expect(msg.payload).toEqual({ foo: 1 });
  });

  it('defaults payload to empty object', () => {
    const msg = createMessage('context', null, {});
    expect(msg.payload).toEqual({});
  });

  it('sets version from opts', () => {
    const msg = createMessage('context', {}, { version: 3 });
    expect(msg.version).toBe(3);
  });

  it('defaults version to null', () => {
    const msg = createMessage('context', {}, {});
    expect(msg.version).toBeNull();
  });
});

describe('createIntent', () => {
  it('type is intent', () => {
    const msg = createIntent('pause');
    expect(msg.type).toBe('intent');
  });

  it('payload has intent field', () => {
    const msg = createIntent('pause');
    expect(msg.payload.intent).toBe('pause');
  });

  it('payload has intent_id as uuid', () => {
    const msg = createIntent('pause');
    expect(msg.payload.intent_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('payload has params', () => {
    const msg = createIntent('seek', { position: 42 });
    expect(msg.payload.params).toEqual({ position: 42 });
  });

  it('defaults params to empty object', () => {
    const msg = createIntent('pause');
    expect(msg.payload.params).toEqual({});
  });
});

describe('createSnapshotRequest', () => {
  it('type is snapshot_request', () => {
    const msg = createSnapshotRequest();
    expect(msg.type).toBe('snapshot_request');
  });

  it('has session_id', () => {
    const msg = createSnapshotRequest();
    expect(msg.session_id).toBe('grew-tv');
  });
});

describe('isStaleContext', () => {
  it('returns true when incoming version less than current', () => {
    expect(isStaleContext({ version: 1 }, { version: 2 })).toBe(true);
  });

  it('returns true when incoming version equals current', () => {
    expect(isStaleContext({ version: 2 }, { version: 2 })).toBe(true);
  });

  it('returns false when incoming version greater than current', () => {
    expect(isStaleContext({ version: 3 }, { version: 2 })).toBe(false);
  });
});
