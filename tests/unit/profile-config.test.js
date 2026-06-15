import {
  PIN_LEN, DEFAULT_PIN, defaultConfig, parseConfig, isLocked, effectivePin,
  pinMatches, personById, personByProfile,
  pushDigit, popDigit, isPinComplete, dotFill, keypadNav, personGlyph, badgePerson
} from '../../core/profile-config.js';

describe('defaultConfig', () => {
  it('has the default PIN and one open kid + one locked adult placeholder', () => {
    var c = defaultConfig();
    expect(c.defaultPin).toBe(DEFAULT_PIN);
    expect(c.persons.map(p => p.profile)).toEqual(['kids', 'adults']);
    expect(isLocked(c.persons[0])).toBe(false);
    expect(isLocked(c.persons[1])).toBe(true);
    expect(c.persons[0].photo).toBe(null);
    // generic placeholders only — no real names
    expect(c.persons.map(p => p.id)).toEqual(['child', 'grownup']);
  });
});

describe('parseConfig', () => {
  it('keeps a well-formed config and coerces fields', () => {
    var c = parseConfig({ defaultPin: '9876', persons: [
      { id: 'oliver', name: 'Oliver', profile: 'kids', photo: 'o.jpg' },
      { id: 'mom', profile: 'adults', pin: '4321' }
    ] });
    expect(c.defaultPin).toBe('9876');
    expect(c.persons[0]).toEqual({ id: 'oliver', name: 'Oliver', profile: 'kids', photo: 'o.jpg', emoji: null, pin: null });
    // missing name falls back to id; missing photo -> null; own pin kept
    expect(c.persons[1]).toEqual({ id: 'mom', name: 'mom', profile: 'adults', photo: null, emoji: null, pin: '4321' });
  });

  it('passes a config.json emoji through, drops a blank/non-string emoji (FEAT-033)', () => {
    expect(parseConfig({ persons: [{ id: 'oliver', profile: 'kids', emoji: '🦖' }] }).persons[0].emoji).toBe('🦖');
    expect(parseConfig({ persons: [{ id: 'x', emoji: '' }] }).persons[0].emoji).toBe(null);
    expect(parseConfig({ persons: [{ id: 'x', emoji: 5 }] }).persons[0].emoji).toBe(null);
    expect(parseConfig({ persons: [{ id: 'x' }] }).persons[0].emoji).toBe(null);
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
    expect(parseConfig({ persons: [{ name: 'x' }, { id: 'mom', profile: 'adults' }] }).persons.map(p => p.id)).toEqual(['mom']);
    expect(parseConfig({ persons: [{ name: 'x' }] }).persons).toEqual(defaultConfig().persons);
    expect(parseConfig({ persons: 'bad' }).persons).toEqual(defaultConfig().persons);
  });
});

describe('personGlyph (FEAT-033)', () => {
  it('prefers the person own emoji over the class default', () => {
    expect(personGlyph({ profile: 'kids', emoji: '🦖' })).toBe('🦖');
    expect(personGlyph({ profile: 'adults', emoji: '👵' })).toBe('👵');
  });
  it('falls back to the class default when no emoji', () => {
    expect(personGlyph({ profile: 'kids', emoji: null })).toBe('🧒');
    expect(personGlyph({ profile: 'adults' })).toBe('🧑');
  });
  it('falls back to a generic face for an unknown class with no emoji', () => {
    expect(personGlyph({ profile: 'teens', emoji: null })).toBe('👤');
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

describe('badgePerson (FEAT-033)', () => {
  var config = parseConfig({ persons: [
    { id: 'dad', name: 'Daddy', profile: 'adults', emoji: '🦖' },
    { id: 'evie', name: 'Evie', profile: 'kids' }
  ] });

  it('returns the active person (authored name + emoji) when the id resolves', () => {
    var p = badgePerson(config, 'dad', 'adults');
    expect(p.name).toBe('Daddy');
    expect(personGlyph(p)).toBe('🦖');
  });

  it('falls back to the profile-class name + glyph when the id is absent', () => {
    var p = badgePerson(config, 'ghost', 'adults');
    expect(p.name).toBe('Adults');
    expect(personGlyph(p)).toBe('🧑');
  });

  it('falls back via the profile class for a missing/odd profile arg', () => {
    expect(badgePerson(config, null, 'kids').name).toBe('Kids');
    expect(badgePerson(config, null, undefined).name).toBe('Kids');
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
