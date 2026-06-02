import { EVENTS, SOURCES, createEvent } from '../../core/telemetry-schema.js';

describe('EVENTS', () => {
  it('has COMMAND_RECEIVED', () => expect(EVENTS.COMMAND_RECEIVED).toBe('COMMAND_RECEIVED'));
  it('has COMMAND_EXECUTED', () => expect(EVENTS.COMMAND_EXECUTED).toBe('COMMAND_EXECUTED'));
  it('has COMMAND_BROADCAST', () => expect(EVENTS.COMMAND_BROADCAST).toBe('COMMAND_BROADCAST'));
  it('has VIDEO_PLAY', () => expect(EVENTS.VIDEO_PLAY).toBe('VIDEO_PLAY'));
  it('has VIDEO_PAUSE', () => expect(EVENTS.VIDEO_PAUSE).toBe('VIDEO_PAUSE'));
  it('has VIDEO_BUFFER_START', () => expect(EVENTS.VIDEO_BUFFER_START).toBe('VIDEO_BUFFER_START'));
  it('has VIDEO_BUFFER_END', () => expect(EVENTS.VIDEO_BUFFER_END).toBe('VIDEO_BUFFER_END'));
  it('has SEEK', () => expect(EVENTS.SEEK).toBe('SEEK'));
  it('has FRAME_DROPPED', () => expect(EVENTS.FRAME_DROPPED).toBe('FRAME_DROPPED'));
  it('has CLIENT_CONNECTED', () => expect(EVENTS.CLIENT_CONNECTED).toBe('CLIENT_CONNECTED'));
  it('has CLIENT_DISCONNECTED', () => expect(EVENTS.CLIENT_DISCONNECTED).toBe('CLIENT_DISCONNECTED'));
});

describe('SOURCES', () => {
  it('has TV', () => expect(SOURCES.TV).toBe('TV'));
  it('has SERVER', () => expect(SOURCES.SERVER).toBe('SERVER'));
});

describe('createEvent', () => {
  it('sets event and source', () => {
    const e = createEvent(EVENTS.VIDEO_PLAY, SOURCES.TV);
    expect(e.event).toBe('VIDEO_PLAY');
    expect(e.source).toBe('TV');
  });

  it('sets timestamp as number', () => {
    const e = createEvent(EVENTS.VIDEO_PLAY, SOURCES.TV);
    expect(typeof e.timestamp).toBe('number');
  });

  it('defaults command_id and command to null', () => {
    const e = createEvent(EVENTS.VIDEO_PLAY, SOURCES.TV);
    expect(e.command_id).toBeNull();
    expect(e.command).toBeNull();
  });

  it('defaults meta to empty object', () => {
    const e = createEvent(EVENTS.VIDEO_PLAY, SOURCES.TV);
    expect(e.meta).toEqual({});
  });

  it('sets commandId, command, meta when provided', () => {
    const e = createEvent(EVENTS.COMMAND_RECEIVED, SOURCES.SERVER, {
      commandId: 'abc-123',
      command: 'PLAY',
      meta: { videoId: 'v1' },
    });
    expect(e.command_id).toBe('abc-123');
    expect(e.command).toBe('PLAY');
    expect(e.meta).toEqual({ videoId: 'v1' });
  });
});
