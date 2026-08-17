// TASK-408 — the companion ▲/▼ row-step control: a row inside the TASK-412
// status menu ("📺 Row" label + two buttons), shared by every browse-family
// mirror (browse/rail-grid, detail/album-detail, artist, playlist-detail).
// Nudges the TV's focus one rail row without a full navigate — each TV
// screen's `navigate_up`/`navigate_down` handler already exists (moves focus
// one row + brings it into view via .focus() — no scroll code here).
// Synced-only like every other TV-driving control: `sendIntent` is already
// gated by the desync flag (core/companion-ws.js `gate`), and desynced also
// dims the whole row (label included) and blocks the buttons here so it
// reads as inactive rather than merely doing nothing.
export function mountRowStep(mode, getApi) {
  var box = document.getElementById('row-step');
  var label = document.createElement('span');
  label.className = 'row-step-label';
  label.textContent = '📺 Row';
  var buttons = document.createElement('div');
  buttons.className = 'row-step-buttons';
  function stepBtn(text, ariaLabel, intent) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'row-step-btn';
    b.setAttribute('aria-label', ariaLabel);
    b.textContent = text;
    b.addEventListener('click', function() { getApi().sendIntent(intent, {}); });
    return b;
  }
  buttons.appendChild(stepBtn('▲', 'Focus row up', 'navigate_up'));
  buttons.appendChild(stepBtn('▼', 'Focus row down', 'navigate_down'));
  box.appendChild(label);
  box.appendChild(buttons);
  function applyMode() { box.classList.toggle('desync-off', mode.isDesynced()); }
  applyMode();
  return applyMode;
}
