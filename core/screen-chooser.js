// Companion screen-chooser view-model (TASK-179 / FEAT-026 device plane). Pure
// derivation of the chooser's state from the live device list + the screen the
// companion is currently registered against, so the UI shell
// (ui/screens/companion-screen-bar.js) stays branch-free for the cyclomatic-1
// gate and the routing/labelling rules are unit-tested here.

import { deviceColour } from './device-colour.js';

// Friendly label for a screen button. A device with no label (or a null/absent
// device) falls back to a generic 'Screen'.
export function screenLabel(device) {
  return [device].filter(Boolean).map(function(d) { return d.label; })
    .filter(Boolean).concat(['Screen'])[0];
}

// Stable identity colour for a screen (TASK-178), derived from its device_id so
// the companion's swatch always matches the swatch that screen shows on the TV.
// A null/absent device falls back to deviceColour's own fallback colour.
export function screenColour(device) {
  return deviceColour([device].filter(Boolean).map(function(d) { return d.device_id; })[0]);
}

// Derive the chooser state. `current` is the live device object we are bound to
// (for its label); `bound` is true ONLY when our target is actually present in
// the live list. A persisted-but-absent target (its screen went offline) reads
// as UNBOUND so the page shows a chooser instead of a blank content area —
// BUG-013 / BUG-012 D1. No-target (>1 screen, none chosen) is likewise unbound.
export function chooserState(devices, target) {
  var raw = [devices].filter(Boolean).concat([[]])[0];
  var list = raw.map(function(d) {
    return { device_id: d.device_id, label: d.label, active_person: d.active_person, colour: screenColour(d) };
  });
  var current = list.filter(function(d) { return d.device_id === target; })[0] || null;
  return {
    devices: list,
    current: current,
    bound: !!current,
    currentLabel: screenLabel(current),
    currentColour: screenColour(current)
  };
}

// Which render mode the screen bar shows. No screens at all -> 'waiting';
// unbound (no/absent target) -> 'unbound' (the explicit "Pick a screen" picker);
// bound -> a compact current-screen pill that expands ('expanded') on demand.
export function chooserMode(state, open) {
  if (state.devices.length === 0) return 'waiting';
  if (!state.bound) return 'unbound';
  if (open) return 'expanded';
  return 'collapsed';
}
