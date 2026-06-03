import { loadManifest } from '../../core/companion-manifest.js';

describe('loadManifest', () => {
  it('fetches serverUrl + /manifest.json', async () => {
    var fetched = null;
    global.fetch = async (url) => { fetched = url; return { ok: true, json: async () => ({}) }; };
    await loadManifest('http://testhost:9000');
    expect(fetched).toBe('http://testhost:9000/manifest.json');
  });

  it('resolves with parsed JSON on ok response', async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ content: [{ id: 'a' }] }) });
    var data = await loadManifest('http://localhost:8765');
    expect(data).toEqual({ content: [{ id: 'a' }] });
  });

  it('rejects with status on non-ok response', async () => {
    global.fetch = async () => ({ ok: false, status: 404 });
    await expect(loadManifest('http://localhost:8765')).rejects.toBe(404);
  });
});
