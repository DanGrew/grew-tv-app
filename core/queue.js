// Audio play-queue model (TASK-130, FEAT-018). An album is an ordered list of
// track refs (the /api/album items[], each item.video a full playable record);
// the player walks a *queue order* of track ids — either album order or a
// shuffled permutation. prev/next/autoadvance wrap. All index math is pure here
// so "shuffle reorders, off restores album order" and the wrap behaviour are
// provable without a browser; the audio screen owns the <audio> element.
//
// items: [{ video: { id, title, ext?, ... }, ... }] (album order, authoritative)

// The album's natural order — the track ids in items[] order.
export function albumOrder(items) {
  return (items || []).map(function(it) { return it.video.id; });
}

// A shuffled permutation of ids (Fisher-Yates). rng defaults to Math.random;
// tests inject a deterministic rng. Non-mutating — the album order is untouched,
// so toggling shuffle off restores it.
export function shuffleOrder(ids, rng) {
  var r = rng || Math.random;
  var a = (ids || []).slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(r() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// The id `delta` steps from currentId in the queue order, wrapping both ends.
// Unknown current -> the first id; empty order -> null.
export function neighborId(order, currentId, delta) {
  var o = order || [];
  if (o.length === 0) return null;
  var idx = o.indexOf(currentId);
  if (idx < 0) return o[0];
  return o[(idx + delta + o.length) % o.length];
}

// The full track record for an id, resolved from the album items[] (which carry
// the whole playable). Null when the id is not in this album.
export function trackById(items, id) {
  var hit = (items || []).filter(function(it) { return it.video.id === id; })[0];
  return hit ? hit.video : null;
}
