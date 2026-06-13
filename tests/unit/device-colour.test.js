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
    expect(deviceColour(null)).toBe(DEVICE_PALETTE[0]);
    expect(deviceColour('')).toBe(DEVICE_PALETTE[0]);
    expect(deviceColour(undefined)).toBe(DEVICE_PALETTE[0]);
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
