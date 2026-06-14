// Persistent device-identity badge markup (TASK-197 / FEAT-026 device plane).
// Pure HTML-string builder (no DOM token) so it lives in core/ with a unit test;
// the thin ui/screens/device-badge.js mount injects it into each TV page's
// #device-badge container and paints the swatch from deviceColour(). Mirrors the
// companion's mountScreenBar pattern — one shared component dropped on every page
// so a screen's own colour identity is visible everywhere, not only on the
// profile picker where TASK-178 first painted it. The swatch span is left
// uncoloured here; the mount fills its background from deviceColour(ensureDevice).
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function deviceBadgeMarkup(label) {
  return '<span id="device-swatch"></span>' +
    '<span id="device-name">' + escapeHtml(label) + '</span>';
}
