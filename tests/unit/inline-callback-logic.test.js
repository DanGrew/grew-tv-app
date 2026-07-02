import { findInlineCallbackLogic } from '../../scripts/inline-callback-logic.js';

describe('findInlineCallbackLogic', () => {
  it('flags a block-body transform callback with pure logic', () => {
    const hits = findInlineCallbackLogic('const out = xs.map(function(x) { return x * 2; });');
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(1);
  });

  it('flags a block-body arrow callback with pure logic', () => {
    const hits = findInlineCallbackLogic('const out = xs.filter((x) => { return x > 3; });');
    expect(hits).toHaveLength(1);
  });

  it('flags a single-param arrow (no parens) block body with logic', () => {
    const hits = findInlineCallbackLogic('const out = xs.sort((a, b) => { return a - b; });');
    expect(hits).toHaveLength(1);
  });

  it('passes a callback that touches the DOM', () => {
    const hits = findInlineCallbackLogic('xs.filter(function(el) { el.classList.add("x"); return el.offsetWidth > 0; });');
    expect(hits).toHaveLength(0);
  });

  it('passes an expression-body arrow (no block)', () => {
    const hits = findInlineCallbackLogic('const out = xs.map(x => x * 2);');
    expect(hits).toHaveLength(0);
  });

  it('passes a block-body callback with no real logic', () => {
    const hits = findInlineCallbackLogic('const out = xs.map(function(x) { return x; });');
    expect(hits).toHaveLength(0);
  });

  it('passes a named function outside any transform call (out of scope)', () => {
    const hits = findInlineCallbackLogic('function foo(x) { return x * 2; }');
    expect(hits).toHaveLength(0);
  });

  it('passes .filter(Boolean) — not a block-body callback', () => {
    const hits = findInlineCallbackLogic('[INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });');
    expect(hits).toHaveLength(0);
  });

  it('reports the correct line for a multi-line block', () => {
    const src = 'const a = 1;\nconst out = xs.reduce(function(acc, x) {\n  return acc + x;\n}, 0);';
    const hits = findInlineCallbackLogic(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(2);
  });
});
