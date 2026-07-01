// Pure helpers for the FEAT-036 (TASK-208) create-playlist screen: the on-screen
// keyboard layout, name editing (append/backspace within the 1-100 char limit the
// backend enforces — api/playlists.py _clean_name / _NAME_MAX), grid focus
// movement, and name validation. DOM-free so the create screen stays render-only
// and the rules are provable without a browser.

// Backend cap (api/playlists.py _NAME_MAX). Enforced here too so the on-screen
// keyboard can never build an over-long name the server would 400.
export var NAME_MAX = 100;

// Columns the create screen lays the on-screen keyboard cells in (one CSS grid),
// so d-pad focus moves by ±1 (Left/Right) or ±KEY_COLS (Up/Down).
export var KEY_COLS = 9;

// Character keys, row-major: A-Z then 0-9. Each cell appends its own character.
export var CHAR_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');

// Append a character, capped at NAME_MAX (an over-cap press is a no-op — the
// keyboard can never exceed the server limit).
export function appendChar(name, ch) {
  if (name.length >= NAME_MAX) return name;
  return name + ch;
}

// Drop the last character (empty stays empty).
export function backspace(name) {
  return name.slice(0, -1);
}

// The trimmed name the create request sends (mirrors backend _clean_name's trim).
export function cleanName(name) {
  return name.trim();
}

// Valid when the trimmed length is 1-NAME_MAX — matches the backend's
// 400-on-blank / 400-on-too-long rule. Drives the Create action.
export function isValidName(name) {
  var n = cleanName(name);
  return n.length >= 1 && n.length <= NAME_MAX;
}

// The character a hardware-keyboard keydown should type into the name, or '' for a
// non-typing key (BUG-023: the create/rename name screen is a d-pad on-screen grid,
// so a real keyboard was inert — only Escape/Backspace were routed). A printable key
// is a single-character `e.key` (letters, digits, space, punctuation) pressed without
// a Ctrl/Alt/Meta chord (those are shortcuts, not text). Returning the char lets the
// screen route it through the exact same setName(appendChar(...)) path the on-screen
// keys use, so hardware typing and the d-pad grid stay in lock-step; a '' result is
// filtered out branch-free (arrows, Enter, Backspace, F-keys all have multi-char keys).
export function typedChar(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return '';
  if (e.key.length !== 1) return '';
  return e.key;
}

// Next focus index after an arrow over a `cols`-wide grid of `len` cells, clamped
// to [0, len-1]. Left/Right step one cell (wrapping across rows is fine on a TV
// keyboard); Up/Down step a full row. A non-arrow key keeps the index (Enter then
// falls through to the focused cell's native click).
export function gridIndex(i, cols, len, key) {
  if (key === 'ArrowRight') return Math.min(i + 1, len - 1);
  if (key === 'ArrowLeft') return Math.max(i - 1, 0);
  if (key === 'ArrowDown') return Math.min(i + cols, len - 1);
  if (key === 'ArrowUp') return Math.max(i - cols, 0);
  return i;
}

// Editor-mode descriptor for the ONE shared name screen used by create (TASK-208)
// and rename (TASK-210), so both surfaces drive the same screen with a single param
// instead of a second copy of the on-screen keyboard. A truthy `renameId` selects
// rename mode: it prefills the playlist's existing name and HIDES the profile picker
// (a playlist's profile is immutable after create — rename edits the name only).
// create mode starts blank with the picker shown. `kind` keys the screen's
// submit/cancel dispatch; the rest is render data. Pure, so the rule lives in core
// and the screens (UI cyclomatic-capped) stay branch-free.
export function editorMode(renameId, presetName) {
  if (renameId) {
    return { kind: 'rename', title: 'Rename Playlist', initialName: presetName || '',
             showProfile: false, action: '✓ Save' };
  }
  return { kind: 'create', title: 'New Playlist', initialName: '',
           showProfile: true, action: '✓ Create' };
}
