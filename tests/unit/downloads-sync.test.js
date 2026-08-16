import { vi } from 'vitest';
import { ensureTrackFiles, m3uText, syncPlaylist, syncPlaylists, syncCheckedPlaylists } from '../../core/downloads-sync.js';
import { syncedPlaylistIds } from '../../core/downloads-synced.js';

// A minimal fake of the File System Access directory-handle contract this
// module actually calls: getFileHandle(name[, {create}])/getDirectoryHandle
// reject NotFoundError when absent and create is falsy (real browser
// behaviour), otherwise resolve a handle. A directory handle is itself
// another fakeDirHandle, so BUG-416's `grew-tv/<playlist>/` nesting is just
// two getDirectoryHandle hops. createWritable().write/close records into the
// owning handle's own `files` (name -> the exact value passed to write()).
function fakeDirHandle(existing) {
  var files = Object.assign({}, existing || {});
  var dirs = {};
  function fileHandle(name) {
    return {
      createWritable: async function() {
        return {
          write: async function(data) { files[name] = data; },
          close: async function() {}
        };
      }
    };
  }
  return {
    files: files,
    dirs: dirs,
    getFileHandle: async function(name, opts) {
      if (Object.prototype.hasOwnProperty.call(files, name)) return fileHandle(name);
      if (opts && opts.create) { files[name] = undefined; return fileHandle(name); }
      var e = new Error('not found'); e.name = 'NotFoundError'; throw e;
    },
    getDirectoryHandle: async function(name, opts) {
      if (Object.prototype.hasOwnProperty.call(dirs, name)) return dirs[name];
      if (opts && opts.create) { dirs[name] = fakeDirHandle({}); return dirs[name]; }
      var e = new Error('not found'); e.name = 'NotFoundError'; throw e;
    }
  };
}

// A playlist's actual working folder, once syncPlaylist has created it:
// <root>/grew-tv/<playlist title>/.
function plDir(rootDir, playlistTitle) {
  return rootDir.dirs['grew-tv'].dirs[playlistTitle];
}
function plFiles(rootDir, playlistTitle) {
  return plDir(rootDir, playlistTitle).files;
}

// Pre-seeds <root>/grew-tv/<playlistTitle>/ with `files` already present, and
// hands back both the root (to pass into syncPlaylist) and the playlist's
// own dir handle (to inspect or monkey-patch getFileHandle on directly —
// syncPlaylist resolves and operates on that nested handle, not the root).
function seedPlaylistDir(playlistTitle, files) {
  var root = fakeDirHandle({});
  var grewTv = fakeDirHandle({});
  var pl = fakeDirHandle(files || {});
  grewTv.dirs[playlistTitle] = pl;
  root.dirs['grew-tv'] = grewTv;
  return { root: root, playlistDir: pl };
}

function fakeFetch(byUrl) {
  global.fetch = async function(url) {
    var body = byUrl[url];
    if (body === undefined) return { ok: false, status: 404 };
    return {
      ok: true, status: 200,
      blob: async function() { return body; },
      text: async function() { return body; },
      json: async function() { return body; }
    };
  };
}

var TRACK_NO_LYRICS = { id: 'ootb-03', title: 'Sweet Talkin Woman', artist: 'ELO', ext: 'm4a', duration: 228 };
var TRACK_WITH_LYRICS = { id: 'ootb-02', title: 'Mr. Blue Sky', artist: 'ELO', ext: 'm4a', duration: 245, lyrics: 'ootb-02.lrc' };

