import {
  MESSAGE_TYPES,
  INTENTS,
  SKIP_DELTAS,
  SESSION_ID,
  createMessage,
  createIntent,
  createSnapshotRequest,
  isStaleContext,
  createAppState,
  createPlayIntent,
  createSkipIntent,
  createNextIntent,
  createPrevIntent,
  createSetProfileIntent,
  createToggleCaptionsIntent,
  createShuffleIntent,
  createPlayAlbumIntent,
  interpolatePosition,
  createHeartbeat
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

describe('APP_STATE message type', () => {
  it('is app_state', () => expect(MESSAGE_TYPES.APP_STATE).toBe('app_state'));
});

describe('INTENTS', () => {
  it('has the FEAT-017 six plus the FEAT-018 music pair', () => {
    expect(INTENTS).toEqual({
      PLAY: 'play', SKIP: 'skip', NEXT: 'next', PREV: 'prev',
      SET_PROFILE: 'setProfile', TOGGLE_CAPTIONS: 'toggleCaptions',
      SHUFFLE: 'shuffle', PLAY_ALBUM: 'playAlbum'
    });
  });
});

describe('SKIP_DELTAS', () => {
  it('is the graduated ladder 10s..30m', () => {
    expect(SKIP_DELTAS).toEqual([10, 30, 120, 600, 1800]);
  });
});

describe('createAppState', () => {
  it('builds an app_state message', () => {
    expect(createAppState({}).type).toBe('app_state');
  });

  it('passes through all snapshot fields (incl. FEAT-018 shuffle)', () => {
    const p = createAppState({
      screen: 'player', itemId: 'ootb', episodeId: 'ootb-02',
      positionSec: 42, durationSec: 380, playing: true,
      profile: 'kids', captionsOn: true, shuffle: true
    }).payload;
    expect(p).toEqual({
      screen: 'player', itemId: 'ootb', episodeId: 'ootb-02',
      positionSec: 42, durationSec: 380, playing: true,
      profile: 'kids', captionsOn: true, shuffle: true
    });
  });

  it('normalises missing fields (no undefined on the wire)', () => {
    const p = createAppState().payload;
    expect(p.screen).toBeNull();
    expect(p.positionSec).toBe(0);
    expect(p.durationSec).toBeNull();
    expect(p.playing).toBe(false);
    expect(p.captionsOn).toBe(false);
    expect(p.shuffle).toBe(false);
  });
});

describe('intent builders', () => {
  it('createPlayIntent carries id', () => {
    const m = createPlayIntent('film-1');
    expect(m.payload.intent).toBe('play');
    expect(m.payload.params.id).toBe('film-1');
  });
  it('createPlayIntent defaults id to null', () => {
    expect(createPlayIntent().payload.params.id).toBeNull();
  });
  it('createSkipIntent carries deltaSec', () => {
    const m = createSkipIntent(-30);
    expect(m.payload.intent).toBe('skip');
    expect(m.payload.params.deltaSec).toBe(-30);
  });
  it('createNextIntent / createPrevIntent set intent', () => {
    expect(createNextIntent().payload.intent).toBe('next');
    expect(createPrevIntent().payload.intent).toBe('prev');
  });
  it('createSetProfileIntent carries profile', () => {
    expect(createSetProfileIntent('adults').payload.params.profile).toBe('adults');
  });
  it('createToggleCaptionsIntent sets intent', () => {
    expect(createToggleCaptionsIntent().payload.intent).toBe('toggleCaptions');
  });
  it('createShuffleIntent sets the shuffle intent', () => {
    expect(createShuffleIntent().payload.intent).toBe('shuffle');
  });
  it('createPlayAlbumIntent carries the album id, defaulting to null', () => {
    expect(createPlayAlbumIntent('ootb').payload.intent).toBe('playAlbum');
    expect(createPlayAlbumIntent('ootb').payload.params.id).toBe('ootb');
    expect(createPlayAlbumIntent().payload.params.id).toBeNull();
  });
});

describe('interpolatePosition', () => {
  it('returns 0 for no snapshot', () => {
    expect(interpolatePosition(null, 5)).toBe(0);
  });
  it('returns base position when paused (ignores elapsed)', () => {
    expect(interpolatePosition({ positionSec: 30, playing: false }, 10)).toBe(30);
  });
  it('advances by elapsed when playing', () => {
    expect(interpolatePosition({ positionSec: 30, playing: true }, 10)).toBe(40);
  });
  it('clamps to durationSec', () => {
    expect(interpolatePosition({ positionSec: 595, durationSec: 600, playing: true }, 30)).toBe(600);
  });
  it('never returns negative', () => {
    expect(interpolatePosition({ positionSec: 0, playing: true }, -5)).toBe(0);
  });
});

describe('createHeartbeat', () => {
  it('start schedules emit at the interval; stop cancels; idempotent', () => {
    let scheduled = null, cleared = null, nextId = 1;
    const hb = createHeartbeat(() => {}, {
      intervalMs: 1000,
      setInterval: (fn, ms) => { scheduled = { fn, ms }; return nextId++; },
      clearInterval: (id) => { cleared = id; }
    });
    expect(hb.running()).toBe(false);
    hb.start();
    expect(hb.running()).toBe(true);
    expect(scheduled.ms).toBe(1000);
    const before = nextId;
    hb.start();                       // idempotent — no second schedule
    expect(nextId).toBe(before);
    hb.stop();
    expect(hb.running()).toBe(false);
    expect(cleared).toBe(1);
  });

  it('emit fn is the one passed in', () => {
    let ticks = 0;
    const hb = createHeartbeat(() => { ticks++; }, {
      setInterval: (fn) => { fn(); return 1; },
      clearInterval: () => {}
    });
    hb.start();
    expect(ticks).toBe(1);
  });
});
