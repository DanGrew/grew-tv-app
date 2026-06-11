import { screenLabel, chooserState, chooserMode } from '../../core/screen-chooser.js';

describe('screenLabel', () => {
  it('uses the device label', () => {
    expect(screenLabel({ device_id: 'a', label: 'Living Room' })).toBe('Living Room');
  });
  it('falls back to Screen for a label-less device', () => {
    expect(screenLabel({ device_id: 'a' })).toBe('Screen');
  });
  it('falls back to Screen for a null device', () => {
    expect(screenLabel(null)).toBe('Screen');
  });
});

describe('chooserState', () => {
  var devs = [{ device_id: 'a', label: 'A' }, { device_id: 'b', label: 'B' }];

  it('is bound when the target is in the live list', () => {
    var s = chooserState(devs, 'b');
    expect(s.bound).toBe(true);
    expect(s.current.device_id).toBe('b');
    expect(s.currentLabel).toBe('B');
  });

  it('is UNBOUND when no target (>1 screen, none chosen)', () => {
    var s = chooserState(devs, null);
    expect(s.bound).toBe(false);
    expect(s.current).toBe(null);
    expect(s.currentLabel).toBe('Screen');
  });

  // A persisted target whose screen went offline must read as unbound so the
  // page shows a chooser, not a blank content area (BUG-013 / BUG-012 D1).
  it('is UNBOUND when the persisted target is absent from the live list', () => {
    var s = chooserState(devs, 'gone');
    expect(s.bound).toBe(false);
  });

  it('tolerates a null device list', () => {
    var s = chooserState(null, 'a');
    expect(s.devices).toEqual([]);
    expect(s.bound).toBe(false);
  });
});

describe('chooserMode', () => {
  it('waits when there are no screens', () => {
    expect(chooserMode(chooserState([], null), false)).toBe('waiting');
  });
  it('shows the picker when unbound among several', () => {
    expect(chooserMode(chooserState([{ device_id: 'a' }, { device_id: 'b' }], null), false)).toBe('unbound');
  });
  it('collapses to the current-screen pill when bound and closed', () => {
    expect(chooserMode(chooserState([{ device_id: 'a' }], 'a'), false)).toBe('collapsed');
  });
  it('expands the list when bound and opened', () => {
    expect(chooserMode(chooserState([{ device_id: 'a' }], 'a'), true)).toBe('expanded');
  });
});
