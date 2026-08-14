// TASK-412 — the companion header consolidates Screen, Mode, Profile and Atlas
// into one popout menu off a single icon (replaces the four separately-stacked
// rows). Opens/closes ONLY via that icon, never on an outside tap, so the rest
// of the drill stays fully usable underneath it while the menu stays open
// (Stories 1-3). The menu's contents are the existing mounts (mountSyncBar,
// mountScreenBar), Profile and Atlas — relocated into #status-menu's DOM by
// companion/browse.html, not rebuilt here.
export function mountStatusMenu() {
  var btn = document.getElementById('btn-status');
  var menu = document.getElementById('status-menu');
  btn.addEventListener('click', function() { menu.classList.toggle('open'); });
}
