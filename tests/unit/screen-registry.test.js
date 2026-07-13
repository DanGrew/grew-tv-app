import { vi } from 'vitest';
import { registerScreen, activateScreen, getActiveConfig, dispatchKey, initPage } from '../../core/screen-registry.js';

describe('registerScreen', () => {
  it('throws if onEnter missing', () => {
    // The full message pins the 'registerScreen: <id> missing ' prefix, not just the tail.
    expect(() => registerScreen('reg-1', { keys: {} })).toThrow('registerScreen: reg-1 missing onEnter');
  });
  it('throws if keys missing', () => {
    expect(() => registerScreen('reg-2', { onEnter: function() {} })).toThrow('registerScreen: reg-2 missing keys');
  });
});

describe('activateScreen', () => {
  it('calls onEnter on activate', () => {
    var called = false;
    registerScreen('act-1', { onEnter: function() { called = true; }, keys: {}, remote: {} });
    activateScreen('act-1');
    expect(called).toBe(true);
  });
  it('calls onEnter each time activated', () => {
    var count = 0;
    registerScreen('act-2', { onEnter: function() { count++; }, keys: {}, remote: {} });
    activateScreen('act-2');
    activateScreen('act-2');
    expect(count).toBe(2);
  });
});

describe('getActiveConfig', () => {
  it('returns config for active screen', () => {
    var cfg = { onEnter: function() {}, keys: {}, remote: {} };
    registerScreen('cfg-1', cfg);
    activateScreen('cfg-1');
    expect(getActiveConfig()).toBe(cfg);
  });
  it('updates when screen changes', () => {
    var cfg1 = { onEnter: function() {}, keys: {}, remote: {} };
    var cfg2 = { onEnter: function() {}, keys: {}, remote: {} };
    registerScreen('cfg-2', cfg1);
    registerScreen('cfg-3', cfg2);
    activateScreen('cfg-2');
    activateScreen('cfg-3');
    expect(getActiveConfig()).toBe(cfg2);
  });
});

describe('dispatchKey', () => {
  it('invokes handler for active screen key', () => {
    var called = false;
    registerScreen('dk-1', { onEnter: function() {}, keys: { Enter: function() { called = true; } }, remote: {} });
    activateScreen('dk-1');
    dispatchKey({ key: 'Enter' });
    expect(called).toBe(true);
  });
  it('passes event object to handler', () => {
    var received = null;
    var evt = { key: 'ArrowLeft' };
    registerScreen('dk-2', { onEnter: function() {}, keys: { ArrowLeft: function(e) { received = e; } }, remote: {} });
    activateScreen('dk-2');
    dispatchKey(evt);
    expect(received).toBe(evt);
  });
  it('ignores unmapped key without throwing', () => {
    registerScreen('dk-3', { onEnter: function() {}, keys: {} });
    activateScreen('dk-3');
    expect(function() { dispatchKey({ key: 'Escape' }); }).not.toThrow();
  });
  it('does not call handler from previously active screen', () => {
    var old = false;
    registerScreen('dk-4', { onEnter: function() {}, keys: { Enter: function() { old = true; } }, remote: {} });
    registerScreen('dk-5', { onEnter: function() {}, keys: {} });
    activateScreen('dk-4');
    activateScreen('dk-5');
    dispatchKey({ key: 'Enter' });
    expect(old).toBe(false);
  });
  it('does not throw before any screen is active (the filter(Boolean) guard)', async () => {
    // Fresh module state: activeScreen is null, so screenRegistry[null] is
    // undefined. Without the .filter(Boolean) guard this would deref undefined.
    vi.resetModules();
    const fresh = await import('../../core/screen-registry.js');
    expect(function() { fresh.dispatchKey({ key: 'Enter' }); }).not.toThrow();
  });
});

describe('initPage', () => {
  it('calls onEnter on init', () => {
    var called = false;
    initPage({ onEnter: function() { called = true; }, keys: {} });
    expect(called).toBe(true);
  });
  it('throws its OWN initPage-prefixed error if onEnter missing (before delegating to registerScreen)', () => {
    expect(function() { initPage({ keys: {} }); }).toThrow('initPage: missing onEnter');
  });
  it('throws its OWN initPage-prefixed error if keys missing', () => {
    expect(function() { initPage({ onEnter: function() {} }); }).toThrow('initPage: missing keys');
  });
  it('dispatches keys after initPage', () => {
    var called = false;
    initPage({ onEnter: function() {}, keys: { Enter: function() { called = true; } } });
    dispatchKey({ key: 'Enter' });
    expect(called).toBe(true);
  });
  it('makes remote accessible via getActiveConfig', () => {
    var remote = { back: function() {} };
    initPage({ onEnter: function() {}, keys: {}, remote: remote });
    expect(getActiveConfig().remote).toBe(remote);
  });
});
