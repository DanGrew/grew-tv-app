// Device colour identity (TASK-178 / FEAT-026 device plane). Each screen gets a
// stable colour DERIVED from its device_id — never stored or sent on the wire.
// The app paints its own swatch from ensureDevice(); the companion paints the
// same swatch for each screen from the device_id it already receives in the
// `devices` payload. Both run this identical pure function on the identical id,
// so they always agree with zero coordination — no backend, no payload field.
//
// Colours come from a FIXED 16-entry palette, pre-spread around the wheel and
// vetted as distinct on the dark glass theme, so two screens can never land on
// SIMILAR (adjacent-hue) colours — only, rarely, the exact same slot (a birthday
// collision), which the screen LABEL still disambiguates. The id → slot map is an
// FNV-1a hash: deterministic, dependency-free, no Math.random / Date.

export var DEVICE_PALETTE = [
  '#ef5350', // red
  '#ec407a', // pink
  '#ab47bc', // purple
  '#7e57c2', // deep purple
  '#5c6bc0', // indigo
  '#42a5f5', // blue
  '#29b6f6', // light blue
  '#26c6da', // cyan
  '#26a69a', // teal
  '#66bb6a', // green
  '#9ccc65', // light green
  '#d4e157', // lime
  '#ffee58', // yellow
  '#ffca28', // amber
  '#ffa726', // orange
  '#ff7043'  // deep orange
];

// FNV-1a 32-bit hash of the id → palette index. A null/empty/absent id falls back
// to the first palette entry so a swatch always has a colour (never blank).
export function deviceColour(deviceId) {
  if (!deviceId) return DEVICE_PALETTE[0];
  var h = 0x811c9dc5;
  for (var i = 0; i < deviceId.length; i++) {
    h ^= deviceId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return DEVICE_PALETTE[(h >>> 0) % DEVICE_PALETTE.length];
}
