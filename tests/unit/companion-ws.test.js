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

  it('sendIntent passes params', () => {
    var api = connect('ws://host:8766', () => {}, () => {});
    MockWS.instances[0].onopen();
    var before = MockWS.instances[0].sent.length;
    api.sendIntent('select', { id: 'film-1' });
    expect(MockWS.instances[0].sent[before].payload.params).toEqual({ id: 'film-1' });
  });
});
