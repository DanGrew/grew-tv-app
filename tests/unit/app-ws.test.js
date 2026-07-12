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
  // TASK-297: connectApp() now resolves the WS port from <origin>/api/config
  // (server-config.fetchWsUrl) before opening the socket. Mock that fetch + the
  // page host so the resolved url is ws://host:8766 — what the tests assert.
  global.location = { hostname: 'host' };
  global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ wsPort: 8766 }) }));
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
  delete global.location;
  delete global.fetch;
});

// The socket opens only after the /api/config fetch chain resolves — flush the
// microtask queue so MockWS.instances[0] exists before we drive it.
async function tick() {
  for (var i = 0; i < 20; i++) await Promise.resolve();
}

// connectApp() + wait for the deferred socket; returns { api, ws }.
async function boot(...args) {
  var api = connectApp(...args);
  await tick();
  return { api: api, ws: MockWS.instances[0] };
}

describe('connectApp', () => {
  it('creates WebSocket with the URL resolved from /api/config', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    expect(ws.url).toBe('ws://host:8766');
  });

  // TASK-297: the origin is passed to connectApp, and the WS port is read from
  // that origin's /api/config (not hardcoded), so a TV served off :8770 gets
  // whatever port the server reports.
  it('reads the WS port from the served origin (not hardcoded 8766)', async () => {
    global.location = { hostname: 'host' };
    global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ wsPort: 8770 }) }));
    var { ws } = await boot('http://host:8770', () => {});
    expect(global.fetch).toHaveBeenCalledWith('http://host:8770/api/config');
    expect(ws.url).toBe('ws://host:8770');
  });

  it('sendContext sends context_push when open', async () => {
    var { api, ws } = await boot('http://host:8766', () => {});
    api.sendContext({ context_id: 'profile' });
    expect(ws.sent.find(m => m.type === 'context_push').payload.context_id).toBe('profile');
  });

  it('resends pending context on reconnect', async () => {
    var { api, ws } = await boot('http://host:8766', () => {});
    api.sendContext({ context_id: 'browse' });
    ws.close();
    vi.advanceTimersByTime(2001);   // reconnect reuses the resolved url — no re-fetch
    MockWS.instances[1].onopen();
    expect(MockWS.instances[1].sent.find(m => m.type === 'context_push').payload.context_id).toBe('browse');
  });

  it('dispatches intent to callback', async () => {
    var received = [];
    var { ws } = await boot('http://host:8766', function(intent, params) { received.push({ intent, params }); });
    ws.onmessage({ data: JSON.stringify({ type: 'intent', payload: { intent: 'select', params: {} } }) });
    expect(received[0].intent).toBe('select');
  });

  it('sends pong on ping', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    ws.onmessage({ data: JSON.stringify({ type: 'ping' }) });
    expect(ws.sent.find(m => m.type === 'pong')).toBeTruthy();
  });

  it('watchdog closes stale connection after 20s without ping', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    var closed = false;
    ws.close = function() { closed = true; };
    vi.advanceTimersByTime(25000);
    expect(closed).toBe(true);
  });

  it('sendAppState sends an app_state full snapshot', async () => {
    var { api, ws } = await boot('http://host:8766', () => {});
    api.sendAppState({ screen: 'player', itemId: 'ollie-car', positionSec: 12, playing: true });
    var msg = ws.sent.find(m => m.type === 'app_state');
    expect(msg.payload.itemId).toBe('ollie-car');
    expect(msg.payload.playing).toBe(true);
  });

  it('resends last app_state on reconnect (snapshot re-sync)', async () => {
    var { api, ws } = await boot('http://host:8766', () => {});
    api.sendAppState({ screen: 'player', itemId: 'film-7', positionSec: 99 });
    ws.close();
    vi.advanceTimersByTime(2001);
    MockWS.instances[1].onopen();
    var msg = MockWS.instances[1].sent.find(m => m.type === 'app_state');
    expect(msg.payload.itemId).toBe('film-7');
  });

  // FEAT-026 Phase 2 (TASK-158): durable device registration + person activation.
  it('registers the device on open (mints + persists a device id)', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    ws.onopen();
    var reg = ws.sent.find(m => m.type === 'register_device');
    expect(reg).toBeTruthy();
    expect(reg.payload.device_id).toBe(localStorage.getItem('grew-tv-device'));
    expect(reg.payload.device_id).toBeTruthy();
  });

  it('activates the active person on open, after register_device', async () => {
    store['grew-tv-person'] = 'mom';
    var { ws } = await boot('http://host:8766', () => {});
    ws.onopen();
    var sent = ws.sent.map(m => m.type);
    expect(sent.indexOf('register_device')).toBeGreaterThanOrEqual(0);
    expect(sent.indexOf('activate_person')).toBeGreaterThan(sent.indexOf('register_device'));
    var act = ws.sent.find(m => m.type === 'activate_person');
    expect(act.payload.person_id).toBe('mom');
    expect(act.payload.takeover).toBe(false);
  });

  it('does not activate a person when none is set', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    ws.onopen();
    expect(ws.sent.find(m => m.type === 'activate_person')).toBeFalsy();
  });

  it('with skipAutoActivate, releases its lock on open instead of re-claiming the person', async () => {
    store['grew-tv-person'] = 'mom';   // stale person must NOT be re-claimed
    var { ws } = await boot('http://host:8766', () => {}, { skipAutoActivate: true });
    ws.onopen();
    var act = ws.sent.find(m => m.type === 'activate_person');
    expect(act).toBeTruthy();
    expect(act.payload.person_id).toBeNull();   // release, not activate
    expect(act.payload.takeover).toBe(false);   // a release is never a take-over
  });

  it('send before the socket resolves is a silent no-op (ws still null)', () => {
    var api = connectApp('http://host:8766', () => {});   // not awaited -> fetch unresolved, ws null
    expect(() => api.sendContext({ context_id: 'x' })).not.toThrow();
  });

  it('does not send when the socket is not OPEN', async () => {
    var { api, ws } = await boot('http://host:8766', () => {});
    ws.sent.length = 0;
    ws.readyState = 3;   // CLOSED
    api.sendContext({ context_id: 'x' });
    expect(ws.sent.length).toBe(0);
  });

  it('an intent message with no onIntent handler is a no-op (does not throw)', async () => {
    var { ws } = await boot('http://host:8766', null);
    expect(() => ws.onmessage({ data: JSON.stringify({ type: 'intent', payload: { intent: 'x', params: {} } }) })).not.toThrow();
  });

  it('optional verdict/playback handlers with no callback are no-ops', async () => {
    var { ws } = await boot('http://host:8766', () => {});   // no opts callbacks
    ['person_active', 'person_busy', 'playback', 'video_playback'].forEach(function(type) {
      expect(() => ws.onmessage({ data: JSON.stringify({ type: type, payload: {} }) })).not.toThrow();
    });
  });

  it('an unknown message type is ignored (does not throw)', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    expect(() => ws.onmessage({ data: JSON.stringify({ type: 'nonsense', payload: {} }) })).not.toThrow();
  });

  it('does not replay a context_push on open when none is pending', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    ws.sent.length = 0;
    ws.onopen();
    expect(ws.sent.find(m => m.type === 'context_push')).toBeFalsy();
  });

  it('watchdog before the socket resolves is a no-op (ws still null)', () => {
    connectApp('http://host:8766', () => {});   // not awaited -> ws null while the watchdog ticks
    expect(() => vi.advanceTimersByTime(25000)).not.toThrow();
  });

  it('watchdog does not close a fresh connection (< 20s since last ping)', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    var closed = false;
    ws.close = function() { closed = true; };
    vi.advanceTimersByTime(15000);
    expect(closed).toBe(false);
  });

  it('watchdog does not close at exactly 20s (boundary is strictly greater-than)', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    var closed = false;
    ws.close = function() { closed = true; };
    vi.advanceTimersByTime(20000);   // diff is exactly 20000 at the 20000ms tick
    expect(closed).toBe(false);
  });

  it('stamps the active person onto every app_state snapshot', async () => {
    store['grew-tv-person'] = 'dad';
    var { api, ws } = await boot('http://host:8766', () => {});
    api.sendAppState({ screen: 'home', profile: 'adults' });
    var msg = ws.sent.find(m => m.type === 'app_state');
    expect(msg.payload.person).toBe('dad');
  });

  it('keeps an explicit person on the snapshot (does not overwrite with localStorage)', async () => {
    store['grew-tv-person'] = 'dad';
    var { api, ws } = await boot('http://host:8766', () => {});
    api.sendAppState({ screen: 'home', person: 'mom' });   // explicit person wins over the stored one
    expect(ws.sent.find(m => m.type === 'app_state').payload.person).toBe('mom');
  });

  it('sendAppState tolerates a null/omitted snapshot', async () => {
    var { api, ws } = await boot('http://host:8766', () => {});
    expect(() => api.sendAppState()).not.toThrow();
    expect(ws.sent.find(m => m.type === 'app_state')).toBeTruthy();
  });

  it('ws.onerror is a no-op (never throws)', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    expect(() => ws.onerror()).not.toThrow();
  });

  it('reconnect re-registers the same device id', async () => {
    var { ws } = await boot('http://host:8766', () => {});
    ws.onopen();
    var first = ws.sent.find(m => m.type === 'register_device').payload.device_id;
    ws.close();
    vi.advanceTimersByTime(2001);
    MockWS.instances[1].onopen();
    var second = MockWS.instances[1].sent.find(m => m.type === 'register_device').payload.device_id;
    expect(second).toBe(first);
  });

  it('inbound deactivated invokes the onDeactivated callback', async () => {
    var hit = 0;
    var { ws } = await boot('http://host:8766', () => {}, { onDeactivated: () => { hit++; } });
    ws.onmessage({ data: JSON.stringify({ type: 'deactivated', payload: { person_id: 'mom' } }) });
    expect(hit).toBe(1);
  });

  it('routes person_active / person_busy to their callbacks', async () => {
    var active = null;
    var busy = null;
    var { ws } = await boot('http://host:8766', () => {}, {
      onPersonActive: (p) => { active = p; },
      onPersonBusy: (p) => { busy = p; }
    });
    ws.onmessage({ data: JSON.stringify({ type: 'person_active', payload: { person_id: 'mom', device_id: 'devA' } }) });
    ws.onmessage({ data: JSON.stringify({ type: 'person_busy', payload: { person_id: 'mom', device_id: 'devB', label: 'Bedroom' } }) });
    expect(active.person_id).toBe('mom');
    expect(busy.label).toBe('Bedroom');
  });

  it('routes a music playback snapshot to opts.onPlayback', async () => {
    var got = null;
    var { ws } = await boot('http://host:8766', () => {}, { onPlayback: (p) => { got = p; } });
    ws.onmessage({ data: JSON.stringify({ type: 'playback', payload: { now_playing: { item_id: 'ootb-01' } } }) });
    expect(got.now_playing.item_id).toBe('ootb-01');
  });

  it('routes a video playback snapshot to opts.onVideoPlayback', async () => {
    var got = null;
    var { ws } = await boot('http://host:8766', () => {}, { onVideoPlayback: (p) => { got = p; } });
    ws.onmessage({ data: JSON.stringify({ type: 'video_playback', payload: { now_playing: { item_id: 'bluey-s1e1' } } }) });
    expect(got.now_playing.item_id).toBe('bluey-s1e1');
  });

  it('deactivated with no onDeactivated override falls back to the profile picker (default)', async () => {
    global.location = { hostname: 'host', href: '' };
    var { ws } = await boot('http://host:8766', () => {});   // no opts.onDeactivated
    expect(() => ws.onmessage({ data: JSON.stringify({ type: 'deactivated', payload: {} }) })).not.toThrow();
    // defaultDeactivated navigates to the switch-profile target
    expect(global.location.href).toContain('profile.html');
  });

  it('activatePerson sends activate_person with the device id + takeover flag', async () => {
    var { api, ws } = await boot('http://host:8766', () => {});
    ws.sent.length = 0;
    api.activatePerson('millie', true);
    var act = ws.sent.find(m => m.type === 'activate_person');
    expect(act.payload.person_id).toBe('millie');
    expect(act.payload.takeover).toBe(true);
    expect(act.payload.device_id).toBe(localStorage.getItem('grew-tv-device'));
  });
});
