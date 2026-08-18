import { vi } from 'vitest';
import { refreshPlaylistSyncStatus } from '../../core/downloads-disk-status.js';
import { isSynced, markSynced } from '../../core/downloads-synced.js';

var store;
beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; }
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

// A minimal fake of the File System Access directory-handle contract this
// module actually calls: getFileHandle/getDirectoryHandle reject
// NotFoundError when absent (real browser behaviour, never `{create:true}`
// here — the module is read-only), and `values()` is an async iterator over
// plain files, matching the real API shape (`{kind, name}` entries).
function fakeDirHandle(files, dirs) {
  var f = Object.assign({}, files || {});
  var d = Object.assign({}, dirs || {});
  return {
    getFileHandle: async function(name) {
      if (Object.prototype.hasOwnProperty.call(f, name)) return {};
      var e = new Error('not found'); e.name = 'NotFoundError'; throw e;
    },
    getDirectoryHandle: async function(name) {
      if (Object.prototype.hasOwnProperty.call(d, name)) return d[name];
      var e = new Error('not found'); e.name = 'NotFoundError'; throw e;
    },
    values: async function*() {
      for (var name in f) yield { kind: 'file', name: name };
      for (var name2 in d) yield { kind: 'directory', name: name2 };
    }
  };
}

// Seeds <root>/grew-tv/<playlistTitle>/ with `files` already present —
// mirrors what a prior syncPlaylist run (or a different browser/profile
// sharing the same picked folder) would have left on disk.
function seedPlaylistDir(playlistTitle, files) {
  var playlistDir = fakeDirHandle(files || {});
  var grewTv = fakeDirHandle({}, seedEntry(playlistTitle, playlistDir));
  var root = fakeDirHandle({}, seedEntry('grew-tv', grewTv));
  return { root: root, playlistDir: playlistDir };
}
function seedEntry(name, handle) {
  var o = {};
  o[name] = handle;
  return o;
}

var PL = { id: 'pl-a', title: 'Road Trip', clipCount: 2 };
var FULL_FILES = {
  '01 - ELO - Mr Blue Sky.m4a': true,
  '02 - ELO - Sweet Talkin Woman.m4a': true,
  'Road Trip.m3u': true
};

describe('refreshPlaylistSyncStatus', () => {
  it('marks synced when the audio count matches clipCount and the .m3u is present', async () => {
    var seeded = seedPlaylistDir(PL.title, FULL_FILES);
    var result = await refreshPlaylistSyncStatus(seeded.root, PL);
    expect(result).toBe(true);
    expect(isSynced(PL.id)).toBe(true);
  });

  it('unmarks when the folder has fewer audio files than clipCount', async () => {
    markSynced(PL.id);
    var partial = Object.assign({}, FULL_FILES);
    delete partial['02 - ELO - Sweet Talkin Woman.m4a'];
    var seeded = seedPlaylistDir(PL.title, partial);
    var result = await refreshPlaylistSyncStatus(seeded.root, PL);
    expect(result).toBe(false);
    expect(isSynced(PL.id)).toBe(false);
  });

  it('unmarks when the audio count matches but the .m3u is missing', async () => {
    markSynced(PL.id);
    var noM3u = Object.assign({}, FULL_FILES);
    delete noM3u['Road Trip.m3u'];
    var seeded = seedPlaylistDir(PL.title, noM3u);
    var result = await refreshPlaylistSyncStatus(seeded.root, PL);
    expect(result).toBe(false);
    expect(isSynced(PL.id)).toBe(false);
  });

  it('excludes .lrc sidecars from the audio count', async () => {
    var withLyrics = Object.assign({}, FULL_FILES);
    withLyrics['01 - ELO - Mr Blue Sky.lrc'] = true;
    var seeded = seedPlaylistDir(PL.title, withLyrics);
    var result = await refreshPlaylistSyncStatus(seeded.root, PL);
    expect(result).toBe(true);
    expect(isSynced(PL.id)).toBe(true);
  });

  it('unmarks when the audio count exceeds clipCount', async () => {
    markSynced(PL.id);
    var extra = Object.assign({}, FULL_FILES);
    extra['03 - ELO - Evil Woman.m4a'] = true;
    var seeded = seedPlaylistDir(PL.title, extra);
    var result = await refreshPlaylistSyncStatus(seeded.root, PL);
    expect(result).toBe(false);
    expect(isSynced(PL.id)).toBe(false);
  });

  it('unmarks when the grew-tv folder does not exist yet', async () => {
    markSynced(PL.id);
    var root = fakeDirHandle({}, {});
    var result = await refreshPlaylistSyncStatus(root, PL);
    expect(result).toBe(false);
    expect(isSynced(PL.id)).toBe(false);
  });

  it('unmarks when grew-tv exists but this playlist has no folder of its own', async () => {
    markSynced(PL.id);
    var grewTv = fakeDirHandle({}, {});
    var root = fakeDirHandle({}, seedEntry('grew-tv', grewTv));
    var result = await refreshPlaylistSyncStatus(root, PL);
    expect(result).toBe(false);
    expect(isSynced(PL.id)).toBe(false);
  });

  it('rejects and leaves the persisted flag untouched on a real FS error', async () => {
    markSynced(PL.id);
    var root = {
      getDirectoryHandle: async function() { throw new Error('permission revoked'); }
    };
    await expect(refreshPlaylistSyncStatus(root, PL)).rejects.toThrow('permission revoked');
    expect(isSynced(PL.id)).toBe(true);
  });

  it('rejects, rather than reading as not-synced, on a real FS error checking for the .m3u', async () => {
    markSynced(PL.id);
    var badPlaylistDir = { getFileHandle: async function() { throw new Error('permission revoked'); } };
    var grewTv = fakeDirHandle({}, seedEntry(PL.title, badPlaylistDir));
    var root = fakeDirHandle({}, seedEntry('grew-tv', grewTv));
    await expect(refreshPlaylistSyncStatus(root, PL)).rejects.toThrow('permission revoked');
    expect(isSynced(PL.id)).toBe(true);
  });

  it('does not count a subdirectory entry as an audio file', async () => {
    var playlistDir = fakeDirHandle(FULL_FILES, seedEntry('some-cache', fakeDirHandle({})));
    var seeded = { root: fakeDirHandle({}, seedEntry('grew-tv', fakeDirHandle({}, seedEntry(PL.title, playlistDir)))) };
    var result = await refreshPlaylistSyncStatus(seeded.root, PL);
    expect(result).toBe(true);
    expect(isSynced(PL.id)).toBe(true);
  });
});
