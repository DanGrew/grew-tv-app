import { rowActions, popoverTop } from '../../core/playlist-row-menu.js';

describe('rowActions', () => {
  it('a middle row offers all four actions in order: add, up, down, x', () => {
    expect(rowActions(1, 3)).toEqual(['add', 'up', 'down', 'x']);
  });

  it('the first row drops ↑ (nothing to move up past): add, down, x', () => {
    expect(rowActions(0, 3)).toEqual(['add', 'down', 'x']);
  });

  it('the last row drops ↓ (nothing to move down past): add, up, x', () => {
    expect(rowActions(2, 3)).toEqual(['add', 'up', 'x']);
  });

  it('a lone row (total 1) drops both ↑ and ↓: add, x', () => {
    expect(rowActions(0, 1)).toEqual(['add', 'x']);
  });

  it('a two-row list gates each end: first has down, last has up', () => {
    expect(rowActions(0, 2)).toEqual(['add', 'down', 'x']);
    expect(rowActions(1, 2)).toEqual(['add', 'up', 'x']);
  });

  it('always leads with add and ends with x', () => {
    var a = rowActions(5, 10);
    expect(a[0]).toBe('add');
    expect(a[a.length - 1]).toBe('x');
  });
});

describe('popoverTop', () => {
  // Plenty of room below: open at bottom + GAP(6).
  it('opens just below the trigger when it fits (bottom + 6)', () => {
    expect(popoverTop({ top: 100, bottom: 140 }, 800, 200)).toBe(146);
  });

  // Exactly fits below (below + popHeight === viewportH) — the `<=` boundary
  // keeps it below rather than flipping.
  it('stays below at the exact-fit boundary (uses <=, not <)', () => {
    // below = 140 + 6 = 146; 146 + 200 = 346 === viewportH
    expect(popoverTop({ top: 100, bottom: 140 }, 346, 200)).toBe(146);
  });

  // One px past the boundary flips above: top - GAP - popHeight.
  it('flips above when it would overflow the bottom by 1px', () => {
    // below+pop = 346 > 345 => flip => top(100) - 6 - 200 = -106 => clamp to 6
    expect(popoverTop({ top: 100, bottom: 140 }, 345, 200)).toBe(6);
  });

  // Flip-above with real room above: exact top - GAP - popHeight, not clamped.
  it('when flipping above with room, returns top - 6 - popHeight', () => {
    // near the bottom of a tall viewport; room above
    expect(popoverTop({ top: 500, bottom: 540 }, 560, 100)).toBe(394);
  });

  // Flip-above clamps at GAP so it never runs off the top edge.
  it('clamps the flipped position to GAP (6) at the top edge', () => {
    expect(popoverTop({ top: 4, bottom: 40 }, 50, 200)).toBe(6);
  });
});
