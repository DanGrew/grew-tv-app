import { NIGHT_OFF, NIGHT_LEVELS, nightPreset, nextLevel, nightLabel, isNightOn, makeupGain } from '../../core/night-mode.js';

describe('NIGHT_LEVELS', () => {
  it('is the three levels, in cycle order', () =>
    expect(NIGHT_LEVELS.map(l => l.id)).toEqual(['off', 'soft', 'strong']));
  it('gives Off no compressor settings — it is a bypass, not a no-op compressor', () =>
    expect(NIGHT_LEVELS[0]).toEqual({ id: 'off', label: 'Off' }));
  it('carries the sample the owner heard as Soft', () =>
    expect(NIGHT_LEVELS[1]).toEqual({ id: 'soft', label: 'Soft', threshold: -24, knee: 6, ratio: 3, attack: 0.02, release: 0.4, makeupDb: 6 }));
  it('squashes harder at Strong than at Soft', () => {
    expect(NIGHT_LEVELS[2].threshold).toBeLessThan(NIGHT_LEVELS[1].threshold);
    expect(NIGHT_LEVELS[2].ratio).toBeGreaterThan(NIGHT_LEVELS[1].ratio);
    expect(NIGHT_LEVELS[2].makeupDb).toBeGreaterThan(NIGHT_LEVELS[1].makeupDb);
  });
  it('reacts faster at Strong than at Soft', () => {
    expect(NIGHT_LEVELS[2].attack).toBeLessThan(NIGHT_LEVELS[1].attack);
    expect(NIGHT_LEVELS[2].release).toBeLessThan(NIGHT_LEVELS[1].release);
  });
  it('keeps the compressor lookahead well inside lip-sync tolerance', () =>
    NIGHT_LEVELS.slice(1).forEach(l => expect(l.attack).toBeLessThan(0.045)));
});

describe('nightPreset', () => {
  it('finds Soft by id', () => expect(nightPreset('soft').label).toBe('Soft'));
  it('finds Strong by id', () => expect(nightPreset('strong').label).toBe('Strong'));
  it('finds Off by id', () => expect(nightPreset('off').label).toBe('Off'));
  it('resolves an unknown id to Off', () => expect(nightPreset('loud').id).toBe(NIGHT_OFF));
  it('resolves a missing id to Off', () => expect(nightPreset(undefined).id).toBe(NIGHT_OFF));
});

describe('nextLevel', () => {
  it('goes Off -> Soft on the first press', () => expect(nextLevel('off')).toBe('soft'));
  it('goes Soft -> Strong on the second', () => expect(nextLevel('soft')).toBe('strong'));
  it('returns to Off on the third', () => expect(nextLevel('strong')).toBe('off'));
  it('treats an unknown id as Off, so one press gives Soft', () => expect(nextLevel('loud')).toBe('soft'));
  it('cycles back to where it started in three presses', () =>
    expect(nextLevel(nextLevel(nextLevel('off')))).toBe('off'));
});

describe('nightLabel', () => {
  it('names the level that is showing', () => expect(nightLabel('off')).toBe('Night: Off'));
  it('names Soft', () => expect(nightLabel('soft')).toBe('Night: Soft'));
  it('names Strong', () => expect(nightLabel('strong')).toBe('Night: Strong'));
  it('reads as Off for an id it does not know', () => expect(nightLabel('loud')).toBe('Night: Off'));
});

describe('isNightOn', () => {
  it('is off at Off', () => expect(isNightOn('off')).toBe(false));
  it('is on at Soft', () => expect(isNightOn('soft')).toBe(true));
  it('is on at Strong', () => expect(isNightOn('strong')).toBe(true));
  it('is off for an id it does not know', () => expect(isNightOn('loud')).toBe(false));
});

describe('makeupGain', () => {
  it('is unity at Off, so the bypass adds no level', () => expect(makeupGain('off')).toBe(1));
  it('is unity for an id it does not know', () => expect(makeupGain('loud')).toBe(1));
  it('converts Soft\'s +6 dB to linear amplitude', () => expect(makeupGain('soft')).toBeCloseTo(1.9953, 4));
  it('converts Strong\'s +10 dB to linear amplitude', () => expect(makeupGain('strong')).toBeCloseTo(3.1623, 4));
  it('lifts more at Strong than at Soft', () => expect(makeupGain('strong')).toBeGreaterThan(makeupGain('soft')));
});
