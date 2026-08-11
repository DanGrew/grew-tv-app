import { vi } from 'vitest';
import { getStoredHandle, setStoredHandle, ensureReadWritePermission } from '../../core/downloads-handle-store.js';

// A minimal fake of the IndexedDB contract this module actually calls
// (open -> onupgradeneeded/onsuccess/onerror, one object store's get/put,
// transaction oncomplete/onerror) — the real API isn't available in Node,
// and `opts` lets a test force each error path deterministically, which a
// faithful async polyfill makes hard to trigger on demand. `calls` records
// every open/transaction/get/put invocation so a test can assert the exact
// db/store/key names this module is expected to use, not just round-trip
// behaviour a wrong-but-consistent name would still pass.
function fakeIndexedDB(opts) {
  opts = opts || {};
  var stores = {};
  var calls = { open: [], transaction: [], get: [], put: [] };
  function makeRequest() { return { onsuccess: null, onerror: null, result: undefined, error: undefined }; }
  var factory = {
    open: function(name, version) {
      calls.open.push({ name: name, version: version });
      var r = makeRequest();
      queueMicrotask(function() {
        if (opts.openFails) {
          r.error = new Error('open failed');
          [r.onerror].filter(Boolean).forEach(function(fn) { fn(); });
          return;
        }
        var db = {
          createObjectStore: function(storeName) { stores[storeName] = stores[storeName] || new Map(); },
          transaction: function(storeName, mode) {
            calls.transaction.push({ storeName: storeName, mode: mode });
            if (mode !== 'readonly' && mode !== 'readwrite') throw new TypeError('invalid transaction mode: ' + mode);
            var store = stores[storeName];
            var tx = { onerror: null, oncomplete: null, error: undefined };
            tx.objectStore = function(osName) {
              return {
                get: function(key) {
                  calls.get.push({ storeName: osName, key: key });
                  var gr = makeRequest();
                  queueMicrotask(function() {
                    if (opts.getFails) {
                      gr.error = new Error('get failed');
                      [gr.onerror].filter(Boolean).forEach(function(fn) { fn(); });
                      return;
                    }
                    gr.result = store.get(key);
                    [gr.onsuccess].filter(Boolean).forEach(function(fn) { fn(); });
                  });
                  return gr;
                },
                put: function(value, key) {
                  calls.put.push({ storeName: osName, key: key, value: value });
                  queueMicrotask(function() {
                    if (opts.putFails) {
                      tx.error = new Error('put failed');
                      [tx.onerror].filter(Boolean).forEach(function(fn) { fn(); });
                      return;
                    }
                    store.set(key, value);
                    [tx.oncomplete].filter(Boolean).forEach(function(fn) { fn(); });
                  });
                }
              };
            };
            return tx;
          }
        };
        r.result = db;
        [r.onupgradeneeded].filter(Boolean).forEach(function(fn) { fn(); });
        [r.onsuccess].filter(Boolean).forEach(function(fn) { fn(); });
      });
      return r;
    }
  };
  return { factory: factory, calls: calls };
}

var fake;
function stub(opts) {
  fake = fakeIndexedDB(opts);
  vi.stubGlobal('indexedDB', fake.factory);
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('getStoredHandle', () => {
  it('opens the grew-tv-downloads db (version 1) and reads the kv store\'s folderHandle key', async () => {
    stub();
    await getStoredHandle();
    expect(fake.calls.open).toEqual([{ name: 'grew-tv-downloads', version: 1 }]);
    expect(fake.calls.transaction[0]).toEqual({ storeName: 'kv', mode: 'readonly' });
    expect(fake.calls.get).toEqual([{ storeName: 'kv', key: 'folderHandle' }]);
  });
  it('is null when nothing was ever chosen', async () => {
    stub();
    expect(await getStoredHandle()).toBeNull();
  });
  it('round-trips a handle set by setStoredHandle', async () => {
    stub();
    var handle = { name: 'GrewTV Music' };
    await setStoredHandle(handle);
    expect(await getStoredHandle()).toEqual(handle);
  });
  it('a later set overwrites the earlier one, not appends', async () => {
    stub();
    await setStoredHandle({ name: 'First' });
    await setStoredHandle({ name: 'Second' });
    expect(await getStoredHandle()).toEqual({ name: 'Second' });
  });
  it('rejects when the database fails to open', async () => {
    stub({ openFails: true });
    await expect(getStoredHandle()).rejects.toThrow('open failed');
  });
  it('rejects when the read fails', async () => {
    stub({ getFails: true });
    await expect(getStoredHandle()).rejects.toThrow('get failed');
  });
});

describe('setStoredHandle', () => {
  it('opens the grew-tv-downloads db (version 1) and writes the kv store\'s folderHandle key', async () => {
    stub();
    var handle = { name: 'GrewTV Music' };
    await setStoredHandle(handle);
    expect(fake.calls.open).toEqual([{ name: 'grew-tv-downloads', version: 1 }]);
    expect(fake.calls.transaction[0]).toEqual({ storeName: 'kv', mode: 'readwrite' });
    expect(fake.calls.put).toEqual([{ storeName: 'kv', key: 'folderHandle', value: handle }]);
  });
  it('rejects when the database fails to open', async () => {
    stub({ openFails: true });
    await expect(setStoredHandle({ name: 'X' })).rejects.toThrow('open failed');
  });
  it('rejects when the write fails', async () => {
    stub({ putFails: true });
    await expect(setStoredHandle({ name: 'X' })).rejects.toThrow('put failed');
  });
});

function fakeHandle(queryResult, requestResult) {
  var calls = { query: [], request: [] };
  return {
    calls: calls,
    queryPermission: async function(opts) { calls.query.push(opts); return queryResult; },
    requestPermission: async function(opts) { calls.request.push(opts); return requestResult; }
  };
}

describe('ensureReadWritePermission', () => {
  it('is true, with no request, when already granted', async () => {
    var handle = fakeHandle('granted');
    expect(await ensureReadWritePermission(handle)).toBe(true);
    expect(handle.calls.query).toEqual([{ mode: 'readwrite' }]);
    expect(handle.calls.request).toEqual([]);
  });
  it('requests, and is true, when not yet granted but the request succeeds', async () => {
    var handle = fakeHandle('prompt', 'granted');
    expect(await ensureReadWritePermission(handle)).toBe(true);
    expect(handle.calls.request).toEqual([{ mode: 'readwrite' }]);
  });
  it('is false when the request is denied', async () => {
    var handle = fakeHandle('prompt', 'denied');
    expect(await ensureReadWritePermission(handle)).toBe(false);
  });
});
