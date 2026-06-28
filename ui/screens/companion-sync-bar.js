import { tvStatusText } from '../../core/companion-utils.js';

// FEAT-038 (TASK-230) — the companion mode strip, shared by every desync-aware
// page. A segmented [📺 Control | 🔍 Browse] switch plus a display-only
// "TV: ▶ <title>" line. CONTROL = drive the TV (internally "synced"); BROWSE =
// look around / queue without disturbing playback (internally "desynced"). The
// friendly labels live here only; the mode flag keeps its synced/desynced names.
//
// onChange(browsing) fires only when the mode actually CHANGES (tapping the
// already-active side is a no-op), so the host page re-renders (-> Browse) or
// re-syncs (-> Control) just once.
export function mountSyncBar(mode, onChange) {
  var bar = document.getElementById('sync-bar');

  function segOpt(label) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-opt';
    b.textContent = label;
    return b;
  }
  function noop() {}

  var seg = document.createElement('div');
  seg.className = 'seg';
  var control = segOpt('📺 Control');
  var browse = segOpt('🔍 Browse');
  var status = document.createElement('span');
  status.id = 'tv-status';
  status.textContent = 'TV: —';
  seg.appendChild(control);
  seg.appendChild(browse);
  bar.appendChild(seg);
  bar.appendChild(status);

  function applyActive() {
    control.classList.toggle('on', !mode.isDesynced());
    browse.classList.toggle('on', mode.isDesynced());
  }
  function setModeTo(browsing) {
    ({ true: function() { mode.setDesynced(); }, false: function() { mode.setSynced(); } })[browsing]();
  }
  function selectMode(browsing) {
    var changed = browsing !== mode.isDesynced();
    setModeTo(browsing);
    applyActive();
    ({ true: function() { onChange(browsing); }, false: noop })[changed]();
  }
  control.addEventListener('click', function() { selectMode(false); });
  browse.addEventListener('click', function() { selectMode(true); });
  applyActive();

  function updateStatus(snap) { status.textContent = tvStatusText(snap); }
  return { updateStatus: updateStatus };
}
