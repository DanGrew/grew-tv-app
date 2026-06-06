import { connectApp } from '../../core/app-ws.js';

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

describe('connectApp', () => {
  it('creates WebSocket with given URL', () => {
    connectApp('ws://host:8766', () => {});
    expect(MockWS.instances[0].url).toBe('ws://host:8766');
  });

  it('sendContext sends context_push when open', () => {
    var api = connectApp('ws://host:8766', () => {});
    api.sendContext({ context_id: 'profile' });
    expect(MockWS.instances[0].sent.find(m => m.type === 'context_push').payload.context_id).toBe('profile');
  });

  it('resends pending context on reconnect', () => {
    var api = connectApp('ws://host:8766', () => {});
    api.sendContext({ context_id: 'browse' });
    MockWS.instances[0].close();
    vi.advanceTimersByTime(2001);
    MockWS.instances[1].onopen();
    expect(MockWS.instances[1].sent.find(m => m.type === 'context_push').payload.context_id).toBe('browse');
  });

  it('dispatches intent to callback', () => {
    var received = [];
    connectApp('ws://host:8766', function(intent, params) { received.push({ intent, params }); });
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'intent', payload: { intent: 'select', params: {} } }) });
    expect(received[0].intent).toBe('select');
  });

  it('sends pong on ping', () => {
    connectApp('ws://host:8766', () => {});
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'ping' }) });
    expect(MockWS.instances[0].sent.find(m => m.type === 'pong')).toBeTruthy();
  });

  it('watchdog closes stale connection after 20s without ping', () => {
    connectApp('ws://host:8766', () => {});
    var ws = MockWS.instances[0];
    var closed = false;
    ws.close = function() { closed = true; };
    vi.advanceTimersByTime(25000);
    expect(closed).toBe(true);
  });

  it('sendAppState sends an app_state full snapshot', () => {
    var api = connectApp('ws://host:8766', () => {});
    api.sendAppState({ screen: 'player', itemId: 'ollie-car', positionSec: 12, playing: true });
    var msg = MockWS.instances[0].sent.find(m => m.type === 'app_state');
    expect(msg.payload.itemId).toBe('ollie-car');
    expect(msg.payload.playing).toBe(true);
  });

  it('resends last app_state on reconnect (snapshot re-sync)', () => {
    var api = connectApp('ws://host:8766', () => {});
    api.sendAppState({ screen: 'player', itemId: 'film-7', positionSec: 99 });
    MockWS.instances[0].close();
    vi.advanceTimersByTime(2001);
    MockWS.instances[1].onopen();
    var msg = MockWS.instances[1].sent.find(m => m.type === 'app_state');
    expect(msg.payload.itemId).toBe('film-7');
  });
});
