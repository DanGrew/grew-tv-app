import { loadManifest, scanDevices } from '../../core/app-manifest.js';

describe('loadManifest', () => {
  it('fetches serverUrl + /manifest.json with cache: no-store', async () => {
    var fetched = null, fetchOpts = null;
    global.fetch = async (url, opts) => { fetched = url; fetchOpts = opts; return { json: async () => ({}) }; };
    await loadManifest('http://localhost:8765');
    expect(fetched).toBe('http://localhost:8765/manifest.json');
    expect(fetchOpts).toEqual({ cache: 'no-store' });
  });

  it('resolves with parsed JSON', async () => {
    global.fetch = async () => ({ json: async () => ({ content: [] }) });
    var data = await loadManifest('http://localhost:8765');
    expect(data).toEqual({ content: [] });
  });
});

describe('scanDevices', () => {
  it('fetches serverUrl + /scan with cache: no-store', async () => {
    var fetched = null, fetchOpts = null;
    global.fetch = async (url, opts) => { fetched = url; fetchOpts = opts; return { json: async () => ({}) }; };
    await scanDevices('http://localhost:8765');
    expect(fetched).toBe('http://localhost:8765/scan');
    expect(fetchOpts).toEqual({ cache: 'no-store' });
  });

  it('resolves with parsed JSON', async () => {
    global.fetch = async () => ({ json: async () => ({ devices: ['TV'] }) });
    var data = await scanDevices('http://localhost:8765');
    expect(data).toEqual({ devices: ['TV'] });
  });
});
