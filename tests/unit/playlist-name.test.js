import { NAME_MAX, KEY_COLS, CHAR_KEYS, appendChar, backspace, cleanName, isValidName, gridIndex, editorMode, typedChar } from '../../core/playlist-name.js';

describe('CHAR_KEYS / layout', () => {
  it('exposes A-Z then 0-9 as single-character cells', () => {
    expect(CHAR_KEYS.length).toBe(36);
    expect(CHAR_KEYS[0]).toBe('A');
    expect(CHAR_KEYS[25]).toBe('Z');
    expect(CHAR_KEYS[35]).toBe('9');
    expect(CHAR_KEYS.every(k => k.length === 1)).toBe(true);
  });
  it('KEY_COLS is a positive column count', () => {
    expect(KEY_COLS).toBeGreaterThan(0);
  });
});

describe('appendChar', () => {
  it('appends a character', () => {
    expect(appendChar('RO', 'A')).toBe('ROA');
    expect(appendChar('', 'X')).toBe('X');
  });
  it('appends a space', () => {
    expect(appendChar('A', ' ')).toBe('A ');
  });
  it('is a no-op at the NAME_MAX cap (never exceeds the server limit)', () => {
    const full = 'x'.repeat(NAME_MAX);
    expect(appendChar(full, 'y')).toBe(full);
    expect(appendChar(full, 'y').length).toBe(NAME_MAX);
  });
});

describe('backspace', () => {
  it('drops the last character', () => {
    expect(backspace('ROAD')).toBe('ROA');
  });
  it('leaves an empty name empty', () => {
    expect(backspace('')).toBe('');
  });
});

describe('cleanName', () => {
  it('trims surrounding whitespace (mirrors the backend trim)', () => {
    expect(cleanName('  Road Trip  ')).toBe('Road Trip');
  });
});

describe('isValidName', () => {
  it('rejects blank / whitespace-only names', () => {
    expect(isValidName('')).toBe(false);
    expect(isValidName('   ')).toBe(false);
  });
  it('accepts a 1-NAME_MAX trimmed name', () => {
    expect(isValidName('A')).toBe(true);
    expect(isValidName('x'.repeat(NAME_MAX))).toBe(true);
  });
  it('rejects an over-NAME_MAX name', () => {
    expect(isValidName('x'.repeat(NAME_MAX + 1))).toBe(false);
  });
});

describe('typedChar', () => {
  it('returns a printable letter/digit/space/punctuation key', () => {
    expect(typedChar({ key: 'a' })).toBe('a');
    expect(typedChar({ key: 'Z' })).toBe('Z');
    expect(typedChar({ key: '7' })).toBe('7');
    expect(typedChar({ key: ' ' })).toBe(' ');
    expect(typedChar({ key: '-' })).toBe('-');
  });
  it('ignores non-printable / multi-char keys (arrows, Enter, Backspace, F-keys)', () => {
    expect(typedChar({ key: 'ArrowLeft' })).toBe('');
    expect(typedChar({ key: 'Enter' })).toBe('');
    expect(typedChar({ key: 'Backspace' })).toBe('');
    expect(typedChar({ key: 'F5' })).toBe('');
  });
  it('ignores a printable key held with a Ctrl/Alt/Meta chord (shortcut, not text)', () => {
    expect(typedChar({ key: 'a', ctrlKey: true })).toBe('');
    expect(typedChar({ key: 'v', metaKey: true })).toBe('');
    expect(typedChar({ key: 'x', altKey: true })).toBe('');
  });
});

describe('gridIndex', () => {
  const COLS = 9;
  const LEN = 43;
  it('steps one cell on Left/Right, clamped at the ends', () => {
    expect(gridIndex(5, COLS, LEN, 'ArrowRight')).toBe(6);
    expect(gridIndex(5, COLS, LEN, 'ArrowLeft')).toBe(4);
    expect(gridIndex(0, COLS, LEN, 'ArrowLeft')).toBe(0);
    expect(gridIndex(LEN - 1, COLS, LEN, 'ArrowRight')).toBe(LEN - 1);
  });
  it('steps a full row on Up/Down, clamped at the ends', () => {
    expect(gridIndex(2, COLS, LEN, 'ArrowDown')).toBe(11);
    expect(gridIndex(11, COLS, LEN, 'ArrowUp')).toBe(2);
    expect(gridIndex(2, COLS, LEN, 'ArrowUp')).toBe(0);
    expect(gridIndex(LEN - 1, COLS, LEN, 'ArrowDown')).toBe(LEN - 1);
  });
  it('keeps the index for a non-arrow key (Enter falls through to native click)', () => {
    expect(gridIndex(7, COLS, LEN, 'Enter')).toBe(7);
  });
});

describe('editorMode', () => {
  it('create mode (no rename id): blank name, picker shown, Create action', () => {
    const m = editorMode(null, null);
    expect(m.kind).toBe('create');
    expect(m.initialName).toBe('');
    expect(m.showProfile).toBe(true);
    expect(m.title).toBe('New Playlist');
    expect(m.action).toContain('Create');
  });
  it('rename mode (truthy id): prefilled name, picker hidden, Save action', () => {
    const m = editorMode('pl-roadtrip', 'Road Trip');
    expect(m.kind).toBe('rename');
    expect(m.initialName).toBe('Road Trip');
    expect(m.showProfile).toBe(false);
    expect(m.title).toBe('Rename Playlist');
    expect(m.action).toContain('Save');
  });
  it('rename mode with no preset name falls back to empty (profile still hidden)', () => {
    const m = editorMode('pl-x', null);
    expect(m.kind).toBe('rename');
    expect(m.initialName).toBe('');
    expect(m.showProfile).toBe(false);
  });
});
