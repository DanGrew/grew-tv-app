import { groupRows, gridNav } from '../../core/profile-rows.js';

var ROSTER = [
  { id: 'mom', profile: 'adults' },
  { id: 'dad', profile: 'adults' },
  { id: 'oliver', profile: 'kids' },
  { id: 'millie', profile: 'kids' },
  { id: 'guest', profile: 'kids' }
];

describe('groupRows', () => {
  it('splits into a kids row (first) and an adults row (second)', () => {
    var rows = groupRows(ROSTER);
    expect(rows.map(r => r.map(p => p.id))).toEqual([
      ['oliver', 'millie', 'guest'],
      ['mom', 'dad']
    ]);
  });

  it('treats any non-adults class (incl. missing) as kids', () => {
    expect(groupRows([{ id: 'x' }, { id: 'y', profile: 'teens' }])[0].map(p => p.id)).toEqual(['x', 'y']);
  });

  it('drops an empty row — kids-only or adults-only yields a single row', () => {
    expect(groupRows([{ id: 'a', profile: 'kids' }]).length).toBe(1);
    expect(groupRows([{ id: 'a', profile: 'adults' }])).toEqual([[{ id: 'a', profile: 'adults' }]]);
  });

  it('is empty for no persons', () => {
    expect(groupRows([])).toEqual([]);
  });
});

describe('gridNav', () => {
  var rows = groupRows(ROSTER); // [[oliver, millie, guest], [mom, dad]]

  it('Left/Right walk within a row, clamped at the edges', () => {
    expect(gridNav(rows, 'oliver', 'ArrowRight')).toBe('millie');
    expect(gridNav(rows, 'millie', 'ArrowRight')).toBe('guest');
    expect(gridNav(rows, 'guest', 'ArrowRight')).toBe('guest');
    expect(gridNav(rows, 'oliver', 'ArrowLeft')).toBe('oliver');
    expect(gridNav(rows, 'millie', 'ArrowLeft')).toBe('oliver');
  });

  it('Down moves to the adults row, Up back to kids, clamped at the edges', () => {
    expect(gridNav(rows, 'oliver', 'ArrowDown')).toBe('mom');
    expect(gridNav(rows, 'millie', 'ArrowDown')).toBe('dad');
    expect(gridNav(rows, 'mom', 'ArrowUp')).toBe('oliver');
    expect(gridNav(rows, 'mom', 'ArrowDown')).toBe('mom');
    expect(gridNav(rows, 'oliver', 'ArrowUp')).toBe('oliver');
  });

  it('clamps the column into the shorter destination row', () => {
    // kids row col 2 (guest) -> adults row has only cols 0..1 -> clamps to dad
    expect(gridNav(rows, 'guest', 'ArrowDown')).toBe('dad');
  });

  it('falls back to the top-left cell when the id is unknown', () => {
    // unknown -> cell {0,0}; ArrowLeft clamps there, exposing the fallback cell
    expect(gridNav(rows, 'ghost', 'ArrowLeft')).toBe('oliver');
  });

  it('ignores unknown keys (stays put)', () => {
    expect(gridNav(rows, 'millie', 'Enter')).toBe('millie');
  });
});
