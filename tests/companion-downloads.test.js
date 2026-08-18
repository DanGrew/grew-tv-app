const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, PLAYLIST_CARDS } = require('./fixtures/api.js');

// TASK-403 — the Downloads page. Neither the File System Access directory
// picker nor a non-native handle survives IndexedDB's real structured-clone
// algorithm in a headless browser, so this suite replaces both
// `window.showDirectoryPicker` and `window.indexedDB` with an in-page fake
// (installed via addInitScript, before any app script runs) — real
// FileSystemDirectoryHandle instances clone natively; a plain fake object
// with methods cannot. The fake's chosen-folder NAME is bridged through
// localStorage (which genuinely persists across a reload) so the "no repeat
// prompt on a later visit" story is provable across a real page reload, even
// though the in-memory file/handle state itself resets each script load.
function installFakeDownloadsEnv() {
  // BUG-416 — window.__dlFiles is keyed by the full relative path (e.g.
  // "grew-tv/Road Trip/01 - Artist - Title.m4a") so a real getDirectoryHandle
  // nesting shows up as distinct entries per playlist subfolder, the same as
  // the on-device folder-per-playlist layout this fake stands in for.
  window.__dlFiles = {};
  function fileHandle(path) {
    return {
      createWritable: function() {
        return Promise.resolve({
          write: function(d) { window.__dlFiles[path] = d; return Promise.resolve(); },
          close: function() { return Promise.resolve(); }
        });
      }
    };
  }
  function makeDirHandle(path) {
    return {
      getFileHandle: function(fname, opts) {
        var key = path + fname;
        return new Promise(function(resolve, reject) {
          if (Object.prototype.hasOwnProperty.call(window.__dlFiles, key)) { resolve(fileHandle(key)); return; }
          if (opts && opts.create) { window.__dlFiles[key] = undefined; resolve(fileHandle(key)); return; }
          var e = new Error('not found'); e.name = 'NotFoundError'; reject(e);
        });
      },
      getDirectoryHandle: function(dname) {
        return Promise.resolve(makeDirHandle(path + dname + '/'));
      },
      // BUG-437 — the disk-status re-check walks a playlist dir's direct
      // children (core/downloads-disk-status.js's audioFileCount), matching
      // the real FileSystemDirectoryHandle.values() async-iterator shape:
      // one { kind: 'file', name } entry per direct child key under `path`.
      values: function() {
        var entries = Object.keys(window.__dlFiles).filter(function(key) {
          return key.indexOf(path) === 0 && key.slice(path.length).indexOf('/') === -1;
        }).map(function(key) { return { kind: 'file', name: key.slice(path.length) }; });
        var i = 0;
        return {
          next: function() {
            var done = i >= entries.length;
            return Promise.resolve(done ? { value: undefined, done: true } : { value: entries[i++], done: false });
          },
          [Symbol.asyncIterator]: function() { return this; }
        };
      }
    };
  }
  function makeHandle(name) {
    var h = makeDirHandle('');
    h.name = name;
    h.queryPermission = function() { return Promise.resolve('granted'); };
    h.requestPermission = function() { return Promise.resolve('granted'); };
    return h;
  }
  window.showDirectoryPicker = function() { return Promise.resolve(makeHandle('GrewTV Music')); };

  var idbStores = {};
  var NAME_KEY = '__dl_test_handle_name';
  function makeRequest() { return { onsuccess: null, onerror: null, result: undefined }; }
  var fakeIndexedDB = {
    open: function() {
      var r = makeRequest();
      setTimeout(function() {
        var db = {
          createObjectStore: function(name) {
            idbStores[name] = idbStores[name] || {};
            var persistedName = localStorage.getItem(NAME_KEY);
            if (persistedName) idbStores[name].folderHandle = makeHandle(persistedName);
          },
          transaction: function(name) {
            var store = idbStores[name];
            var tx = { oncomplete: null, onerror: null };
            tx.objectStore = function() {
              return {
                get: function(key) {
                  var gr = makeRequest();
                  setTimeout(function() {
                    gr.result = store[key];
                    [gr.onsuccess].filter(Boolean).forEach(function(fn) { fn(); });
                  }, 0);
                  return gr;
                },
                put: function(value, key) {
                  setTimeout(function() {
                    store[key] = value;
                    localStorage.setItem(NAME_KEY, value.name);
                    [tx.oncomplete].filter(Boolean).forEach(function(fn) { fn(); });
                  }, 0);
                }
              };
            };
            return tx;
          }
        };
        r.result = db;
        [r.onupgradeneeded].filter(Boolean).forEach(function(fn) { fn(); });
        [r.onsuccess].filter(Boolean).forEach(function(fn) { fn(); });
      }, 0);
      return r;
    }
  };
  // window.indexedDB is a non-writable accessor on the real global — a plain
  // assignment silently no-ops (leaving the native IndexedDB in place, which
  // then throws DataCloneError on this fake handle's function properties).
  // defineProperty forces the override.
  Object.defineProperty(window, 'indexedDB', { value: fakeIndexedDB, configurable: true, writable: true });
}

