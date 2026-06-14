import {
  PIN_LEN, DEFAULT_PIN, GUEST_ID, defaultConfig, parseConfig, isLocked, isGuest, effectivePin,
  pinMatches, personById, personByProfile,
  pushDigit, popDigit, isPinComplete, dotFill, keypadNav
} from '../../core/profile-config.js';

describe('defaultConfig', () => {
  it('has the default PIN and one open kid + one locked adult placeholder (then Guest)', () => {
    var c = defaultConfig();
    expect(c.defaultPin).toBe(DEFAULT_PIN);
    expect(c.persons.map(p => p.profile)).toEqual(['kids', 'adults', 'kids']);
    expect(isLocked(c.persons[0])).toBe(false);
    expect(isLocked(c.persons[1])).toBe(true);
    expect(c.persons[0].photo).toBe(null);
    // generic placeholders only — no real names — plus the always-present Guest, last
    expect(c.persons.map(p => p.id)).toEqual(['child', 'grownup', GUEST_ID]);
  });
});

// FEAT-034 TASK-195 — Guest is a synthesised, always-present kids-class person.
describe('built-in Guest', () => {
  it('appends an always-present Guest, last, kids-class and never locked', () => {
    var c = parseConfig({ persons: [{ id: 'oliver', profile: 'kids' }, { id: 'mom', profile: 'adults' }] });
    var guest = c.persons[c.persons.length - 1];
    expect(c.persons.map(p => p.id)).toEqual(['oliver', 'mom', GUEST_ID]);
    expect(guest).toEqual({ id: 'guest', name: 'Guest', profile: 'kids', photo: null, pin: null, emoji: '👋' });
    expect(isLocked(guest)).toBe(false);
    expect(isGuest(guest)).toBe(true);
  });

  it('is present even with no configured persons (default placeholders)', () => {
    expect(parseConfig({}).persons.map(p => p.id)).toEqual(['child', 'grownup', GUEST_ID]);
    expect(parseConfig(null).persons.some(p => p.id === GUEST_ID)).toBe(true);
  });

  it('lets a config-authored guest override name/photo but never its class or lock', () => {
    var c = parseConfig({ persons: [
      { id: 'guest', name: 'Visitor', profile: 'adults', photo: 'g.jpg', pin: '0000' }
    ] });
    // exactly one guest, still last, still kids + open despite the adult/pin in config
    expect(c.persons.filter(p => p.id === GUEST_ID)).toHaveLength(1);
    expect(c.persons[c.persons.length - 1]).toEqual(
      { id: 'guest', name: 'Visitor', profile: 'kids', photo: 'g.jpg', pin: null, emoji: '👋' });
    expect(isLocked(c.persons[c.persons.length - 1])).toBe(false);
  });

  // Emoji override composes with FEAT-033: mergeGuest already reads authored.emoji,
  // so once TASK-192 adds the emoji passthrough to normalizePerson a config emoji
  // flows through with no change here. Until then Guest keeps the default glyph.
  it('keeps the default emoji until FEAT-033 normalizePerson passthrough lands', () => {
    var c = parseConfig({ persons: [{ id: 'guest', emoji: '🛸' }] });
    expect(c.persons[c.persons.length - 1].emoji).toBe('👋');
  });

  it('personById resolves the synthesised guest', () => {
    expect(personById(parseConfig({ persons: [{ id: 'mom', profile: 'adults' }] }), 'guest').name).toBe('Guest');
  });
});

describe('isGuest', () => {
  it('is true only for the guest id', () => {
    expect(isGuest({ id: 'guest' })).toBe(true);
    expect(isGuest({ id: 'mom' })).toBe(false);
    expect(isGuest(null)).toBe(false);
  });
});

