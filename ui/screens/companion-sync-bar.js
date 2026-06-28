import { tvStatusText } from '../../core/companion-utils.js';

// FEAT-038 (TASK-230): the desync control strip shared by every desync-aware
// companion page — the Sync/Desync toggle plus a display-only "TV: ▶ <title>"
// line so you never lose track of the telly while browsing on your own.
//
// onChange(desynced) fires AFTER a toggle so the host page can react: re-render
// to grey its TV-driving controls (going desynced), or re-sync (going synced).
// The mode flag itself is persisted by core/companion-mode.js, so the new state
// survives the page loads companion navigation does.
export function mountSyncBar(mode, onChange) {
  var toggle = document.getElementById('btn-sync-toggle');
  var status = document.getElementById('tv-status');
  var LABEL = { true: 'Desynced · Sync', false: 'Synced' };

  function applyLabel() {
    toggle.textContent = LABEL[mode.isDesynced()];
    toggle.classList.toggle('desynced', mode.isDesynced());
  }
  function onClick() {
    mode.toggle();
    applyLabel();
    onChange(mode.isDesynced());
  }
  toggle.addEventListener('click', onClick);
  applyLabel();

  function updateStatus(snap) { status.textContent = tvStatusText(snap); }
  return { updateStatus: updateStatus };
}
