export function pad(n) { return n < 10 ? '0' + n : '' + n; }

export function fmt(secs) {
  var s = Math.floor(secs);
  var m = Math.floor(s / 60);
  var h = Math.floor(m / 60);
  m = m % 60;
  s = s % 60;
  if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
  return m + ':' + pad(s);
}
