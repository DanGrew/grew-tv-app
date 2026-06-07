import { switchProfileTarget } from '../../core/switch-profile.js';

describe('switchProfileTarget', () => {
  it('points at the profile picker page with no params', () => {
    expect(switchProfileTarget()).toEqual({ page: 'profile.html', params: {} });
  });

  it('returns a fresh object each call (callers may mutate params)', () => {
    expect(switchProfileTarget()).not.toBe(switchProfileTarget());
  });
});