async function routeBrowseWithPlaylists(page) {
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(PLAYLIST_CARDS) })
  }));
}

test('BUG-065: Back returns to the page the Download button was reached from', async ({ page }) => {
  await installApi(page);
  await routeBrowseWithPlaylists(page);
  const from = 'http://example.test/companion/playlist.html?id=pl-roadtrip';
  await page.goto('/companion/downloads.html?profile=kids&back=' + encodeURIComponent(from));
  await page.route(from, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }));
  await page.locator('#btn-back').click();
  await expect(page).toHaveURL(from);
});

test('BUG-065: Back falls back to the playlist library when reached without a back param', async ({ page }) => {
  await installApi(page);
  await routeBrowseWithPlaylists(page);
  await page.goto('/companion/downloads.html?profile=kids');
  await page.locator('#btn-back').click();
  await expect(page).toHaveURL(/companion\/browse\.html\?profile=kids/);
});

test('TASK-403: shows the unsupported message when the browser lacks the folder picker API', async ({ page }) => {
  // Real Chromium implements showDirectoryPicker — delete it to stand in for
  // a browser that doesn't (e.g. iOS Safari), per story 7's feature-detect.
  await page.addInitScript(() => { delete window.showDirectoryPicker; });
  await installApi(page);
  await routeBrowseWithPlaylists(page);
  await page.goto('/companion/downloads.html?profile=kids');
  await expect(page.locator('#unsupported')).toBeVisible();
  await expect(page.locator('#folder-picker')).toBeHidden();
  await expect(page.locator('#playlist-panel')).toBeHidden();
});

