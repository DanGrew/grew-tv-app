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
  window.__dlFiles = {};
  function fileHandle(fname) {
    return {
      createWritable: function() {
        return Promise.resolve({
          write: function(d) { window.__dlFiles[fname] = d; return Promise.resolve(); },
          close: function() { return Promise.resolve(); }
        });
      }
    };
  }
  function makeHandle(name) {
    return {
      name: name,
      getFileHandle: function(fname, opts) {
        return new Promise(function(resolve, reject) {
          if (Object.prototype.hasOwnProperty.call(window.__dlFiles, fname)) { resolve(fileHandle(fname)); return; }
          if (opts && opts.create) { window.__dlFiles[fname] = undefined; resolve(fileHandle(fname)); return; }
          var e = new Error('not found'); e.name = 'NotFoundError'; reject(e);
        });
      },
      queryPermission: function() { return Promise.resolve('granted'); },
      requestPermission: function() { return Promise.resolve('granted'); }
    };
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

  test('choosing a folder lists every playlist, each Not synced', async ({ page }) => {
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await expect(page.locator('#playlist-panel')).toBeVisible();
    await expect(page.locator('#folder-chip')).toHaveText('GrewTV Music');
    await expect(page.locator('.pl-row')).toHaveCount(2);
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('Not synced');
    await expect(page.locator('.pl-row', { hasText: 'Empty Mix' }).locator('.pl-status')).toHaveText('Not synced');
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
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('Synced');
    const files = await page.evaluate(() => Object.keys(window.__dlFiles));
    expect(files).toContain('ELO - Sweet Talkin Woman.m4a');
    expect(files).toContain('ELO - Turn to Stone.m4a');
    expect(files).toContain('Road Trip.m3u');
  });

  test('an unchecked playlist stays Not synced after syncing a different one', async ({ page }) => {
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-check').check();
    await page.locator('#btn-sync').click();
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('Synced');
    await expect(page.locator('.pl-row', { hasText: 'Empty Mix' }).locator('.pl-status')).toHaveText('Not synced');
  });

  test('the Sync button is disabled until a playlist is checked', async ({ page }) => {
    await page.goto('/companion/downloads.html?profile=kids');
    await page.locator('#btn-choose-folder').click();
    await expect(page.locator('#btn-sync')).toBeDisabled();
    await page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-check').check();
    await expect(page.locator('#btn-sync')).toBeEnabled();
    await expect(page.locator('#btn-sync')).toHaveText('Sync selected (1)');
  });

  test('a track already in the folder from an earlier sync is not re-fetched when a second playlist shares it', async ({ page }) => {
    // Two playlists sharing one track (ootb-03) — Road Trip already carries it,
    // so syncing Empty Mix's stand-in here (rewired to share the track) proves
    // dedup-by-filename-presence across playlists (task spec story 5).
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
    await expect(page.locator('.pl-row', { hasText: 'Road Trip' }).locator('.pl-status')).toHaveText('Synced');
    expect(audioFetchCount).toBe(1);

    await page.locator('.pl-row', { hasText: 'Empty Mix' }).locator('.pl-check').check();
    await page.locator('#btn-sync').click();
    await expect(page.locator('.pl-row', { hasText: 'Empty Mix' }).locator('.pl-status')).toHaveText('Synced');
    expect(audioFetchCount).toBe(1);
    const files = await page.evaluate(() => Object.keys(window.__dlFiles));
    expect(files).toContain('Empty Mix.m3u');
    expect(files.filter(f => f === 'ELO - Sweet Talkin Woman.m4a')).toHaveLength(1);
  });
});