describe('parseConfig', () => {
  it('keeps a well-formed config and coerces fields', () => {
    var c = parseConfig({ defaultPin: '9876', persons: [
      { id: 'oliver', name: 'Oliver', profile: 'kids', photo: 'o.jpg' },
      { id: 'mom', profile: 'adults', pin: '4321' }
    ] });
    expect(c.defaultPin).toBe('9876');
    expect(c.persons[0]).toEqual({ id: 'oliver', name: 'Oliver', profile: 'kids', photo: 'o.jpg', pin: null });
    // missing name falls back to id; missing photo -> null; own pin kept
    expect(c.persons[1]).toEqual({ id: 'mom', name: 'mom', profile: 'adults', photo: null, pin: '4321' });
  });

  it('defaults an unknown/missing profile to kids', () => {
    expect(parseConfig({ persons: [{ id: 'x' }] }).persons[0].profile).toBe('kids');
    expect(parseConfig({ persons: [{ id: 'x', profile: 'teens' }] }).persons[0].profile).toBe('kids');
  });

  it('drops a blank/non-string pin to null', () => {
    expect(parseConfig({ persons: [{ id: 'x', pin: '' }] }).persons[0].pin).toBe(null);
    expect(parseConfig({ persons: [{ id: 'x', pin: 4321 }] }).persons[0].pin).toBe(null);
  });

  it('falls back to defaults on null/garbage', () => {
    expect(parseConfig(null)).toEqual(defaultConfig());
    expect(parseConfig('nope')).toEqual(defaultConfig());
    expect(parseConfig({})).toEqual(defaultConfig());
  });

  it('uses the default PIN when defaultPin missing or non-string', () => {
    expect(parseConfig({ persons: [{ id: 'x' }] }).defaultPin).toBe(DEFAULT_PIN);
    expect(parseConfig({ defaultPin: 1234, persons: [{ id: 'x' }] }).defaultPin).toBe(DEFAULT_PIN);
    expect(parseConfig({ defaultPin: '', persons: [{ id: 'x' }] }).defaultPin).toBe(DEFAULT_PIN);
  });

  it('drops person entries without an id, and defaults when none remain', () => {
    expect(parseConfig({ persons: [{ name: 'x' }, { id: 'mom', profile: 'adults' }] }).persons.map(p => p.id)).toEqual(['mom', 'guest']);
    expect(parseConfig({ persons: [{ name: 'x' }] }).persons).toEqual(defaultConfig().persons);
    expect(parseConfig({ persons: 'bad' }).persons).toEqual(defaultConfig().persons);
  });
});

describe('isLocked', () => {
  it('is true only for an adult person', () => {
    expect(isLocked({ profile: 'adults' })).toBe(true);
    expect(isLocked({ profile: 'kids' })).toBe(false);
    expect(isLocked(null)).toBe(false);
  });
});

describe('effectivePin / pinMatches', () => {
  var config = { defaultPin: '0000', persons: [] };
  var withOwn = { id: 'mom', profile: 'adults', pin: '4321' };
  var noOwn = { id: 'dad', profile: 'adults', pin: null };

  it('effectivePin is the person pin or the config default', () => {
    expect(effectivePin(config, withOwn)).toBe('4321');
    expect(effectivePin(config, noOwn)).toBe('0000');
  });

  it('pinMatches against the effective pin only', () => {
    expect(pinMatches(config, withOwn, '4321')).toBe(true);
    expect(pinMatches(config, withOwn, '0000')).toBe(false);
    expect(pinMatches(config, noOwn, '0000')).toBe(true);
    expect(pinMatches(config, noOwn, '4321')).toBe(false);
    expect(pinMatches(config, null, '0000')).toBe(false);
    expect(pinMatches(null, noOwn, '0000')).toBe(false);
  });
});

describe('personById / personByProfile', () => {
  var config = { defaultPin: '0', persons: [
    { id: 'oliver', profile: 'kids' },
    { id: 'mom', profile: 'adults' }
  ] };

  it('personById resolves by stable id, null when absent', () => {
    expect(personById(config, 'mom').id).toBe('mom');
    expect(personById(config, 'ghost')).toBe(null);
  });

  it('personByProfile returns the first person of a class, else the first person', () => {
    expect(personByProfile(config, 'adults').id).toBe('mom');
    expect(personByProfile(config, 'kids').id).toBe('oliver');
    expect(personByProfile({ defaultPin: '0', persons: [{ id: 'oliver', profile: 'kids' }] }, 'adults').id).toBe('oliver');
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