test.describe('with the File System Access API', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installFakeDownloadsEnv);
    await installApi(page);
    await routeBrowseWithPlaylists(page);
  });

  test('first run: no folder chosen yet shows the picker prompt', async ({ page }) => {
    await page.goto('/companion/downloads.html?profile=kids');
    await expect(page.locator('#folder-picker')).toBeVisible();
    await expect(page.locator('#playlist-panel')).toBeHidden();
  });

  test('choosing a folder lists every playlist, each with its track count and Not synced', async ({ page }) => {
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await expect(page.locator('#playlist-panel')).toBeVisible();
    await expect(page.locator('#folder-chip')).toHaveText('GrewTV Music');
    await expect(page.locator('.pl-row')).toHaveCount(2);
    // BUG-066 — the track count shows before any sync starts (fixture: Road
    // Trip clipCount 2, Empty Mix clipCount 0).
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('2 tracks — Not synced');
    await expect(page.locator('.pl-row', { hasText: 'Empty Mix' }).locator('.pl-status')).toHaveText('0 tracks — Not synced');
  });

  test('a folder chosen on an earlier visit is remembered — no repeat prompt on reload', async ({ page }) => {
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await expect(page.locator('#playlist-panel')).toBeVisible();
    await page.reload();
    await expect(page.locator('#playlist-panel')).toBeVisible();
    await expect(page.locator('#folder-picker')).toBeHidden();
    await expect(page.locator('#folder-chip')).toHaveText('GrewTV Music');
  });

  test('Sync writes the checked playlist\'s tracks + lyrics + m3u, and flips its status to Synced', async ({ page }) => {
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-check').check();
    await page.locator('#btn-sync').click();
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('2 tracks — Synced');
    // BUG-437 story 3 — the summary line also updates once a live sync completes.
    await expect(page.locator('#sync-summary')).toHaveText('1 of 2 synced');
    const files = await page.evaluate(() => Object.keys(window.__dlFiles));
    expect(files).toContain('grew-tv/Road Trip/01 - ELO - Sweet Talkin Woman.m4a');
    expect(files).toContain('grew-tv/Road Trip/02 - ELO - Turn to Stone.m4a');
    expect(files).toContain('grew-tv/Road Trip/Road Trip.m3u');
  });

  test('an unchecked playlist stays Not synced after syncing a different one', async ({ page }) => {
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-check').check();
    await page.locator('#btn-sync').click();
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('2 tracks — Synced');
    await expect(page.locator('.pl-row', { hasText: 'Empty Mix' }).locator('.pl-status')).toHaveText('0 tracks — Not synced');
  });

  test('the Sync button is disabled until a playlist is checked', async ({ page }) => {
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await expect(page.locator('#btn-sync')).toBeDisabled();
    await page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-check').check();
    await expect(page.locator('#btn-sync')).toBeEnabled();
    await expect(page.locator('#btn-sync')).toHaveText('Sync selected (1)');
  });

  // BUG-437 — a folder that already has every track + its .m3u (from an
  // earlier sync run, a different browser/profile sharing the same picked
  // folder, or a manual copy) reads Synced as soon as it loads, without
  // ever tapping Sync in this browser (stories 1 & 2 — the check runs the
  // same way whichever path handed the page the folder handle).
  test('BUG-437: a folder that already has every track + its .m3u reads Synced without syncing in this browser', async ({ page }) => {
    await page.addInitScript(() => {
      window.__dlFiles = {
        'grew-tv/Road Trip/01 - Already There.m4a': new Uint8Array(),
        'grew-tv/Road Trip/02 - Also There.m4a': new Uint8Array(),
        'grew-tv/Road Trip/Road Trip.m3u': new Uint8Array()
      };
    });
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('2 tracks — Synced');
  });

  // BUG-437 story 3 — a page-level "N of M synced" line, updating as each
  // playlist's own disk check resolves (Road Trip's folder is pre-seeded
  // complete; Empty Mix has no folder at all, so it stays Not synced).
  test('BUG-437: the summary line counts how many playlists are Synced', async ({ page }) => {
    await page.addInitScript(() => {
      window.__dlFiles = {
        'grew-tv/Road Trip/01 - Already There.m4a': new Uint8Array(),
        'grew-tv/Road Trip/02 - Also There.m4a': new Uint8Array(),
        'grew-tv/Road Trip/Road Trip.m3u': new Uint8Array()
      };
    });
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await expect(page.locator('#sync-summary')).toHaveText('1 of 2 synced');
  });

  // BUG-416 (Musicolet folder-per-playlist) — each playlist now lives in its
  // own grew-tv/<title> subfolder so a folder-browsing player can play it as
  // a standalone set, so a track shared by two playlists downloads into each
  // one independently rather than the old shared-flat-folder cross-playlist
  // dedup (TASK-403 story 5, superseded here — no symlinks are possible
  // through the File System Access API).
  test('a track shared by two playlists downloads its own copy into each playlist\'s own folder', async ({ page }) => {
    await page.route('**/api/playlist/pl-empty', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 'pl-empty', title: 'Empty Mix', items: [{ season: null, episode: null, video: { id: 'ootb-03', title: 'Sweet Talkin Woman', profile: 'kids', duration: 228, poster: 'ootb.jpg', mediaType: 'audio', ext: 'm4a', artist: 'ELO', available: true } }] })
    }));
    let audioFetchCount = 0;
    await page.route('**/media/ootb-03.m4a', route => {
      audioFetchCount++;
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
    });
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-check').check();
    await page.locator('#btn-sync').click();
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('2 tracks — Synced');
    expect(audioFetchCount).toBe(1);

    await page.locator('.pl-row', { hasText: 'Empty Mix' }).locator('.pl-check').check();
    await page.locator('#btn-sync').click();
    await expect(page.locator('.pl-row', { hasText: 'Empty Mix' }).locator('.pl-status')).toHaveText('0 tracks — Synced');
    expect(audioFetchCount).toBe(2);
    const files = await page.evaluate(() => Object.keys(window.__dlFiles));
    expect(files).toContain('grew-tv/Empty Mix/Empty Mix.m3u');
    expect(files).toContain('grew-tv/Road Trip/01 - ELO - Sweet Talkin Woman.m4a');
    expect(files).toContain('grew-tv/Empty Mix/01 - ELO - Sweet Talkin Woman.m4a');
  });

  // BUG-064 — one bad track no longer kills the whole sync.
  test('BUG-064: a failed track does not abort the rest of the sync, and the status line names it', async ({ page }) => {
    await page.route('**/media/ootb-01.m4a', route => route.fulfill({ status: 404 }));
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-check').check();
    await page.locator('#btn-sync').click();
    await expect(page.locator('#dl-status')).toHaveText('1 track failed — Turn to Stone (HTTP 404)');
    const files = await page.evaluate(() => Object.keys(window.__dlFiles));
    expect(files).toContain('grew-tv/Road Trip/01 - ELO - Sweet Talkin Woman.m4a');
    expect(files).not.toContain('grew-tv/Road Trip/02 - ELO - Turn to Stone.m4a');
    expect(files).toContain('grew-tv/Road Trip/Road Trip.m3u');
    const m3u = await page.evaluate(() => new TextDecoder().decode(window.__dlFiles['grew-tv/Road Trip/Road Trip.m3u']));
    expect(m3u).not.toContain('Turn to Stone');
  });

  test('BUG-064: a playlist synced with a failed track is not marked Synced', async ({ page }) => {
    await page.route('**/media/ootb-01.m4a', route => route.fulfill({ status: 404 }));
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-check').check();
    await page.locator('#btn-sync').click();
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('2 tracks — Not synced');
  });

  // BUG-416 story 4 — the .m3u must land as BOM-free bytes so a real player's
  // #EXTM3U magic-string check recognizes it.
  test('BUG-416: the written .m3u is BOM-free bytes with #EXTM3U as the literal first line', async ({ page }) => {
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-check').check();
    await page.locator('#btn-sync').click();
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('2 tracks — Synced');
    const firstBytes = await page.evaluate(() => Array.from(window.__dlFiles['grew-tv/Road Trip/Road Trip.m3u'].slice(0, 3)));
    expect(firstBytes).not.toEqual([0xef, 0xbb, 0xbf]);
    const text = await page.evaluate(() => new TextDecoder().decode(window.__dlFiles['grew-tv/Road Trip/Road Trip.m3u']));
    expect(text.startsWith('#EXTM3U\n')).toBe(true);
  });
});