describe('ensureTrackFiles', () => {
  it('rejects when the audio fetch is not ok', async () => {
    fakeFetch({});
    var dir = fakeDirHandle({});
    await expect(ensureTrackFiles(dir, 'http://s', TRACK_NO_LYRICS, 1, 1)).rejects.toBe(404);
  });

  it('fetches and writes the audio file when absent', async () => {
    fakeFetch({ 'http://s/media/ootb-03.m4a': 'AUDIO-BYTES' });
    var dir = fakeDirHandle({});
    var wasWritten = await ensureTrackFiles(dir, 'http://s', TRACK_NO_LYRICS, 1, 1);
    expect(wasWritten).toBe(true);
    expect(dir.files['01 - ELO - Sweet Talkin Woman.m4a']).toBe('AUDIO-BYTES');
  });

  it('skips the fetch+write when the audio file already exists', async () => {
    global.fetch = async function() { throw new Error('should not fetch'); };
    var dir = fakeDirHandle({ '01 - ELO - Sweet Talkin Woman.m4a': 'EXISTING' });
    var wasWritten = await ensureTrackFiles(dir, 'http://s', TRACK_NO_LYRICS, 1, 1);
    expect(wasWritten).toBe(false);
    expect(dir.files['01 - ELO - Sweet Talkin Woman.m4a']).toBe('EXISTING');
  });

  it('also fetches+writes the .lrc when the track has lyrics and it is absent', async () => {
    fakeFetch({
      'http://s/media/ootb-02.m4a': 'AUDIO-BYTES',
      'http://s/media/ootb-02.lrc': '[00:01.00]line one'
    });
    var dir = fakeDirHandle({});
    await ensureTrackFiles(dir, 'http://s', TRACK_WITH_LYRICS, 1, 1);
    expect(dir.files['01 - ELO - Mr. Blue Sky.lrc']).toBe('[00:01.00]line one');
  });

  it('skips the .lrc fetch+write when it already exists', async () => {
    fakeFetch({ 'http://s/media/ootb-02.m4a': 'AUDIO-BYTES' });
    var dir = fakeDirHandle({ '01 - ELO - Mr. Blue Sky.lrc': 'EXISTING-LRC' });
    await ensureTrackFiles(dir, 'http://s', TRACK_WITH_LYRICS, 1, 1);
    expect(dir.files['01 - ELO - Mr. Blue Sky.lrc']).toBe('EXISTING-LRC');
  });

  it('never touches a .lrc file when the track has no lyrics', async () => {
    fakeFetch({ 'http://s/media/ootb-03.m4a': 'AUDIO-BYTES' });
    var dir = fakeDirHandle({});
    await ensureTrackFiles(dir, 'http://s', TRACK_NO_LYRICS, 1, 1);
    expect(dir.files['01 - ELO - Sweet Talkin Woman.lrc']).toBeUndefined();
  });
});

describe('m3uText', () => {
  it('emits #EXTM3U, one #EXTINF + filename pair per track, in order', () => {
    var text = m3uText([TRACK_NO_LYRICS, TRACK_WITH_LYRICS]);
    expect(text).toBe(
      '#EXTM3U\n' +
      '#EXTINF:228,ELO - Sweet Talkin Woman\n' +
      '01 - ELO - Sweet Talkin Woman.m4a\n' +
      '#EXTINF:245,ELO - Mr. Blue Sky\n' +
      '02 - ELO - Mr. Blue Sky.m4a\n'
    );
  });
  it('falls back to -1 duration when absent', () => {
    var text = m3uText([{ id: 'x', title: 'No Duration', artist: 'A', ext: 'mp3', duration: null }]);
    expect(text).toContain('#EXTINF:-1,A - No Duration\n');
  });
  it('omits the "artist - " prefix when artist is absent', () => {
    var text = m3uText([{ id: 'x', title: 'Solo', artist: null, ext: 'mp3', duration: 10 }]);
    expect(text).toContain('#EXTINF:10,Solo\n');
  });
  it('is just the header for an empty track list', () => {
    expect(m3uText([])).toBe('#EXTM3U\n');
  });
  // BUG-416 — a failed track is a null in its own slot (not removed from the
  // array), so a later track's index/padding still matches the total and so
  // the filename ensureTrackFiles actually wrote — a renumbered subset would
  // reference a file that doesn't exist on disk.
  it('skips a null slot but keeps a later track\'s position/padding relative to the full total, not a renumbered subset', () => {
    var text = m3uText([TRACK_NO_LYRICS, null, TRACK_WITH_LYRICS]);
    expect(text).toBe(
      '#EXTM3U\n' +
      '#EXTINF:228,ELO - Sweet Talkin Woman\n' +
      '01 - ELO - Sweet Talkin Woman.m4a\n' +
      '#EXTINF:245,ELO - Mr. Blue Sky\n' +
      '03 - ELO - Mr. Blue Sky.m4a\n'
    );
  });
});

