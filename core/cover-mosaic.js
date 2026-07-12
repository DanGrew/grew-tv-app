// Pure markup builder for a playlist's cover mosaic (TASK-244 / FEAT-039).
// Given 0..4 already-resolved member album-art URLs (TASK-233's coverArt[],
// resolved through mediaUrl by the DOM caller), returns the HTML string for a
// 2x2-style grid that fills its container. The caller supplies a sized box
// (a tile's .film-poster slot, or the detail header's square) — this helper
// only lays the art out inside it, so both surfaces match.
//
// Degrade by count: 4 -> 2x2; 3 -> two on top + one spanning the bottom row;
// 2 -> two halves; 1 -> single full-bleed; 0 -> '' (caller shows its placeholder).
//
// Pure (no DOM) -> lives in core/ with this unit test.

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function cell(url, span) {
  var spanStyle = span ? 'grid-column:1/3;' : '';
  return '<img class="cover-mosaic-cell" alt="" src="' + esc(url) +
    '" style="' + spanStyle + 'width:100%;height:100%;object-fit:cover;display:block">';
}

// Per-count grid template + the index of the single spanning cell (the bottom one
// in the 3-art layout). No `span` (undefined) means no cell spans.
var LAYOUTS = {
  1: { cols: '1fr', rows: '1fr' },
  2: { cols: '1fr 1fr', rows: '1fr' },
  3: { cols: '1fr 1fr', rows: '1fr 1fr', span: 2 },
  4: { cols: '1fr 1fr', rows: '1fr 1fr' }
};

export function coverMosaicHtml(urls) {
  var list = (urls || []).slice(0, 4);
  if (list.length === 0) return '';
  var layout = LAYOUTS[list.length];
  var cells = list.map(function(url, i) {
    return cell(url, i === layout.span);
  }).join('');
  return '<div class="cover-mosaic" style="display:grid;width:100%;height:100%;' +
    'gap:2px;background:#000;grid-template-columns:' + layout.cols +
    ';grid-template-rows:' + layout.rows + '">' + cells + '</div>';
}
