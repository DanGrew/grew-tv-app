// TASK-403 — remembers the chosen download folder across visits (story 2:
// pick once, never re-prompt). A FileSystemDirectoryHandle is structured-
// cloneable but not string-serializable, so localStorage (BUG-034's
// volume-store pattern) can't hold it — IndexedDB is the only persistent
// browser store that round-trips a handle object as-is.

var DB_NAME = 'grew-tv-downloads';
var STORE = 'kv';
var KEY = 'folderHandle';

function openDb() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function() { req.result.createObjectStore(STORE); };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

// The remembered handle, or null if none was ever chosen.
export function getStoredHandle() {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { reject(req.error); };
    });
  });
}

export function setStoredHandle(handle) {
  return openDb().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { reject(tx.error); };
    });
  });
}

// A handle restored from a past visit (or freshly chosen without an
// upfront `{mode:'readwrite'}` picker option) may need its write permission
// re-confirmed — Chrome does not always carry 'granted' across a browser
// restart. queryPermission never prompts; requestPermission does, so this
// is meant to run from a user-gesture handler (the Sync tap), not on load.
export async function ensureReadWritePermission(handle) {
  var opts = { mode: 'readwrite' };
  var status = await handle.queryPermission(opts);
  if (status === 'granted') return true;
  var requested = await handle.requestPermission(opts);
  return requested === 'granted';
}

// BUG-437 — the Downloads page's own on-load disk-status re-check
// (core/downloads-disk-status.js) needs to know it may read the folder
// without ever prompting: queryPermission never shows a picker (only
// requestPermission does), so this is safe to call on page load with no
// user gesture, unlike ensureReadWritePermission's requestPermission
// fallback above, which is reserved for the Sync tap.
export async function hasReadPermission(handle) {
  var status = await handle.queryPermission({ mode: 'read' });
  return status === 'granted';
}