describe('syncPlaylist', () => {
  var PLAYLIST = {
    title: 'Road Trip',
    items: [{ video: TRACK_NO_LYRICS }, { video: TRACK_WITH_LYRICS }]
  };

  it('writes every missing track, rewrites the .m3u, and reports the dedup counts', async () => {
    fakeFetch({
      'http://s/media/ootb-03.m4a': 'A1',
      'http://s/media/ootb-02.m4a': 'A2',
      'http://s/media/ootb-02.lrc': 'L2'
    });
    var dir = fakeDirHandle({});
    var summary = await syncPlaylist(dir, 'http://s', PLAYLIST);
    expect(summary).toEqual({ total: 2, written: 2, alreadyPresent: 0, failed: [], playlistFileError: null });
    expect(new TextDecoder().decode(plFiles(dir, 'Road Trip')['Road Trip.m3u'])).toBe(
      '#EXTM3U\n#EXTINF:228,ELO - Sweet Talkin Woman\n01 - ELO - Sweet Talkin Woman.m4a\n' +
      '#EXTINF:245,ELO - Mr. Blue Sky\n02 - ELO - Mr. Blue Sky.m4a\n'
    );
  });

  // BUG-416 — writable.write() gets raw bytes (TextEncoder never emits a
  // BOM), not a JS string some File System Access implementations would
  // prepend a BOM to, breaking Musicolet's `#EXTM3U` magic-string check.
  it('writes the .m3u as BOM-free bytes, not a string', async () => {
    fakeFetch({
      'http://s/media/ootb-03.m4a': 'A1',
      'http://s/media/ootb-02.m4a': 'A2',
      'http://s/media/ootb-02.lrc': 'L2'
    });
    var dir = fakeDirHandle({});
    await syncPlaylist(dir, 'http://s', PLAYLIST);
    var bytes = plFiles(dir, 'Road Trip')['Road Trip.m3u'];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes.slice(0, 3))).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes).startsWith('#EXTM3U\n')).toBe(true);
  });

  it('counts a track already present in the folder as alreadyPresent, not written', async () => {
    fakeFetch({ 'http://s/media/ootb-02.m4a': 'A2', 'http://s/media/ootb-02.lrc': 'L2' });
    var seeded = seedPlaylistDir('Road Trip', { '01 - ELO - Sweet Talkin Woman.m4a': 'EXISTING' });
    var summary = await syncPlaylist(seeded.root, 'http://s', PLAYLIST);
    expect(summary).toEqual({ total: 2, written: 1, alreadyPresent: 1, failed: [], playlistFileError: null });
  });

  it('reports progress via onTrack(i, total) after each track', async () => {
    fakeFetch({
      'http://s/media/ootb-03.m4a': 'A1',
      'http://s/media/ootb-02.m4a': 'A2',
      'http://s/media/ootb-02.lrc': 'L2'
    });
    var dir = fakeDirHandle({});
    var calls = [];
    await syncPlaylist(dir, 'http://s', PLAYLIST, function(i, total) { calls.push([i, total]); });
    expect(calls).toEqual([[1, 2], [2, 2]]);
  });

  it('tolerates a playlist with no items', async () => {
    var dir = fakeDirHandle({});
    var summary = await syncPlaylist(dir, 'http://s', { title: 'Empty Mix', items: [] });
    expect(summary).toEqual({ total: 0, written: 0, alreadyPresent: 0, failed: [], playlistFileError: null });
    expect(new TextDecoder().decode(plFiles(dir, 'Empty Mix')['Empty Mix.m3u'])).toBe('#EXTM3U\n');
  });

  it('tolerates a playlist with items missing altogether', async () => {
    var dir = fakeDirHandle({});
    var summary = await syncPlaylist(dir, 'http://s', { title: 'No Items Field' });
    expect(summary).toEqual({ total: 0, written: 0, alreadyPresent: 0, failed: [], playlistFileError: null });
  });

  // BUG-064 — a single track's failure no longer aborts the batch.
  describe('per-track failure containment (BUG-064)', () => {
    it('continues past a failed track (a 404) and still writes the rest', async () => {
      fakeFetch({ 'http://s/media/ootb-02.m4a': 'A2', 'http://s/media/ootb-02.lrc': 'L2' });
      var dir = fakeDirHandle({});
      var summary = await syncPlaylist(dir, 'http://s', PLAYLIST);
      expect(summary.total).toBe(2);
      expect(summary.written).toBe(1);
      expect(plFiles(dir, 'Road Trip')['02 - ELO - Mr. Blue Sky.m4a']).toBe('A2');
    });

    it('reports the failed track by id/title with an "HTTP {status}" reason', async () => {
      fakeFetch({ 'http://s/media/ootb-02.m4a': 'A2', 'http://s/media/ootb-02.lrc': 'L2' });
      var dir = fakeDirHandle({});
      var summary = await syncPlaylist(dir, 'http://s', PLAYLIST);
      expect(summary.failed).toEqual([{ id: 'ootb-03', title: 'Sweet Talkin Woman', reason: 'HTTP 404' }]);
    });

    // BUG-416 — a failed track that isn't the LAST one queued must not
    // shorten the playlist's effective total for the tracks written before
    // it (a length derived by only touching succeeded indices would come up
    // short when the very last track is the one that fails).
    it('a trailing (last-queued) track failing does not corrupt the .m3u for the tracks that succeeded before it', async () => {
      fakeFetch({ 'http://s/media/ootb-03.m4a': 'A1' });
      var dir = fakeDirHandle({});
      await syncPlaylist(dir, 'http://s', PLAYLIST);
      expect(new TextDecoder().decode(plFiles(dir, 'Road Trip')['Road Trip.m3u'])).toBe(
        '#EXTM3U\n#EXTINF:228,ELO - Sweet Talkin Woman\n01 - ELO - Sweet Talkin Woman.m4a\n'
      );
    });

    it('reports an FS write error by its message', async () => {
      fakeFetch({
        'http://s/media/ootb-03.m4a': 'A1',
        'http://s/media/ootb-02.m4a': 'A2',
        'http://s/media/ootb-02.lrc': 'L2'
      });
      var seeded = seedPlaylistDir('Road Trip', {});
      var realGetFileHandle = seeded.playlistDir.getFileHandle;
      seeded.playlistDir.getFileHandle = async function(name, opts) {
        if (name === '01 - ELO - Sweet Talkin Woman.m4a' && opts && opts.create) throw new Error('disk full');
        return realGetFileHandle(name, opts);
      };
      var summary = await syncPlaylist(seeded.root, 'http://s', PLAYLIST);
      expect(summary.failed).toEqual([{ id: 'ootb-03', title: 'Sweet Talkin Woman', reason: 'disk full' }]);
      expect(summary.written).toBe(1);
      expect(plFiles(seeded.root, 'Road Trip')['02 - ELO - Mr. Blue Sky.m4a']).toBe('A2');
    });

    it('falls back to String(e) for a thrown value with no .message', async () => {
      fakeFetch({
        'http://s/media/ootb-03.m4a': 'A1',
        'http://s/media/ootb-02.m4a': 'A2',
        'http://s/media/ootb-02.lrc': 'L2'
      });
      var seeded = seedPlaylistDir('Road Trip', {});
      var realGetFileHandle = seeded.playlistDir.getFileHandle;
      seeded.playlistDir.getFileHandle = async function(name, opts) {
        if (name === '01 - ELO - Sweet Talkin Woman.m4a' && opts && opts.create) throw 'oops';
        return realGetFileHandle(name, opts);
      };
      var summary = await syncPlaylist(seeded.root, 'http://s', PLAYLIST);
      expect(summary.failed).toEqual([{ id: 'ootb-03', title: 'Sweet Talkin Woman', reason: 'oops' }]);
    });

    it('the .m3u lists only the tracks that actually have a file, not the failed one', async () => {
      fakeFetch({ 'http://s/media/ootb-02.m4a': 'A2', 'http://s/media/ootb-02.lrc': 'L2' });
      var dir = fakeDirHandle({});
      await syncPlaylist(dir, 'http://s', PLAYLIST);
      expect(new TextDecoder().decode(plFiles(dir, 'Road Trip')['Road Trip.m3u'])).toBe(
        '#EXTM3U\n#EXTINF:245,ELO - Mr. Blue Sky\n02 - ELO - Mr. Blue Sky.m4a\n'
      );
    });

    it('a failed track still counts toward progress', async () => {
      fakeFetch({ 'http://s/media/ootb-02.m4a': 'A2', 'http://s/media/ootb-02.lrc': 'L2' });
      var dir = fakeDirHandle({});
      var calls = [];
      await syncPlaylist(dir, 'http://s', PLAYLIST, function(i, total) { calls.push([i, total]); });
      expect(calls).toEqual([[1, 2], [2, 2]]);
    });
  });
});

