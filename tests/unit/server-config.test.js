import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wsUrl, WS_PORT, fetchWsUrl, httpsOrigin, HTTPS_PORT, fetchHttpsOrigin } from '../../core/server-config.js';

describe('wsUrl', () => {
  it('builds a ws:// URL on the WS port for the given host', () => {
    expect(wsUrl('localhost')).toBe('ws://localhost:8766');
  });

  it('follows the host to a LAN IP (no hardcoded localhost) — TASK-134', () => {
    expect(wsUrl('192.168.1.212')).toBe('ws://192.168.1.212:8766');
  });

  it('works with a .local hostname', () => {
    expect(wsUrl('macmini.local')).toBe('ws://macmini.local:8766');
  });

  it('uses WS_PORT for the port by default', () => {
    expect(WS_PORT).toBe(8766);
    expect(wsUrl('h')).toContain(':' + WS_PORT);
  });

  it('uses an explicit port when given (TASK-297)', () => {
    expect(wsUrl('localhost', 8770)).toBe('ws://localhost:8770');
    expect(wsUrl('h', 9999)).toBe('ws://h:9999');
  });
});

describe('fetchWsUrl (TASK-297)', () => {
  var origFetch;
  beforeEach(() => {
    origFetch = global.fetch;
    global.location = { hostname: 'localhost' };
  });
  afterEach(() => {
    global.fetch = origFetch;
    delete global.location;
  });

  it('reads wsPort from /api/config on the server origin', async () => {
    global.fetch = vi.fn(function(url) {
      expect(url).toBe('http://localhost:8770/api/config');
      return Promise.resolve({ json: function() { return Promise.resolve({ wsPort: 8770 }); } });
    });
    expect(await fetchWsUrl('http://localhost:8770')).toBe('ws://localhost:8770');
  });

  it('keeps the page host (LAN IP), only the port comes from config', async () => {
    global.location = { hostname: '192.168.1.212' };
    global.fetch = vi.fn(function() {
      return Promise.resolve({ json: function() { return Promise.resolve({ wsPort: 8766 }); } });
    });
    expect(await fetchWsUrl('http://192.168.1.212:8765')).toBe('ws://192.168.1.212:8766');
  });

  it('falls back to WS_PORT when the config field is absent', async () => {
    global.fetch = vi.fn(function() {
      return Promise.resolve({ json: function() { return Promise.resolve({}); } });
    });
    expect(await fetchWsUrl('http://localhost:8765')).toBe('ws://localhost:8766');
  });

  it('falls back to WS_PORT when the fetch rejects (older server / offline)', async () => {
    global.fetch = vi.fn(function() { return Promise.reject(new Error('nope')); });
    expect(await fetchWsUrl('http://localhost:8765')).toBe('ws://localhost:8766');
  });
});

describe('httpsOrigin', () => {
  it('builds an https:// origin on the HTTPS port for the given host', () => {
    expect(httpsOrigin('localhost')).toBe('https://localhost:8767');
  });

  it('follows the host to a LAN IP (no hardcoded localhost)', () => {
    expect(httpsOrigin('192.168.1.212')).toBe('https://192.168.1.212:8767');
  });

  it('uses HTTPS_PORT for the port by default', () => {
    expect(HTTPS_PORT).toBe(8767);
    expect(httpsOrigin('h')).toContain(':' + HTTPS_PORT);
  });

  it('uses an explicit port when given', () => {
    expect(httpsOrigin('localhost', 8770)).toBe('https://localhost:8770');
    expect(httpsOrigin('h', 9999)).toBe('https://h:9999');
  });
});

describe('fetchHttpsOrigin (TASK-405)', () => {
  var origFetch;
  beforeEach(() => {
    origFetch = global.fetch;
    global.location = { hostname: 'localhost' };
  });
  afterEach(() => {
    global.fetch = origFetch;
    delete global.location;
  });

  it('reads httpsPort from /api/config on the server origin', async () => {
    global.fetch = vi.fn(function(url) {
      expect(url).toBe('http://localhost:8765/api/config');
      return Promise.resolve({ json: function() { return Promise.resolve({ httpsPort: 8770 }); } });
    });
    expect(await fetchHttpsOrigin('http://localhost:8765')).toBe('https://localhost:8770');
  });

  it('keeps the page host (LAN IP), only the port comes from config', async () => {
    global.location = { hostname: '192.168.1.212' };
    global.fetch = vi.fn(function() {
      return Promise.resolve({ json: function() { return Promise.resolve({ httpsPort: 8767 }); } });
    });
    expect(await fetchHttpsOrigin('http://192.168.1.212:8765')).toBe('https://192.168.1.212:8767');
  });

  it('falls back to HTTPS_PORT when the config field is absent', async () => {
    global.fetch = vi.fn(function() {
      return Promise.resolve({ json: function() { return Promise.resolve({}); } });
    });
    expect(await fetchHttpsOrigin('http://localhost:8765')).toBe('https://localhost:8767');
  });

  it('falls back to HTTPS_PORT when the fetch rejects (older server / offline)', async () => {
    global.fetch = vi.fn(function() { return Promise.reject(new Error('nope')); });
    expect(await fetchHttpsOrigin('http://localhost:8765')).toBe('https://localhost:8767');
  });
});
