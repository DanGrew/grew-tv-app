// TASK-408 — the companion ▲/▼ row-step control, shared by every browse-family
// mirror (browse/rail-grid, detail/album-detail, artist, playlist-detail): two
// buttons that nudge the TV's focus one rail row without a full navigate. Each
// TV screen's `navigate_up`/`navigate_down` handler already exists (moves focus
// one row + brings it into view via .focus() — no scroll code here). Synced-only
// like every other TV-driving control: `sendIntent` is already gated by the
// desync flag (core/companion-ws.js `gate`), and desynced also greys the buttons
// here so they read as inactive rather than merely doing nothing (mirrors
// switch-profile / play-next / song-row elsewhere).
export function mountRowStep(mode, getApi) {
  var box = document.getElementById('row-step');
  function stepBtn(label, ariaLabel, intent) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'row-step-btn';
    b.setAttribute('aria-label', ariaLabel);
    b.textContent = label;
    b.addEventListener('click', function() { getApi().sendIntent(intent, {}); });
    return b;
  }
  var up = stepBtn('▲', 'Focus row up', 'navigate_up');
  var down = stepBtn('▼', 'Focus row down', 'navigate_down');
  box.appendChild(up);
  box.appendChild(down);
  function applyMode() {
    up.classList.toggle('desync-off', mode.isDesynced());
    down.classList.toggle('desync-off', mode.isDesynced());
  }
  applyMode();
  return applyMode;
}