describe('syncPlaylists', () => {
  it('loads and syncs each playlist id in order, keyed by id in the result', async () => {
    fakeFetch({
      'http://s/api/playlist/pl-a': { title: 'A', items: [{ video: TRACK_NO_LYRICS }] },
      'http://s/api/playlist/pl-b': { title: 'B', items: [{ video: TRACK_WITH_LYRICS }] },
      'http://s/media/ootb-03.m4a': 'A1',
      'http://s/media/ootb-02.m4a': 'A2',
      'http://s/media/ootb-02.lrc': 'L2'
    });
    var dir = fakeDirHandle({});
    var results = await syncPlaylists(dir, 'http://s', ['pl-a', 'pl-b']);
    expect(results).toEqual({
      'pl-a': { total: 1, written: 1, alreadyPresent: 0, failed: [], playlistFileError: null },
      'pl-b': { total: 1, written: 1, alreadyPresent: 0, failed: [], playlistFileError: null }
    });
    expect(plFiles(dir, 'A')['A.m3u']).toBeDefined();
    expect(plFiles(dir, 'B')['B.m3u']).toBeDefined();
  });

  it('reports progress via onProgress(playlistId, done, total)', async () => {
    fakeFetch({
      'http://s/api/playlist/pl-a': { title: 'A', items: [{ video: TRACK_NO_LYRICS }] },
      'http://s/media/ootb-03.m4a': 'A1'
    });
    var dir = fakeDirHandle({});
    var calls = [];
    await syncPlaylists(dir, 'http://s', ['pl-a'], function(id, done, total) { calls.push([id, done, total]); });
    expect(calls).toEqual([['pl-a', 1, 1]]);
  });

  it('is {} for an empty id list', async () => {
    var dir = fakeDirHandle({});
    expect(await syncPlaylists(dir, 'http://s', [])).toEqual({});
  });

  // BUG-416 (Musicolet folder-per-playlist) — each playlist gets its own
  // grew-tv/<title> folder now, so a track shared by two playlists downloads
  // (and dedup-checks) independently into each one rather than the old
  // shared-flat-folder cross-playlist dedup (TASK-403 story 5). No symlinks
  // are possible through the File System Access API, so a second physical
  // copy is the deliberate cost of a folder a player can browse standalone.
  it('two playlists sharing a track each get their own copy in their own subfolder, not deduped across playlists', async () => {
    fakeFetch({
      'http://s/api/playlist/pl-a': { title: 'A', items: [{ video: TRACK_NO_LYRICS }] },
      'http://s/api/playlist/pl-b': { title: 'B', items: [{ video: TRACK_NO_LYRICS }] },
      'http://s/media/ootb-03.m4a': 'AUDIO'
    });
    var dir = fakeDirHandle({});
    var results = await syncPlaylists(dir, 'http://s', ['pl-a', 'pl-b']);
    expect(results['pl-a'].written).toBe(1);
    expect(results['pl-b'].written).toBe(1);
    expect(plFiles(dir, 'A')['01 - ELO - Sweet Talkin Woman.m4a']).toBe('AUDIO');
    expect(plFiles(dir, 'B')['01 - ELO - Sweet Talkin Woman.m4a']).toBe('AUDIO');
  });
});

