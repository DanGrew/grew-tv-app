import { NIGHT_OFF, nightPreset, nextLevel, isNightOn, makeupGain } from '../../core/night-mode.js';

// TASK-568 — the Web Audio graph behind the Night Mode control. Everything that
// decides WHAT a level does is data in core/night-mode.js; this module only
// wires it to the playing element.
//
//   <video> -> source ─┬─ (Off)    ────────────────────► destination
//                      └─ (Soft/Strong) -> comp -> makeup -> destination
//
// ⛔ THE GRAPH IS BUILT ON THE FIRST PRESS, NOT AT PLAY TIME. Wiring an element
// into Web Audio is one-way for that element's life, so a viewer who never
// presses Night Mode keeps an audio path this task never touched at all — that
// is story 6 by construction rather than by a bypass that has to be got right.
// A press is also the user gesture an AudioContext needs to start.
//
// The level is a var in this closure and nothing else: one level for the whole
// TV, held only for the current player page (the owner's call, 2026-09-03).
// Selecting a film is a page load, so it resets per film — the trial shape, not
// a defect. Nothing here reads or writes storage; making it stick is a follow-on.
export function createNightMode(video) {
  var level = NIGHT_OFF;
  var graph = null;

  function makeGraph() {
    var Ctor = [window.AudioContext].filter(Boolean).concat([window.webkitAudioContext])[0];
    var ctx = new Ctor();
    var g = { ctx: ctx, source: ctx.createMediaElementSource(video), comp: ctx.createDynamicsCompressor(), makeup: ctx.createGain() };
    g.comp.connect(g.makeup);
    g.makeup.connect(ctx.destination);
    return g;
  }

  var ENSURE = { 'true': function() {}, 'false': function() { graph = makeGraph(); } };
  function ensureGraph() { ENSURE[String(Boolean(graph))](); }

  var SETTINGS = {
    'true': function(g, p) {
      g.comp.threshold.value = p.threshold;
      g.comp.knee.value = p.knee;
      g.comp.ratio.value = p.ratio;
      g.comp.attack.value = p.attack;
      g.comp.release.value = p.release;
    },
    'false': function() {}
  };
  var ROUTE = {
    'true': function(g) { g.source.connect(g.comp); },
    'false': function(g) { g.source.connect(g.ctx.destination); }
  };

  function applyLevel() {
    var on = String(isNightOn(level));
    SETTINGS[on](graph, nightPreset(level));
    graph.makeup.gain.value = makeupGain(level);
    graph.source.disconnect();
    ROUTE[on](graph);
    graph.ctx.resume().catch(function() {});
  }

  function cycle() {
    level = nextLevel(level);
    ensureGraph();
    applyLevel();
  }

  function current() { return level; }

  // ⚠️ THE BLUETOOTH SPEAKER (the spec's named risk, off BUG-061/558).
  // Chromium glues a playing element's audio output to the CoreAudio device
  // current when playback started, which is why screen-video-player.js remounts
  // the element on `devicechange`. A Web Audio graph binds its own output the
  // very same way, and that remount does NOT rebind it — so with Night Mode on,
  // a speaker that drops and reconnects would come back silent, the failure
  // going unnoticed until someone was sitting on the couch. setSinkId('')
  // re-points the context at whatever the OS default is NOW, which is exactly
  // the flip bt-audio.sh causes. Called on the same `devicechange` as the
  // remount, and a no-op before the first press, when there is no graph to move.
  function rebindSink() {
    [graph].filter(Boolean).forEach(function(g) {
      [g.ctx.setSinkId].filter(Boolean).forEach(function() { g.ctx.setSinkId('').catch(function() {}); });
      g.ctx.resume().catch(function() {});
    });
  }

  return { cycle: cycle, current: current, rebindSink: rebindSink };
}
