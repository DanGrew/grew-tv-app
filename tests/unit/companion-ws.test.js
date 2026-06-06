import { connect } from '../../core/companion-ws.js';

class MockWS {
  constructor(url) {
    this.url = url;
    this.readyState = MockWS.OPEN;
    this.sent = [];
    MockWS.instances.push(this);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { if (this.onclose) this.onclose(); }
}
MockWS.OPEN = 1;
MockWS.instances = [];

beforeEach(() => {
  MockWS.instances = [];
  global.WebSocket = MockWS;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connect', () => {
  it('creates WebSocket with given URL', () => {
    connect('ws://host:8766', () => {}, () => {});
    expect(MockWS.instances[0].url).toBe('ws://host:8766');
  });

  it('sends snapshot_request on open', () => {
    connect('ws://host:8766', () => {}, () => {});
    MockWS.instances[0].onopen();
    expect(MockWS.instances[0].sent[0].type).toBe('snapshot_request');
  });

  it('calls onStatus connected on open', () => {
    var statuses = [];
    connect('ws://host:8766', () => {}, function(s) { statuses.push(s); });
    MockWS.instances[0].onopen();
    expect(statuses[0]).toBe('connected');
  });

  it('calls onContext for snapshot message', () => {
    var received = [];
    connect('ws://host:8766', function(p) { received.push(p); }, () => {});
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'snapshot', payload: { version: 1 } }) });
    expect(received).toHaveLength(1);
    expect(received[0].version).toBe(1);
  });

  it('calls onContext for context message', () => {
    var received = [];
    connect('ws://host:8766', function(p) { received.push(p); }, () => {});
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'context', payload: { version: 1 } }) });
    expect(received).toHaveLength(1);
  });

  it('ignores stale snapshot', () => {
    var received = [];
    connect('ws://host:8766', function(p) { received.push(p); }, () => {});
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'snapshot', payload: { version: 5 } }) });
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'snapshot', payload: { version: 3 } }) });
    expect(received).toHaveLength(1);
    expect(received[0].version).toBe(5);
  });

  it('sends pong on ping', () => {
    connect('ws://host:8766', () => {}, () => {});
    MockWS.instances[0].onopen();
    var before = MockWS.instances[0].sent.length;
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'ping' }) });
    expect(MockWS.instances[0].sent[before].type).toBe('pong');
  });

  it('calls onStatus reconnecting on close', () => {
    var statuses = [];
    connect('ws://host:8766', () => {}, function(s) { statuses.push(s); });
    MockWS.instances[0].onclose();
    expect(statuses).toContain('reconnecting\u2026');
  });

  it('calls onStatus error on error', () => {
    var statuses = [];
    connect('ws://host:8766', () => {}, function(s) { statuses.push(s); });
    MockWS.instances[0].onerror();
    expect(statuses).toContain('error');
  });

  it('sendIntent sends intent message when open', () => {
    var api = connect('ws://host:8766', () => {}, () => {});
    MockWS.instances[0].onopen();
    var before = MockWS.instances[0].sent.length;
    api.sendIntent('pause');
    expect(MockWS.instances[0].sent[before].type).toBe('intent');
    expect(MockWS.instances[0].sent[before].payload.intent).toBe('pause');
  });

  it('calls onAppState for app_state message', () => {
    var received = [];
    connect('ws://host:8766', () => {}, () => {}, function(p) { received.push(p); });
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'app_state', payload: { itemId: 'ollie-car', positionSec: 5, playing: true } }) });
    expect(received).toHaveLength(1);
    expect(received[0].itemId).toBe('ollie-car');
  });

  it('appState() returns the last snapshot payload', () => {
    var api = connect('ws://host:8766', () => {}, () => {});
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'app_state', payload: { itemId: 'film-3', playing: false } }) });
    expect(api.appState().itemId).toBe('film-3');
  });

  it('position() interpolates while playing using local clock', () => {
    var t = 1000;
    vi.setSystemTime(t);
    var api = connect('ws://host:8766', () => {}, () => {});
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'app_state', payload: { positionSec: 30, durationSec: 600, playing: true } }) });
    vi.setSystemTime(t + 10000);   // +10s local
    expect(api.position()).toBe(40);
  });

  it('position() holds steady when paused', () => {
    var api = connect('ws://host:8766', () => {}, () => {});
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'app_state', payload: { positionSec: 30, playing: false } }) });
    vi.advanceTimersByTime(10000);
    expect(api.position()).toBe(30);
  });

  it('new intent senders emit correct intents', () => {
    var api = connect('ws://host:8766', () => {}, () => {});
    MockWS.instances[0].onopen();
    var ws = MockWS.instances[0];
    api.play('film-1');
    expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('play');
    expect(ws.sent[ws.sent.length - 1].payload.params.id).toBe('film-1');
    api.skip(-30);
    expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('skip');
    expect(ws.sent[ws.sent.length - 1].payload.params.deltaSec).toBe(-30);
    api.next();
    expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('next');
    api.prev();
    expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('prev');
    api.setProfile('kids');
    expect(ws.sent[ws.sent.length - 1].payload.params.profile).toBe('kids');
    api.toggleCaptions();
    expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('toggleCaptions');
  });

  it('sendIntent passes params', () => {
    var api = connect('ws://host:8766', () => {}, () => {});
    MockWS.instances[0].onopen();
    var before = MockWS.instances[0].sent.length;
    api.sendIntent('select', { id: 'film-1' });
    expect(MockWS.instances[0].sent[before].payload.params).toEqual({ id: 'film-1' });
  });
});
