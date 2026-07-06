// Pure render-arithmetic pulled out of ui/screens/screen-video-player.js
// (TASK-305) so it lands inside the core/ mutation set instead of escaping into
// the DOM-bound, un-mutated UI layer. The screen still owns the DOM write; only
// the computed expression lives here, unit-tested and mutation-gated.

// Progress-bar fill as a 0..100 percentage of the current position through the
// video (screen-video-player updateProgress).
export function progressPct(cur, dur) {
  return (cur / dur) * 100;
}

// New playhead after a relative skip of `delta` seconds, clamped to [0, dur] so a
// skip can neither run before the start nor past the end (executeSkip).
export function clampTime(cur, delta, dur) {
  return Math.max(0, Math.min(dur, cur + delta));
}

// Wrap a focus index by `delta` steps around a ring of `len` entries, always
// landing in [0, len) (moveFocus d-pad cycle). The extra `+ len` keeps a
// backward step off a negative modulus.
export function wrapIndex(cur, delta, len) {
  return (cur + delta + len) % len;
}

// Frames dropped since the last sample: the running total minus the previous
// running total (checkQuality frame-health probe).
export function frameDrop(total, prev) {
  return total - prev;
}
