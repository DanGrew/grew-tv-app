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
  // TASK-297: connect() now resolves the WS port from <origin>/api/config
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

function deviceMsg(devices) {
  return { data: JSON.stringify({ type: 'devices', payload: { devices: devices } }) };
}

// The socket opens only after the /api/config fetch chain resolves — flush the
// microtask queue so MockWS.instances[0] exists before we drive it.
async function tick() {
  for (var i = 0; i < 20; i++) await Promise.resolve();
}

// connect() + wait for the deferred socket; returns { api, ws }.
async function boot(...args) {
  var api = connect(...args);
  await tick();
  return { api: api, ws: MockWS.instances[0] };
}

describe('connect', () => {
  it('creates WebSocket with the URL resolved from /api/config', async () => {
    var { ws } = await boot('http://host:8766', () => {}, () => {});
    expect(ws.url).toBe('ws://host:8766');
  });

  // TASK-297: the origin is passed to connect, and the WS port is read from that
  // origin's /api/config (not hardcoded), so a companion served off :8770 gets
  // whatever port the server reports.
  it('reads the WS port from the served origin (not hardcoded 8766)', async () => {
    global.location = { hostname: 'host' };
    global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ wsPort: 8770 }) }));
    var { ws } = await boot('http://host:8770', () => {}, () => {});
    expect(global.fetch).toHaveBeenCalledWith('http://host:8770/api/config');
    expect(ws.url).toBe('ws://host:8770');
  });

  it('asks for the screen list on open (list_devices first)', async () => {
    var { ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    expect(ws.sent[0].type).toBe('list_devices');
  });

  // FEAT-026 Phase 2 (TASK-158): target a screen, then snapshot_request.
  it('auto-targets a sole screen: register_companion then snapshot_request', async () => {
    var { ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA', label: 'Living Room', active_person: 'mom' }]));
    var types = ws.sent.map(m => m.type);
    var reg = ws.sent.find(m => m.type === 'register_companion');
    expect(reg.payload.device_id).toBe('devA');
    expect(types.indexOf('snapshot_request')).toBeGreaterThan(types.indexOf('register_companion'));
    expect(localStorage.getItem('grew-tv-companion-target')).toBe('devA');
  });

  it('does NOT auto-target when several screens and none persisted', async () => {
    var { ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA' }, { device_id: 'devB' }]));
    expect(ws.sent.find(m => m.type === 'register_companion')).toBeFalsy();
  });

  it('honours a persisted target among several screens', async () => {
    store['grew-tv-companion-target'] = 'devB';
    var { ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA' }, { device_id: 'devB' }]));
    expect(ws.sent.find(m => m.type === 'register_companion').payload.device_id).toBe('devB');
  });

  // Regression (FEAT-026 mis-bind): the chosen screen's profile->browse
  // reconnect briefly drops it from the list. The companion must WAIT, not
  // fail over to the other (now sole) screen — the old `ids.length === 1`
  // fallback grabbed devA here, mis-binding the companion (empty browse +
  // intents routed to the wrong TV).
  it('does NOT fail over to the other sole screen while its persisted target is transiently absent', async () => {
    store['grew-tv-companion-target'] = 'devB';
    var { ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    // devB momentarily gone (its screen is reconnecting); only devA is visible.
    ws.onmessage(deviceMsg([{ device_id: 'devA' }]));
    expect(ws.sent.find(m => m.type === 'register_companion')).toBeFalsy();
    // devB returns → it re-binds to devB, never to devA.
    ws.onmessage(deviceMsg([{ device_id: 'devA' }, { device_id: 'devB' }]));
    var reg = ws.sent.find(m => m.type === 'register_companion');
    expect(reg.payload.device_id).toBe('devB');
  });

  it('api.target registers + snapshot_requests the chosen screen', async () => {
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
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
  it('currentTarget() reflects the live target', async () => {
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
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
  it('re-target emits register_companion + snapshot_request ONLY — no person switch', async () => {
    store['grew-tv-companion-target'] = 'devA';
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA' }, { device_id: 'devB' }]));   // bound to devA
    ws.sent.length = 0;
    api.target('devB');   // re-target to devB
    var types = ws.sent.map(m => m.type);
    expect(types).toEqual(['register_companion', 'snapshot_request']);
    expect(types).not.toContain('activate_person');
    expect(ws.sent.find(m => m.payload && m.payload.intent === 'setProfile')).toBeFalsy();
  });

  it('survives the target screen person-switch with NO re-register', async () => {
    var { ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA', active_person: 'mom' }]));   // auto-target + register
    ws.sent.length = 0;
    // The screen flips person → a pushed devices update for the SAME target.
    ws.onmessage(deviceMsg([{ device_id: 'devA', active_person: 'dad' }]));
    expect(ws.sent.find(m => m.type === 'register_companion')).toBeFalsy();
  });

  it('reconnect re-registers the persisted target', async () => {
    var { ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA' }]));   // target persisted
    ws.onclose();
    vi.advanceTimersByTime(2001);   // reconnect reuses the resolved url — no re-fetch
    var ws2 = MockWS.instances[1];
    ws2.onopen();
    ws2.onmessage(deviceMsg([{ device_id: 'devA' }]));
    expect(ws2.sent.find(m => m.type === 'register_companion').payload.device_id).toBe('devA');
  });

  it('onDevices callback receives the live screen list', async () => {
    var seen = null;
    var { ws } = await boot('http://host:8766', () => {}, () => {}, () => {}, function(d) { seen = d; });
    ws.onopen();
    ws.onmessage(deviceMsg([{ device_id: 'devA', label: 'Living Room' }]));
    expect(seen[0].label).toBe('Living Room');
  });

  it('devices() returns the most recent screen list (for the UI chooser)', async () => {
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    expect(api.devices()).toEqual([]);   // empty before any devices message
    ws.onmessage(deviceMsg([{ device_id: 'devA', label: 'Living Room' }]));
    expect(api.devices()[0].device_id).toBe('devA');
  });

  it('routes a music playback snapshot to opts.onPlayback', async () => {
    var got = null;
    var { ws } = await boot('http://host:8766', () => {}, () => {}, () => {}, () => {}, { onPlayback: (p) => { got = p; } });
    ws.onmessage({ data: JSON.stringify({ type: 'playback', payload: { now_playing: { item_id: 'ootb-01' } } }) });
    expect(got.now_playing.item_id).toBe('ootb-01');
  });

  it('routes a video playback snapshot to opts.onVideoPlayback', async () => {
    var got = null;
    var { ws } = await boot('http://host:8766', () => {}, () => {}, () => {}, () => {}, { onVideoPlayback: (p) => { got = p; } });
    ws.onmessage({ data: JSON.stringify({ type: 'video_playback', payload: { now_playing: { item_id: 'bluey-s1e1' } } }) });
    expect(got.now_playing.item_id).toBe('bluey-s1e1');
  });

  it('calls onStatus connected on open', async () => {
    var statuses = [];
    var { ws } = await boot('http://host:8766', () => {}, function(s) { statuses.push(s); });
    ws.onopen();
    expect(statuses[0]).toBe('connected');
  });

  it('calls onContext for snapshot message', async () => {
    var received = [];
    var { ws } = await boot('http://host:8766', function(p) { received.push(p); }, () => {});
    ws.onmessage({ data: JSON.stringify({ type: 'snapshot', payload: { version: 1 } }) });
    expect(received).toHaveLength(1);
    expect(received[0].version).toBe(1);
  });

  it('calls onContext for context message', async () => {
    var received = [];
    var { ws } = await boot('http://host:8766', function(p) { received.push(p); }, () => {});
    ws.onmessage({ data: JSON.stringify({ type: 'context', payload: { version: 1 } }) });
    expect(received).toHaveLength(1);
  });

  it('ignores stale snapshot', async () => {
    var received = [];
    var { ws } = await boot('http://host:8766', function(p) { received.push(p); }, () => {});
    ws.onmessage({ data: JSON.stringify({ type: 'snapshot', payload: { version: 5 } }) });
    ws.onmessage({ data: JSON.stringify({ type: 'snapshot', payload: { version: 3 } }) });
    expect(received).toHaveLength(1);
    expect(received[0].version).toBe(5);
  });

  it('sends pong on ping', async () => {
    var { ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    var before = ws.sent.length;
    ws.onmessage({ data: JSON.stringify({ type: 'ping' }) });
    expect(ws.sent[before].type).toBe('pong');
  });

  it('calls onStatus reconnecting on close', async () => {
    var statuses = [];
    var { ws } = await boot('http://host:8766', () => {}, function(s) { statuses.push(s); });
    ws.onclose();
    expect(statuses).toContain('reconnecting…');
  });

  it('calls onStatus error on error', async () => {
    var statuses = [];
    var { ws } = await boot('http://host:8766', () => {}, function(s) { statuses.push(s); });
    ws.onerror();
    expect(statuses).toContain('error');
  });

  it('watchdog closes a stale connection after 20s without a ping', async () => {
    var { ws } = await boot('http://host:8766', () => {}, () => {});
    var closed = false;
    ws.close = function() { closed = true; };
    vi.advanceTimersByTime(25000);
    expect(closed).toBe(true);
  });

  it('sendIntent sends intent message when open', async () => {
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    var before = ws.sent.length;
    api.sendIntent('pause');
    expect(ws.sent[before].type).toBe('intent');
    expect(ws.sent[before].payload.intent).toBe('pause');
  });

  it('calls onAppState for app_state message', async () => {
    var received = [];
    var { ws } = await boot('http://host:8766', () => {}, () => {}, function(p) { received.push(p); });
    ws.onmessage({ data: JSON.stringify({ type: 'app_state', payload: { itemId: 'ollie-car', positionSec: 5, playing: true } }) });
    expect(received).toHaveLength(1);
    expect(received[0].itemId).toBe('ollie-car');
  });

  it('appState() returns the last snapshot payload', async () => {
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onmessage({ data: JSON.stringify({ type: 'app_state', payload: { itemId: 'film-3', playing: false } }) });
    expect(api.appState().itemId).toBe('film-3');
  });

  it('position() interpolates while playing using local clock', async () => {
    var t = 1000;
    vi.setSystemTime(t);
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onmessage({ data: JSON.stringify({ type: 'app_state', payload: { positionSec: 30, durationSec: 600, playing: true } }) });
    vi.setSystemTime(t + 10000);   // +10s local
    expect(api.position()).toBe(40);
  });

  it('position() holds steady when paused', async () => {
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onmessage({ data: JSON.stringify({ type: 'app_state', payload: { positionSec: 30, playing: false } }) });
    vi.advanceTimersByTime(10000);
    expect(api.position()).toBe(30);
  });

  // TASK-245 swapped music play/next/prev/shuffle to the per-person /api/playback
  // engine (Plane B HTTP), so those WS emitters are gone. The surviving Plane-A
  // emitters (skip / setProfile / toggleCaptions / playAlbum) still cross the wire.
  it('new intent senders emit correct intents', async () => {
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    api.skip(-30);
    expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('skip');
    expect(ws.sent[ws.sent.length - 1].payload.params.deltaSec).toBe(-30);
    api.setProfile('kids');
    expect(ws.sent[ws.sent.length - 1].payload.params.profile).toBe('kids');
    api.toggleCaptions();
    expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('toggleCaptions');
    api.playAlbum('ootb');
    expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('playAlbum');
    expect(ws.sent[ws.sent.length - 1].payload.params.id).toBe('ootb');
  });

  it('sendIntent passes params', async () => {
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
    ws.onopen();
    var before = ws.sent.length;
    api.sendIntent('select', { id: 'film-1' });
    expect(ws.sent[before].payload.params).toEqual({ id: 'film-1' });
  });

  // Companion-initiated take-over (the fix): a companion that activates a person
  // on its target screen receives the busy/active verdict HERE, so it can raise
  // its own take-over prompt instead of the verdict surfacing only on the TV.
  it('calls opts.onPersonBusy for a person_busy verdict', async () => {
    var busy = [];
    var { ws } = await boot('http://host:8766', () => {}, () => {}, () => {}, () => {}, { onPersonBusy: (p) => busy.push(p) });
    ws.onmessage({ data: JSON.stringify({ type: 'person_busy', payload: { person_id: 'mom', device_id: 'devB', label: 'Living Room' } }) });
    expect(busy).toHaveLength(1);
    expect(busy[0].label).toBe('Living Room');
  });

  it('calls opts.onPersonActive for a person_active verdict', async () => {
    var active = [];
    var { ws } = await boot('http://host:8766', () => {}, () => {}, () => {}, () => {}, { onPersonActive: (p) => active.push(p) });
    ws.onmessage({ data: JSON.stringify({ type: 'person_active', payload: { person_id: 'mom' } }) });
    expect(active).toHaveLength(1);
    expect(active[0].person_id).toBe('mom');
  });

  it('api.activatePerson sends activate_person for the targeted screen', async () => {
    var { api, ws } = await boot('http://host:8766', () => {}, () => {});
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

    it('suppresses ALL nav/transport intents while desynced', async () => {
      var mode = desyncMode();
      var { api, ws } = await boot('http://host:8766', () => {}, () => {}, () => {}, () => {}, { mode: mode });
      ws.onopen();
      ws.sent.length = 0;
      api.sendIntent('pause');
      api.skip(-30);
      api.setProfile('kids');
      api.toggleCaptions();
      api.playAlbum('album-1');
      expect(ws.sent).toHaveLength(0);
    });

    it('still registers + snapshots its target while desynced (registration plane ungated)', async () => {
      var mode = desyncMode();
      var { api, ws } = await boot('http://host:8766', () => {}, () => {}, () => {}, () => {}, { mode: mode });
      ws.onopen();
      ws.onmessage(deviceMsg([{ device_id: 'devA' }]));   // auto-target still works
      var types = ws.sent.map(m => m.type);
      expect(types).toContain('register_companion');
      expect(types).toContain('snapshot_request');
      ws.sent.length = 0;
      api.activatePerson('mom', true);                    // person plane still works
      expect(ws.sent.find(m => m.type === 'activate_person')).toBeTruthy();
    });

    it('re-emits intents once re-synced', async () => {
      var mode = desyncMode();
      var { api, ws } = await boot('http://host:8766', () => {}, () => {}, () => {}, () => {}, { mode: mode });
      ws.onopen();
      ws.sent.length = 0;
      api.skip(-30);
      expect(ws.sent).toHaveLength(0);
      mode.sync();
      api.skip(-30);
      expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('skip');
    });

    it('no mode passed => intents emit as before (unchanged default)', async () => {
      var { api, ws } = await boot('http://host:8766', () => {}, () => {});
      ws.onopen();
      ws.sent.length = 0;
      api.skip(-30);
      expect(ws.sent[ws.sent.length - 1].payload.intent).toBe('skip');
    });
  });
});