describe('syncCheckedPlaylists', () => {
  var store;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v; }
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('syncs every id and marks each one synced', async () => {
    fakeFetch({
      'http://s/api/playlist/pl-a': { title: 'A', items: [{ video: TRACK_NO_LYRICS }] },
      'http://s/media/ootb-03.m4a': 'A1'
    });
    var dir = fakeDirHandle({});
    var results = await syncCheckedPlaylists(dir, 'http://s', ['pl-a']);
    expect(results).toEqual({ 'pl-a': { total: 1, written: 1, alreadyPresent: 0, failed: [], playlistFileError: null } });
    expect(syncedPlaylistIds()).toEqual(['pl-a']);
  });

  it('marks nothing when the id list is empty', async () => {
    var dir = fakeDirHandle({});
    await syncCheckedPlaylists(dir, 'http://s', []);
    expect(syncedPlaylistIds()).toEqual([]);
  });

  // BUG-064 — a playlist synced with a failure must not read Synced.
  it('does not mark a playlist synced when any of its tracks failed', async () => {
    fakeFetch({
      'http://s/api/playlist/pl-a': { title: 'A', items: [{ video: TRACK_NO_LYRICS }] }
    });
    var dir = fakeDirHandle({});
    var results = await syncCheckedPlaylists(dir, 'http://s', ['pl-a']);
    expect(results['pl-a'].failed).toHaveLength(1);
    expect(syncedPlaylistIds()).toEqual([]);
  });

  it('still marks the playlists that fully succeeded in a mixed batch', async () => {
    fakeFetch({
      'http://s/api/playlist/pl-a': { title: 'A', items: [{ video: TRACK_NO_LYRICS }] },
      'http://s/api/playlist/pl-b': { title: 'B', items: [{ video: TRACK_WITH_LYRICS }] },
      'http://s/media/ootb-02.m4a': 'A2',
      'http://s/media/ootb-02.lrc': 'L2'
    });
    var dir = fakeDirHandle({});
    await syncCheckedPlaylists(dir, 'http://s', ['pl-a', 'pl-b']);
    expect(syncedPlaylistIds()).toEqual(['pl-b']);
  });
});

