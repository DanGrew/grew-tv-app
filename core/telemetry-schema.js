export const EVENTS = {
  COMMAND_RECEIVED: 'COMMAND_RECEIVED',
  COMMAND_EXECUTED: 'COMMAND_EXECUTED',
  COMMAND_BROADCAST: 'COMMAND_BROADCAST',
  VIDEO_PLAY: 'VIDEO_PLAY',
  VIDEO_PAUSE: 'VIDEO_PAUSE',
  VIDEO_BUFFER_START: 'VIDEO_BUFFER_START',
  VIDEO_BUFFER_END: 'VIDEO_BUFFER_END',
  SEEK: 'SEEK',
  FRAME_DROPPED: 'FRAME_DROPPED',
  CLIENT_CONNECTED: 'CLIENT_CONNECTED',
  CLIENT_DISCONNECTED: 'CLIENT_DISCONNECTED',
};

export const SOURCES = {
  TV: 'TV',
  SERVER: 'SERVER',
};

export function createEvent(event, source, { commandId, command, meta } = {}) {
  return {
    event,
    source,
    command_id: commandId ?? null,
    command: command ?? null,
    timestamp: Date.now(),
    meta: meta ?? {},
  };
}
