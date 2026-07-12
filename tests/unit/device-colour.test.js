import { deviceColour, DEVICE_PALETTE } from '../../core/device-colour.js';

describe('deviceColour', () => {
  it('is deterministic — same id always yields the same colour', () => {
    expect(deviceColour('abc-123')).toBe(deviceColour('abc-123'));
  });

  it('always returns a member of the palette', () => {
    ['a', 'living-room', 'd4f9', '550e8400-e29b-41d4-a716-446655440000', 'zzz']
      .forEach((id) => expect(DEVICE_PALETTE).toContain(deviceColour(id)));
  });

  it('falls back to the first palette entry for null/empty/undefined id', () => {
    expect(deviceColour(null)).toBe('#ef5350');   // literal pins DEVICE_PALETTE[0]
    expect(deviceColour('')).toBe('#ef5350');
    expect(deviceColour(undefined)).toBe('#ef5350');
  });

  it('maps ids across every palette slot to the exact hex (pins each entry + the hash bound)', () => {
    // One id per FNV-1a slot; the literal hex catches a wiped palette entry AND an
    // off-by-one hash loop (which would shift most of these to a different slot).
    var byId = {
      dev17: '#ef5350', dev7: '#ec407a', dev11: '#ab47bc', dev16: '#7e57c2',
      dev0: '#5c6bc0', dev10: '#42a5f5', dev15: '#29b6f6', dev1: '#26c6da',
      dev4: '#26a69a', dev14: '#66bb6a', dev2: '#9ccc65', dev5: '#d4e157',
      dev8: '#ffee58', dev3: '#ffca28', dev6: '#ffa726', dev9: '#ff7043'
    };
    Object.keys(byId).forEach(function(id) {
      expect(deviceColour(id)).toBe(byId[id]);
    });
  });

  it('spreads distinct ids across distinct palette slots (sanity, not a guarantee)', () => {
    var colours = ['screen-one', 'screen-two', 'screen-three'].map(deviceColour);
    expect(new Set(colours).size).toBe(3);
  });

  it('has a 16-colour palette of unique hex values', () => {
    expect(DEVICE_PALETTE.length).toBe(16);
    expect(new Set(DEVICE_PALETTE).size).toBe(16);
  });
});
