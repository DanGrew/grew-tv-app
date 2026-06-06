import {
  PIN_LEN, DEFAULT_PIN, defaultConfig, parseConfig, pinMatches,
  pushDigit, popDigit, isPinComplete, dotFill, keypadNav
} from '../../core/profile-config.js';

describe('defaultConfig', () => {
  it('has the default PIN and Kids(open)/Adults(locked)', () => {
    var c = defaultConfig();
    expect(c.pin).toBe(DEFAULT_PIN);
    expect(c.profiles.map(p => p.id)).toEqual(['kids', 'adults']);
    expect(c.profiles[0].locked).toBe(false);
    expect(c.profiles[1].locked).toBe(true);
    expect(c.profiles[0].photo).toBe(null);
  });
});

describe('parseConfig', () => {
  it('keeps a well-formed config and coerces fields', () => {
    var c = parseConfig({ pin: '9876', profiles: [
      { id: 'kids', label: 'Children', locked: 0, photo: 'k.jpg' },
      { id: 'adults', locked: 1 }
    ] });
    expect(c.pin).toBe('9876');
    expect(c.profiles[0]).toEqual({ id: 'kids', label: 'Children', locked: false, photo: 'k.jpg' });
    // missing label falls back to id; missing photo -> null; locked coerced to bool
    expect(c.profiles[1]).toEqual({ id: 'adults', label: 'adults', locked: true, photo: null });
  });

  it('falls back to defaults on null/garbage', () => {
    expect(parseConfig(null)).toEqual(defaultConfig());
    expect(parseConfig('nope')).toEqual(defaultConfig());
    expect(parseConfig({})).toEqual(defaultConfig());
  });

  it('uses the default PIN when pin missing or non-string', () => {
    expect(parseConfig({ profiles: [{ id: 'kids' }] }).pin).toBe(DEFAULT_PIN);
    expect(parseConfig({ pin: 1234, profiles: [{ id: 'kids' }] }).pin).toBe(DEFAULT_PIN);
    expect(parseConfig({ pin: '', profiles: [{ id: 'kids' }] }).pin).toBe(DEFAULT_PIN);
  });

  it('drops profile entries without an id, and defaults when none remain', () => {
    expect(parseConfig({ profiles: [{ label: 'x' }, { id: 'adults' }] }).profiles.map(p => p.id)).toEqual(['adults']);
    expect(parseConfig({ profiles: [{ label: 'x' }] }).profiles).toEqual(defaultConfig().profiles);
    expect(parseConfig({ profiles: 'bad' }).profiles).toEqual(defaultConfig().profiles);
  });
});

describe('pinMatches', () => {
  it('is true only on an exact string match', () => {
    var c = { pin: '1234' };
    expect(pinMatches(c, '1234')).toBe(true);
    expect(pinMatches(c, '1235')).toBe(false);
    expect(pinMatches(c, '12340')).toBe(false);
    expect(pinMatches(null, '1234')).toBe(false);
  });
});

describe('PIN entry helpers', () => {
  it('pushDigit appends up to PIN_LEN then ignores', () => {
    expect(pushDigit('', '1')).toBe('1');
    expect(pushDigit('12', '3')).toBe('123');
    expect(pushDigit('1234', '5')).toBe('1234');
  });
  it('popDigit removes the last digit', () => {
    expect(popDigit('123')).toBe('12');
    expect(popDigit('')).toBe('');
  });
  it('isPinComplete at PIN_LEN', () => {
    expect(isPinComplete('123')).toBe(false);
    expect(isPinComplete('1234')).toBe(true);
    expect(PIN_LEN).toBe(4);
  });
  it('dotFill marks entered positions', () => {
    expect(dotFill('')).toEqual([false, false, false, false]);
    expect(dotFill('12')).toEqual([true, true, false, false]);
    expect(dotFill('1234')).toEqual([true, true, true, true]);
  });
});

describe('keypadNav', () => {
  // 3-wide, 12-cell grid: rows [1 2 3][4 5 6][7 8 9][back 0 ok], indices 0..11
  it('moves within the grid by arrow key', () => {
    expect(keypadNav(4, 'ArrowLeft', 3, 12)).toBe(3);
    expect(keypadNav(4, 'ArrowRight', 3, 12)).toBe(5);
    expect(keypadNav(4, 'ArrowUp', 3, 12)).toBe(1);
    expect(keypadNav(4, 'ArrowDown', 3, 12)).toBe(7);
  });
  it('clamps at the edges (no wrap)', () => {
    expect(keypadNav(0, 'ArrowLeft', 3, 12)).toBe(0);
    expect(keypadNav(0, 'ArrowUp', 3, 12)).toBe(0);
    expect(keypadNav(11, 'ArrowRight', 3, 12)).toBe(11);
    expect(keypadNav(11, 'ArrowDown', 3, 12)).toBe(11);
  });
  it('ignores unknown keys', () => {
    expect(keypadNav(5, 'Enter', 3, 12)).toBe(5);
  });
});
