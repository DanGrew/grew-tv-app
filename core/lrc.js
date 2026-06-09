// FEAT-018 (TASK-131) LRC parsing + rolling-frame selection for the always-on
// ambient lyrics screen. Pure: no DOM, no fetch. The audio page fetches the
// track's `.lrc` text (core/app-api loadLyrics) and drives windowAt(t) from the
// <audio> timeupdate. Display is a rolling 3-line frame — current line ±1 — NOT
// word-by-word and NOT tight-sync; lines advance roughly with playback.

var GLYPH = '♪';   // ♪ — instrumental / pre-vocal / no current line
var CUE = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

// Parse "[mm:ss.xx] text" lines into time-sorted cues [{t, text}]. A single line
// may carry several timestamps ([t1][t2] text) -> one cue each. Metadata tags
// ([ar:...], [ti:...], [length:...]) carry no numeric mm:ss so they match
// nothing and are skipped. A cue whose text is empty (an instrumental beat) is
// stored as text:null and renders as ♪.
export function parseLrc(text) {
  var out = [];
  String(text || '').split(/\r?\n/).forEach(function(line) {
    var stamps = [];
    var m;
    CUE.lastIndex = 0;
    while ((m = CUE.exec(line)) !== null) {
      stamps.push(parseInt(m[1], 10) * 60 + parseFloat(m[2]));
    }
    var body = line.replace(CUE, '').trim();
    stamps.forEach(function(t) { out.push({ t: t, text: body.length ? body : null }); });
  });
  out.sort(function(a, b) { return a.t - b.t; });
  return out;
}

// Index of the cue active at playback time `time`: the last cue with t <= time.
// -1 before the first cue (pre-vocal) and for an empty list.
export function indexAt(entries, time) {
  var i = -1;
  for (var k = 0; k < entries.length; k++) {
    if (entries[k].t <= time) i = k; else break;
  }
  return i;
}

function lineAt(entries, i) {
  if (i < 0 || i >= entries.length) return '';
  return entries[i].text === null ? GLYPH : entries[i].text;
}

// Rolling 3-line frame at playback time: the active line plus its ±1 neighbours.
// Out-of-range neighbours -> '' (blank). The current line is ♪ when it is an
// instrumental cue, before the first cue, or when there are no lyrics at all.
export function windowAt(entries, time) {
  var i = indexAt(entries, time);
  return {
    prev: lineAt(entries, i - 1),
    cur: [lineAt(entries, i)].filter(Boolean).concat([GLYPH])[0],
    next: lineAt(entries, i + 1)
  };
}
