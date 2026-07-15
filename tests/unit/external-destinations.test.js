import { externalDestinations, destinationUrls, launchExternalParams } from '../../core/external-destinations.js';

describe('externalDestinations', () => {
  it('carries the Atlas entry with its exact config (name, icon, port, paths — no baked host)', () => {
    expect(externalDestinations()).toEqual([
      {
        id: 'atlas',
        name: 'Atlas',
        icon: '🗺️',
        port: 8090,
        tvPath: '/app/tv.html',
        remotePath: '/app/remote.html'
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

describe('destinationUrls', () => {
  var atlas = externalDestinations()[0];

  it('builds both URLs against the given host (the host grew-tv was served from)', () => {
    expect(destinationUrls(atlas, '192.168.1.50')).toEqual({
      tvUrl: 'http://192.168.1.50:8090/app/tv.html',
      remoteUrl: 'http://192.168.1.50:8090/app/remote.html'
    });
  });

  it('follows the host — localhost in local dev resolves to localhost, not a baked IP (BUG-054)', () => {
    var urls = destinationUrls(atlas, 'localhost');
    expect(urls.tvUrl).toBe('http://localhost:8090/app/tv.html');
    expect(urls.remoteUrl).toBe('http://localhost:8090/app/remote.html');
    // the pre-fix bug: a hardcoded 192.168.1.242 that ignored the serving host
    expect(urls.tvUrl).not.toContain('192.168.1.242');
    expect(urls.remoteUrl).not.toContain('192.168.1.242');
  });

  it('uses the destination port + paths (not hardcoded)', () => {
    var dest = { id: 'x', port: 9999, tvPath: '/t.html', remotePath: '/r.html' };
    expect(destinationUrls(dest, 'h')).toEqual({
      tvUrl: 'http://h:9999/t.html',
      remoteUrl: 'http://h:9999/r.html'
    });
  });
});

describe('launchExternalParams', () => {
  it('carries ONLY the host-derived TV url (the companion walks itself to remoteUrl)', () => {
    var atlas = externalDestinations()[0];
    expect(launchExternalParams(atlas, 'tv.local')).toEqual({ tvUrl: 'http://tv.local:8090/app/tv.html' });
  });
});
