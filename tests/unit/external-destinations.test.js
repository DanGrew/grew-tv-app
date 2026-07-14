import { externalDestinations, launchExternalParams, externalDoorHtml } from '../../core/external-destinations.js';

describe('externalDestinations', () => {
  it('carries the Atlas entry with its exact config (name, icon, tv + remote urls)', () => {
    expect(externalDestinations()).toEqual([
      {
        id: 'atlas',
        name: 'Atlas',
        icon: '🗺️',
        tvUrl: 'http://192.168.1.242:8090/app/tv.html',
        remoteUrl: 'http://192.168.1.242:8090/app/remote.html'
      }
    ]);
  });

  it('returns a fresh array each call (a caller cannot mutate the module config)', () => {
    var first = externalDestinations();
    expect(first).not.toBe(externalDestinations());
    first.push({ id: 'x' });
    expect(externalDestinations()).toHaveLength(1);
  });
});

describe('launchExternalParams', () => {
  it('carries ONLY the TV url (the companion walks itself to remoteUrl)', () => {
    var dest = { id: 'atlas', name: 'Atlas', tvUrl: 'http://host/tv', remoteUrl: 'http://host/remote' };
    expect(launchExternalParams(dest)).toEqual({ tvUrl: 'http://host/tv' });
  });
});

describe('externalDoorHtml', () => {
  it('builds the destination icon + name spans, in order', () => {
    expect(externalDoorHtml({ icon: '🗺️', name: 'Atlas' })).toBe(
      '<span class="door-ico">🗺️</span><span class="door-name">Atlas</span>'
    );
  });

  it('reflects a different destination (icon + name are data-driven, not hardcoded)', () => {
    expect(externalDoorHtml({ icon: '📚', name: 'Library' })).toBe(
      '<span class="door-ico">📚</span><span class="door-name">Library</span>'
    );
  });
});
