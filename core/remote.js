export function startWatchdog(getWs, getLastPingTime) {
  setInterval(function() {
    var ws = getWs();
    [ws].filter(Boolean).forEach(function(s) {
      [Date.now() - getLastPingTime() > 20000].filter(Boolean).forEach(function() { s.close(); });
    });
  }, 5000);
}
