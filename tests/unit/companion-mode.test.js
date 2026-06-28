import {
  createCompanionMode, appStateDrivesNav, navIntentsAllowed, SYNCED, DESYNCED
} from '../../core/companion-mode.js';

describe('appStateDrivesNav / navIntentsAllowed predicates', () => {
  it('both seams open when synced', () => {
    expect(appStateDrivesNav(SYNCED)).toBe(true);
    expect(navIntentsAllowed(SYNCED)).toBe(true);
  });

  it('both seams closed when desynced', () => {
    expect(appStateDrivesNav(DESYNCED)).toBe(false);
    expect(navIntentsAllowed(DESYNCED)).toBe(false);
  });

  // Anything that is not literally DESYNCED is treated as driving (fail-open):
  // a missing/unknown mode never silently suppresses the TV.
  it('treats an unknown mode as synced (fail-open)', () => {
    expect(appStateDrivesNav(undefined)).toBe(true);
    expect(navIntentsAllowed('something-else')).toBe(true);
  });
});

describe('createCompanionMode', () => {
  it('defaults to synced (unchanged behaviour)', () => {
    var m = createCompanionMode();
    expect(m.mode()).toBe(SYNCED);
    expect(m.isDesynced()).toBe(false);
    expect(m.drivesNav()).toBe(true);
    expect(m.intentsAllowed()).toBe(true);
  });

  it('setDesynced closes both seams', () => {
    var m = createCompanionMode();
    m.setDesynced();
    expect(m.isDesynced()).toBe(true);
    expect(m.drivesNav()).toBe(false);
    expect(m.intentsAllowed()).toBe(false);
  });

  it('toggle flips the mode and returns the new mode', () => {
    var m = createCompanionMode();
    expect(m.toggle()).toBe(DESYNCED);
    expect(m.isDesynced()).toBe(true);
    expect(m.toggle()).toBe(SYNCED);
    expect(m.isDesynced()).toBe(false);
  });

  it('setSynced re-syncs (idempotent from synced)', () => {
    var m = createCompanionMode();
    m.setSynced();
    expect(m.mode()).toBe(SYNCED);
  });
});

describe('local navigation stack', () => {
  it('starts empty', () => {
    var m = createCompanionMode();
    expect(m.depth()).toBe(0);
    expect(m.current()).toBe(null);
    expect(m.back()).toBe(null);
  });

  it('push / current track the top entry', () => {
    var m = createCompanionMode();
    m.push({ page: 'browse' });
    m.push({ page: 'detail', params: { id: 'film-1' } });
    expect(m.depth()).toBe(2);
    expect(m.current().page).toBe('detail');
    expect(m.current().params.id).toBe('film-1');
  });

  it('back pops and returns the new current', () => {
    var m = createCompanionMode();
    m.push({ page: 'browse' });
    m.push({ page: 'detail' });
    expect(m.back().page).toBe('browse');
    expect(m.depth()).toBe(1);
    expect(m.back()).toBe(null);
    expect(m.depth()).toBe(0);
  });

  it('reset clears the stack without touching the mode', () => {
    var m = createCompanionMode();
    m.setDesynced();
    m.push({ page: 'browse' });
    m.reset();
    expect(m.depth()).toBe(0);
    expect(m.isDesynced()).toBe(true);
  });

  // Re-sync contract (FEAT-038): going synced clears the local stack so Sync
  // re-applies the latest app_state from a clean slate.
  it('setSynced clears the local stack (re-sync contract)', () => {
    var m = createCompanionMode();
    m.setDesynced();
    m.push({ page: 'browse' });
    m.push({ page: 'detail' });
    expect(m.depth()).toBe(2);
    m.setSynced();
    expect(m.depth()).toBe(0);
    expect(m.current()).toBe(null);
  });

  it('toggle back to synced also clears the stack', () => {
    var m = createCompanionMode();
    m.toggle();                 // -> desynced
    m.push({ page: 'browse' });
    m.toggle();                 // -> synced
    expect(m.depth()).toBe(0);
  });
});
