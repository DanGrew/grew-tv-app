// Profile picker layout (two rows: kids on top, adults below). The picker used
// to lay every person in a single flex row; with a growing family + the Guest
// person that crowded one line, so the cards are split by content class. Kids
// lead (the primary users, and Guest rides in this row); adults — the PIN-gated
// class — sit on the second row. Pure index math lives here so the screen +
// companion share one model and the grid d-pad nav is unit-tested.

// Group persons into display rows by class, kids first, then adults. Empty rows
// are dropped so a config with no adults (or no kids) shows a single row rather
// than a blank band.
export function groupRows(persons) {
  var kids = persons.filter(function(p) { return p.profile !== 'adults'; });
  var adults = persons.filter(function(p) { return p.profile === 'adults'; });
  return [kids, adults].filter(function(row) { return row.length > 0; });
}

// Locate a person id in the row grid -> { r, c }, or the top-left cell when the
// id isn't found (focus never lands nowhere).
function cellOf(rows, id) {
  for (var r = 0; r < rows.length; r++) {
    for (var c = 0; c < rows[r].length; c++) {
      if (rows[r][c].id === id) return { r: r, c: c };
    }
  }
  return { r: 0, c: 0 };
}

// d-pad move across the grid: Left/Right walk within a row, Up/Down change rows.
// Both clamp at the edges (no wrap), and a row change clamps the column into the
// destination row's length (rows can differ in size). Returns the id to focus.
export function gridNav(rows, currentId, key) {
  var at = cellOf(rows, currentId);
  var deltas = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
  var d = deltas[key] || [0, 0];
  var r = Math.max(0, Math.min(rows.length - 1, at.r + d[0]));
  var c = Math.max(0, Math.min(rows[r].length - 1, at.c + d[1]));
  return rows[r][c].id;
}