// BUG-416 — the false-complete bug: every track can land and the page still
// must not read "all downloaded" unless the .m3u actually landed too.
describe('BUG-416: the .m3u write is part of the completion contract', () => {
  var PLAYLIST = {
    title: 'Road Trip',
    items: [{ video: TRACK_NO_LYRICS }, { video: TRACK_WITH_LYRICS }]
  };

  it('syncPlaylist reports a playlistFileError when the .m3u write fails, even though every track landed', async () => {
    fakeFetch({
      'http://s/media/ootb-03.m4a': 'A1',
      'http://s/media/ootb-02.m4a': 'A2',
      'http://s/media/ootb-02.lrc': 'L2'
    });
    var seeded = seedPlaylistDir('Road Trip', {});
    var realGetFileHandle = seeded.playlistDir.getFileHandle;
    seeded.playlistDir.getFileHandle = async function(name, opts) {
      if (name === 'Road Trip.m3u' && opts && opts.create) throw new Error('disk full');
      return realGetFileHandle(name, opts);
    };
    var summary = await syncPlaylist(seeded.root, 'http://s', PLAYLIST);
    expect(summary.total).toBe(2);
    expect(summary.failed).toEqual([]);
    expect(summary.playlistFileError).toBe('playlist file "Road Trip.m3u" failed to write: disk full');
  });

  it('syncCheckedPlaylists does not mark a playlist synced when its .m3u failed to write', async () => {
    fakeFetch({
      'http://s/api/playlist/pl-a': { title: 'Road Trip', items: [{ video: TRACK_NO_LYRICS }] },
      'http://s/media/ootb-03.m4a': 'A1'
    });
    var seeded = seedPlaylistDir('Road Trip', {});
    var realGetFileHandle = seeded.playlistDir.getFileHandle;
    seeded.playlistDir.getFileHandle = async function(name, opts) {
      if (name === 'Road Trip.m3u' && opts && opts.create) throw new Error('disk full');
      return realGetFileHandle(name, opts);
    };
    var results = await syncCheckedPlaylists(seeded.root, 'http://s', ['pl-a']);
    expect(results['pl-a'].failed).toEqual([]);
    expect(results['pl-a'].playlistFileError).toBeTruthy();
    expect(syncedPlaylistIds()).toEqual([]);
  });

  it('one playlist\'s .m3u write failure does not abort the rest of a multi-playlist batch', async () => {
    fakeFetch({
      'http://s/api/playlist/pl-a': { title: 'A', items: [{ video: TRACK_NO_LYRICS }] },
      'http://s/api/playlist/pl-b': { title: 'B', items: [{ video: TRACK_WITH_LYRICS }] },
      'http://s/media/ootb-03.m4a': 'A1',
      'http://s/media/ootb-02.m4a': 'A2',
      'http://s/media/ootb-02.lrc': 'L2'
    });
    var root = fakeDirHandle({});
    var grewTv = fakeDirHandle({});
    var plA = fakeDirHandle({});
    var plB = fakeDirHandle({});
    grewTv.dirs['A'] = plA;
    grewTv.dirs['B'] = plB;
    root.dirs['grew-tv'] = grewTv;
    var realGetFileHandleA = plA.getFileHandle;
    plA.getFileHandle = async function(name, opts) {
      if (name === 'A.m3u' && opts && opts.create) throw new Error('disk full');
      return realGetFileHandleA(name, opts);
    };
    var results = await syncPlaylists(root, 'http://s', ['pl-a', 'pl-b']);
    expect(results['pl-a'].playlistFileError).toBeTruthy();
    expect(results['pl-b'].playlistFileError).toBeNull();
    expect(new TextDecoder().decode(plB.files['B.m3u']).startsWith('#EXTM3U\n')).toBe(true);
  });

  it('fileExists no longer swallows a non-NotFoundError — it surfaces as a per-track failure instead of a silent (re)write', async () => {
    // The existence check (no `create`) throws a non-NotFoundError; the write
    // call (opts.create) is left to the real fake and would succeed — so a
    // swallow-and-proceed bug would write the file and count the track ok,
    // while the fix must fail the track before ever attempting the write.
    fakeFetch({ 'http://s/media/ootb-03.m4a': 'A1' });
    var seeded = seedPlaylistDir('Road Trip', {});
    var realGetFileHandle = seeded.playlistDir.getFileHandle;
    seeded.playlistDir.getFileHandle = async function(name, opts) {
      if (name === '01 - ELO - Sweet Talkin Woman.m4a' && !(opts && opts.create)) {
        var e = new Error('permission hiccup'); e.name = 'NotAllowedError'; throw e;
      }
      return realGetFileHandle(name, opts);
    };
    var summary = await syncPlaylist(seeded.root, 'http://s', { title: 'Road Trip', items: [{ video: TRACK_NO_LYRICS }] });
    expect(summary.failed).toEqual([{ id: 'ootb-03', title: 'Sweet Talkin Woman', reason: 'permission hiccup' }]);
    expect(summary.written).toBe(0);
    expect(seeded.playlistDir.files['01 - ELO - Sweet Talkin Woman.m4a']).toBeUndefined();
  });
});

