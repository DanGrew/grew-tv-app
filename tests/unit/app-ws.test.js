import { vi } from 'vitest';
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

var store;

beforeEach(() => {
  MockWS.instances = [];
  global.WebSocket = MockWS;
  store = {};
  vi.stubGlobal('localStorage', {
    getItem:    (k) => (k in store ? store[k] : null),
    setItem:    (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

  // FEAT-026 Phase 2 (TASK-158): durable device registration + person activation.
  it('registers the device on open (mints + persists a device id)', () => {
    connectApp('ws://host:8766', () => {});
    MockWS.instances[0].onopen();
    var reg = MockWS.instances[0].sent.find(m => m.type === 'register_device');
    expect(reg).toBeTruthy();
    expect(reg.payload.device_id).toBe(localStorage.getItem('grew-tv-device'));
    expect(reg.payload.device_id).toBeTruthy();
  });

  it('activates the active person on open, after register_device', () => {
    store['grew-tv-person'] = 'mom';
    connectApp('ws://host:8766', () => {});
    MockWS.instances[0].onopen();
    var sent = MockWS.instances[0].sent.map(m => m.type);
    expect(sent.indexOf('register_device')).toBeGreaterThanOrEqual(0);
    expect(sent.indexOf('activate_person')).toBeGreaterThan(sent.indexOf('register_device'));
    var act = MockWS.instances[0].sent.find(m => m.type === 'activate_person');
    expect(act.payload.person_id).toBe('mom');
    expect(act.payload.takeover).toBe(false);
  });

  it('does not activate a person when none is set', () => {
    connectApp('ws://host:8766', () => {});
    MockWS.instances[0].onopen();
    expect(MockWS.instances[0].sent.find(m => m.type === 'activate_person')).toBeFalsy();
  });

  it('with skipAutoActivate, releases its lock on open instead of re-claiming the person', () => {
    store['grew-tv-person'] = 'mom';   // stale person must NOT be re-claimed
    connectApp('ws://host:8766', () => {}, { skipAutoActivate: true });
    MockWS.instances[0].onopen();
    var act = MockWS.instances[0].sent.find(m => m.type === 'activate_person');
    expect(act).toBeTruthy();
    expect(act.payload.person_id).toBeNull();   // release, not activate
  });

  it('stamps the active person onto every app_state snapshot', () => {
    store['grew-tv-person'] = 'dad';
    var api = connectApp('ws://host:8766', () => {});
    api.sendAppState({ screen: 'home', profile: 'adults' });
    var msg = MockWS.instances[0].sent.find(m => m.type === 'app_state');
    expect(msg.payload.person).toBe('dad');
  });

  it('reconnect re-registers the same device id', () => {
    connectApp('ws://host:8766', () => {});
    MockWS.instances[0].onopen();
    var first = MockWS.instances[0].sent.find(m => m.type === 'register_device').payload.device_id;
    MockWS.instances[0].close();
    vi.advanceTimersByTime(2001);
    MockWS.instances[1].onopen();
    var second = MockWS.instances[1].sent.find(m => m.type === 'register_device').payload.device_id;
    expect(second).toBe(first);
  });

  it('inbound deactivated invokes the onDeactivated callback', () => {
    var hit = 0;
    connectApp('ws://host:8766', () => {}, { onDeactivated: () => { hit++; } });
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'deactivated', payload: { person_id: 'mom' } }) });
    expect(hit).toBe(1);
  });

  it('routes person_active / person_busy to their callbacks', () => {
    var active = null;
    var busy = null;
    connectApp('ws://host:8766', () => {}, {
      onPersonActive: (p) => { active = p; },
      onPersonBusy: (p) => { busy = p; }
    });
    var ws = MockWS.instances[0];
    ws.onmessage({ data: JSON.stringify({ type: 'person_active', payload: { person_id: 'mom', device_id: 'devA' } }) });
    ws.onmessage({ data: JSON.stringify({ type: 'person_busy', payload: { person_id: 'mom', device_id: 'devB', label: 'Bedroom' } }) });
    expect(active.person_id).toBe('mom');
    expect(busy.label).toBe('Bedroom');
  });

  it('activatePerson sends activate_person with the device id + takeover flag', () => {
    var api = connectApp('ws://host:8766', () => {});
    MockWS.instances[0].sent.length = 0;
    api.activatePerson('millie', true);
    var act = MockWS.instances[0].sent.find(m => m.type === 'activate_person');
    expect(act.payload.person_id).toBe('millie');
    expect(act.payload.takeover).toBe(true);
    expect(act.payload.device_id).toBe(localStorage.getItem('grew-tv-device'));
  });
});
