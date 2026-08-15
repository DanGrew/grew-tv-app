import { queueViewHtml } from '../../core/music-video-queue-view.js';
import { queueCrumbHtml } from '../../core/queue-crumb.js';

// FEAT-418 (TASK-420) Music-Video Queue View overlay. Hangs off the persistent
// video player (screen-video-page.js, music-video mode): the player stays
// mounted and this layer draws the server `music_video_playback` snapshot
// (TASK-419) — NOW PLAYING / PLAY NEXT / FROM SOURCE / THEN — on top. It owns
// no queue state: it renders the snapshot and turns each row's edit controls
// into TASK-419 actions (play-video / remove-queue-entry / move-queue-entry),
// then repaints from the next snapshot the server pushes. Mirrors
// screen-queue.js's overlay mechanics exactly (music's own — every row is
// editable, not just the queued ones).
//
// d-pad focus is a 2-D grid over the rows: Up/Down moves between rows, Left/
// Right between a row's [select, shift-up, shift-down, remove] cells; Enter
// fires the focused cell; Back closes. Every fn stays cyclomatic-1 (dispatch
// tables, no branches) per the UI gate.
export function setupMusicVideoQueue(config) {
  var root    = config.root;          // #queue-overlay (display toggled by .open)
  var body    = config.body;          // inner container we own the innerHTML of
  var onAction = config.onAction;     // (action, payload) -> POST /api/music-video-playback
  var onClose  = config.onClose;      // restore focus to the opener
  var lastSnap = null;
  var grid = [];                      // rows of focusable cells (DOM order)
  var pos  = { r: 0, c: 0 };
  var activeTab = null;               // chosen Queue/Next/Coming-Up tab
  var crumb = config.crumb;           // overlay breadcrumb host

  [crumb].filter(Boolean).forEach(function (el) {
    el.innerHTML = queueCrumbHtml();
    el.querySelector('#queue-crumb-back').addEventListener('click', function () { close(); });
  });

  // Grid rows (DOM order, empty groups drop out): the now-playing transport
  // (Shuffle/Repeat), the tab bar (Queue/Next/Coming Up), then the ACTIVE tab's
  // queue rows only (hidden panels' rows are excluded so the d-pad never lands on
  // an off-tab row).
  function buildGrid() {
    grid = Array.prototype.slice.call(body.querySelectorAll('.np-transport, .qtab-bar, .qtab-panel.active .q-row'))
      .map(function (rowEl) { return Array.prototype.slice.call(rowEl.querySelectorAll('button:not([disabled])')); })
      .filter(function (cells) { return cells.length > 0; });
  }

  function applyTab(key) {
    Array.prototype.slice.call(body.querySelectorAll('.qtab')).forEach(function (t) { t.classList.toggle('active', t.getAttribute('data-tab') === key); });
    Array.prototype.slice.call(body.querySelectorAll('.qtab-panel')).forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-tab') === key); });
  }
  function switchTab(key) {
    activeTab = key;
    applyTab(key);
    buildGrid();
    focusCell();
  }

  function focusCell() {
    pos.r = Math.max(0, Math.min(grid.length - 1, pos.r));
    var cells = [grid[pos.r]].filter(Boolean).concat([[]])[0];
    pos.c = Math.max(0, Math.min(cells.length - 1, pos.c));
    [cells[pos.c]].filter(Boolean).forEach(function (el) { el.focus(); });
  }

  var ACT = {
    select:    function (b) { onAction('play-video', { video_id: b.getAttribute('data-video') }); },
    move:      function (b) { onAction('move-queue-entry', { entry_id: b.getAttribute('data-entry'), direction: b.getAttribute('data-dir') }); },
    remove:    function (b) { onAction('remove-queue-entry', { entry_id: b.getAttribute('data-entry') }); },
    transport: function (b) { onAction(b.getAttribute('data-action'), {}); },
    tab:       function (b) { switchTab(b.getAttribute('data-tab')); }
  };

  function wireButton(b) {
    b.addEventListener('click', function () { ACT[b.getAttribute('data-act')](b); });
  }

  function render(snap) {
    lastSnap = snap;
    body.innerHTML = queueViewHtml(snap);
    Array.prototype.slice.call(body.querySelectorAll('button')).forEach(wireButton);
    [activeTab].filter(Boolean).forEach(applyTab);
    buildGrid();
  }

  var NAV = {
    ArrowUp:    function () { pos.r = pos.r - 1; focusCell(); },
    ArrowDown:  function () { pos.r = pos.r + 1; focusCell(); },
    ArrowLeft:  function () { pos.c = pos.c - 1; focusCell(); },
    ArrowRight: function () { pos.c = pos.c + 1; focusCell(); },
    Enter:      function () { document.activeElement.click(); },
    ' ':        function () { document.activeElement.click(); },
    Escape:     function () { close(); },
    Backspace:  function () { close(); }
  };

  function handleKey(e) {
    [NAV[e.key]].filter(Boolean).forEach(function (fn) { e.preventDefault(); fn(); });
  }

  function isOpen() { return root.classList.contains('open'); }

  function open() {
    root.classList.add('open');
    render(lastSnap);
    pos.r = 0; pos.c = 0;
    focusCell();
  }

  function close() {
    root.classList.remove('open');
    onClose();
  }

  // A fresh snapshot repaints only while open (and keeps the focus position,
  // clamped) — a closed overlay just caches it for the next open().
  var ON_SNAP = {
    'true':  function (snap) { render(snap); focusCell(); },
    'false': function () {}
  };
  function applySnapshot(snap) {
    lastSnap = snap;
    ON_SNAP[isOpen() + ''](snap);
  }

  return { open: open, close: close, isOpen: isOpen, applySnapshot: applySnapshot, handleKey: handleKey };
}
