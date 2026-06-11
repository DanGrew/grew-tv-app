import { wsUrl, WS_PORT } from '../../core/server-config.js';

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

  it('uses WS_PORT for the port', () => {
    expect(WS_PORT).toBe(8766);
    expect(wsUrl('h')).toContain(':' + WS_PORT);
  });
});
