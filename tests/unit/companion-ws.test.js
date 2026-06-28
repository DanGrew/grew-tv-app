import { vi } from 'vitest';
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

function deviceMsg(devices) {
  return { data: JSON.stringify({ type: 'devices', payload: { devices: devices } }) };
}

describe('connect', () => {
  it('creates WebSocket with given URL', () => {
    connect('ws://host:8766', () => {}, () => {});
    expect(MockWS.instances[0].url).toBe('ws://host:8766');
  });

  it('asks for the screen list on open (list_devices first)', () => {
    connect('ws://host:8766', () => {}, () => {});
    MockWS.instances[0].onopen();
    expect(MockWS.instances[0].sent[0].type).toBe('list_devices');
  });

  // FEAT-026 Phase 2 (TASK-158): target a screen, then snapshot_request.
  it('auto-targets a sole screen: register_companion then snapshot_request', () => {
    connect('ws://host:8766', () => {}, () => {});
    var ws = MockWS.instances[0];
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA', label: 'Living Room', active_person: 'mom' }]));
    var types = ws.sent.map(m => m.type);
    var reg = ws.sent.find(m => m.type === 'register_companion');
    expect(reg.payload.device_id).toBe('devA');
    expect(types.indexOf('snapshot_request')).toBeGreaterThan(types.indexOf('register_companion'));
    expect(localStorage.getItem('grew-tv-companion-target')).toBe('devA');
  });

  it('does NOT auto-target when several screens and none persisted', () => {
    connect('ws://host:8766', () => {}, () => {});
    var ws = MockWS.instances[0];
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA' }, { device_id: 'devB' }]));
    expect(ws.sent.find(m => m.type === 'register_companion')).toBeFalsy();
  });

  it('honours a persisted target among several screens', () => {
    store['grew-tv-companion-target'] = 'devB';
    connect('ws://host:8766', () => {}, () => {});
    var ws = MockWS.instances[0];
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA' }, { device_id: 'devB' }]));
    expect(ws.sent.find(m => m.type === 'register_companion').payload.device_id).toBe('devB');
  });

  // Regression (FEAT-026 mis-bind): the chosen screen's profile->browse
  // reconnect briefly drops it from the list. The companion must WAIT, not
  // fail over to the other (now sole) screen — the old `ids.length === 1`
  // fallback grabbed devA here, mis-binding the companion (empty browse +
  // intents routed to the wrong TV).
  it('does NOT fail over to the other sole screen while its persisted target is transiently absent', () => {
    store['grew-tv-companion-target'] = 'devB';
    connect('ws://host:8766', () => {}, () => {});
    var ws = MockWS.instances[0];
    ws.onopen();
    // devB momentarily gone (its screen is reconnecting); only devA is visible.
    ws.onmessage(deviceMsg([{ device_id: 'devA' }]));
    expect(ws.sent.find(m => m.type === 'register_companion')).toBeFalsy();
    // devB returns → it re-binds to devB, never to devA.
    ws.onmessage(deviceMsg([{ device_id: 'devA' }, { device_id: 'devB' }]));
    var reg = ws.sent.find(m => m.type === 'register_companion');
    expect(reg.payload.device_id).toBe('devB');
  });

  it('api.target registers + snapshot_requests the chosen screen', () => {
    var api = connect('ws://host:8766', () => {}, () => {});
    var ws = MockWS.instances[0];
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA' }, { device_id: 'devB' }]));
    ws.sent.length = 0;
    api.target('devB');
    var types = ws.sent.map(m => m.type);
    expect(types).toContain('register_companion');
    expect(types).toContain('snapshot_request');
    expect(ws.sent.find(m => m.type === 'register_companion').payload.device_id).toBe('devB');
  });

  // TASK-179: the screen chooser reads the live target to show the current
  // screen. Null before any (auto)target, the device id once bound.
  it('currentTarget() reflects the live target', () => {
    var api = connect('ws://host:8766', () => {}, () => {});
    var ws = MockWS.instances[0];
    ws.onopen();
    expect(api.currentTarget()).toBe(null);
    ws.onmessage(deviceMsg([{ device_id: 'devA' }]));   // sole screen auto-targets
    expect(api.currentTarget()).toBe('devA');
    api.target('devA');
    expect(api.currentTarget()).toBe('devA');
  });

  // TASK-179 A3: re-targeting a different screen is a DEVICE-plane move — it must
  // emit register_companion (+ snapshot_request) ONLY. No person-plane traffic
  // (activate_person / setProfile), so the previously-driven app keeps running
  // untouched.
  it('re-target emits register_companion + snapshot_request ONLY — no person switch', () => {
    store['grew-tv-companion-target'] = 'devA';
    var api = connect('ws://host:8766', () => {}, () => {});
    var ws = MockWS.instances[0];
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA' }, { device_id: 'devB' }]));   // bound to devA
    ws.sent.length = 0;
    api.target('devB');   // re-target to devB
    var types = ws.sent.map(m => m.type);
    expect(types).toEqual(['register_companion', 'snapshot_request']);
    expect(types).not.toContain('activate_person');
    expect(ws.sent.find(m => m.payload && m.payload.intent === 'setProfile')).toBeFalsy();
  });

  it('survives the target screen person-switch with NO re-register', () => {
    connect('ws://host:8766', () => {}, () => {});
    var ws = MockWS.instances[0];
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA', active_person: 'mom' }]));   // auto-target + register
    ws.sent.length = 0;
    // The screen flips person → a pushed devices update for the SAME target.
    ws.onmessage(deviceMsg([{ device_id: 'devA', active_person: 'dad' }]));
    expect(ws.sent.find(m => m.type === 'register_companion')).toBeFalsy();
  });

  it('reconnect re-registers the persisted target', () => {
    connect('ws://host:8766', () => {}, () => {});
    var ws = MockWS.instances[0];
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA' }]));   // target persisted
    ws.onclose();
    vi.advanceTimersByTime(2001);
    var ws2 = MockWS.instances[1];
    ws2.onopen();
    ws2.onmessage(deviceMsg([{ device_id: 'devA' }]));
    expect(ws2.sent.find(m => m.type === 'register_companion').payload.device_id).toBe('devA');
  });

  it('onDevices callback receives the live screen list', () => {
    var seen = null;
    connect('ws://host:8766', () => {}, () => {}, () => {}, function(d) { seen = d; });
    var ws = MockWS.instances[0];
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA', label: 'Living Room' }]));
    expect(seen[0].label).toBe('Living Room');
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

  // Companion-initiated take-over (the fix): a companion that activates a person
  // on its target screen receives the busy/active verdict HERE, so it can raise
  // its own take-over prompt instead of the verdict surfacing only on the TV.
  it('calls opts.onPersonBusy for a person_busy verdict', () => {
    var busy = [];
    connect('ws://host:8766', () => {}, () => {}, () => {}, () => {}, { onPersonBusy: (p) => busy.push(p) });
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'person_busy', payload: { person_id: 'mom', device_id: 'devB', label: 'Living Room' } }) });
    expect(busy).toHaveLength(1);
    expect(busy[0].label).toBe('Living Room');
  });

  it('calls opts.onPersonActive for a person_active verdict', () => {
    var active = [];
    connect('ws://host:8766', () => {}, () => {}, () => {}, () => {}, { onPersonActive: (p) => active.push(p) });
    MockWS.instances[0].onmessage({ data: JSON.stringify({ type: 'person_active', payload: { person_id: 'mom' } }) });
    expect(active).toHaveLength(1);
    expect(active[0].person_id).toBe('mom');
  });

  it('api.activatePerson sends activate_person for the targeted screen', () => {
    var api = connect('ws://host:8766', () => {}, () => {});
    var ws = MockWS.instances[0];
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA' }]));   // sole screen auto-targets
    ws.sent.length = 0;
    api.activatePerson('mom', true);
    var msg = ws.sent.find(m => m.type === 'activate_person');
    expect(msg.payload.device_id).toBe('devA');
    expect(msg.payload.person_id).toBe('mom');
    expect(msg.payload.takeover).toBe(true);
  });

  // FEAT-038 (TASK-229): with a desync mode wired in via opts.mode, the outbound
  // nav/transport seam is gated. Desynced => those intents are no-ops; the
  // registration plane (target/register/snapshot/activate_person) still flows.
  describe('desync mode gates outbound intents (opts.mode)', () => {
    function desyncMode() {
      var desynced = true;
      return { intentsAllowed: () => !desynced, sync: () => { desynced = false; } };
    }

    it('suppresses ALL nav/transport intents while desynced', () => {
      var mode = desyncMode();
      var api = connect('ws://host:8766', () => {}, () => {}, () => {}, () => {}, { mode: mode });
      var ws = MockWS.instances[0];
      ws.onopen();
      ws.sent.length = 0;
      api.sendIntent('pause');
      api.play('film-1');
      api.skip(-30);
      api.next();
      api.prev();
      api.setProfile('kids');
      api.toggleCaptions();
      api.shuffle();
      api.playAlbum('album-1');
      expect(ws.sent).toHaveLength(0);
    });

    it('still registers + snapshots its target while desynced (registration plane ungated)', () => {
      var mode = desyncMode();
      var api = connect('ws://host:8766', () => {}, () => {}, () => {}, () => {}, { mode: mode });
      var ws = MockWS.instances[0];
      ws.onopen();
      ws.onmessage(deviceMsg([{ device_id: 'devA' }]));   // auto-target still works
      var types = ws.sent.map(m => m.type);
      expect(types).toContain('register_companion');
      expect(types).toContain('snapshot_request');
      ws.sent.length = 0;
      api.activatePerson('mom', true);                    // person plane still works
      expect(ws.sent.find(m => m.type === 'activate_person')).toBeTruthy();
    });

    it('re-emits intents once re-synced', () => {
      var mode = desyncMode();
      var api = connect('ws://host:8766', () => {}, () => {}, () => {}, () => {}, { mode: mode });
      var ws = MockWS.instances[0];
      ws.onopen();
      ws.sent.length = 0;
      api.next();
      expect(ws.sent).toHaveLength(0);
      mode.sync();
      api.next();
      expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('next');
    });

    it('no mode passed => intents emit as before (unchanged default)', () => {
      var api = connect('ws://host:8766', () => {}, () => {});
      var ws = MockWS.instances[0];
      ws.onopen();
      ws.sent.length = 0;
      api.next();
      expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('next');
    });
  });
});