// BUG-416 (Musicolet folder-per-playlist) — Musicolet resolves an .m3u's
// tracks by matching pathnames against its own scanned library rather than
// reading a bare filename relative to the playlist file, so it never
// reliably recognized the old shared-flat-folder .m3u. Every playlist now
// gets its own real subfolder a folder-browsing player plays as a set,
// independent of any .m3u parsing.
describe('BUG-416: each playlist syncs into its own grew-tv/<title> subfolder', () => {
  it('writes tracks, .lrc and .m3u under grew-tv/<playlist title>/, not the picked root', async () => {
    fakeFetch({
      'http://s/media/ootb-03.m4a': 'A1',
      'http://s/media/ootb-02.m4a': 'A2',
      'http://s/media/ootb-02.lrc': 'L2'
    });
    var dir = fakeDirHandle({});
    var PLAYLIST = { title: 'Road Trip', items: [{ video: TRACK_NO_LYRICS }, { video: TRACK_WITH_LYRICS }] };
    await syncPlaylist(dir, 'http://s', PLAYLIST);
    expect(dir.files).toEqual({});
    expect(Object.keys(plFiles(dir, 'Road Trip')).sort()).toEqual([
      '01 - ELO - Sweet Talkin Woman.m4a',
      '02 - ELO - Mr. Blue Sky.lrc',
      '02 - ELO - Mr. Blue Sky.m4a',
      'Road Trip.m3u'
    ]);
  });

  it('reports a playlistFileError, with no track attempted, when the playlist folder itself fails to create', async () => {
    fakeFetch({
      'http://s/media/ootb-03.m4a': 'A1',
      'http://s/media/ootb-02.m4a': 'A2',
      'http://s/media/ootb-02.lrc': 'L2'
    });
    var PLAYLIST = { title: 'Road Trip', items: [{ video: TRACK_NO_LYRICS }, { video: TRACK_WITH_LYRICS }] };
    var dir = fakeDirHandle({});
    dir.getDirectoryHandle = async function() { throw new Error('quota exceeded'); };
    var summary = await syncPlaylist(dir, 'http://s', PLAYLIST);
    expect(summary).toEqual({
      total: 2, written: 0, alreadyPresent: 0, failed: [],
      playlistFileError: 'playlist folder "Road Trip" failed to create: quota exceeded'
    });
  });
});
