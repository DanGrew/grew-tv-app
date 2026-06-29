import { videoQueueViewHtml } from '../../core/video-queue-view.js';
import { queueCrumbHtml } from '../../core/queue-crumb.js';

// FEAT-040 (TASK-250) Video Queue View overlay. Hangs off the persistent video
// player (screen-video-page): the <video> stays mounted and this layer draws the
// server `video_playback` snapshot — NOW PLAYING / PLAY NEXT / FROM SERIES / THEN
// — on top. It owns no queue state: it renders the snapshot and turns each row's
// controls into video-playback actions (play-item / remove-queue-entry /
// move-queue-entry / toggle-repeat), then repaints from the next snapshot the
// server pushes. The phone mirror is ui/screens/companion-video-queue.js.
//
// d-pad focus is a 2-D grid over the rows: Up/Down between rows, Left/Right between
// a row's cells; Enter fires the focused cell; Back closes. Mirrors screen-queue.js
// (the music Queue View); every fn stays cyclomatic-1 per the UI gate.
export function setupVideoQueue(config) {
  var root    = config.root;          // #queue-overlay (display toggled by .open)
  var body    = config.body;          // inner container we own the innerHTML of
  var onAction = config.onAction;     // (action, payload) -> POST /api/video-playback
  var onClose  = config.onClose;      // restore focus to the opener
  var lastSnap = null;
  var grid = [];                      // rows of focusable cells (DOM order)
  var pos  = { r: 0, c: 0 };
  var crumb = config.crumb;           // overlay breadcrumb host (TASK-216)

  // A clickable breadcrumb in the overlay header: the back crumb closes the overlay
  // back to the still-playing player (no nav) — the pointer affordance the d-pad
  // Back already gives.
  [crumb].filter(Boolean).forEach(function (el) {
    el.innerHTML = queueCrumbHtml();
    el.querySelector('#queue-crumb-back').addEventListener('click', function () { close(); });
  });

  // Grid rows: the now-playing transport (Repeat) then each queue/source row.
  // Only enabled buttons count — a queued row's inert name is a span (not a
  // button), so source-only rows surface their play-item select, queued rows their
  // ↑/↓/⊟; empty groups drop out.
  function buildGrid() {
    grid = Array.prototype.slice.call(body.querySelectorAll('.np-transport, .q-row'))
      .map(function (rowEl) { return Array.prototype.slice.call(rowEl.querySelectorAll('button:not([disabled])')); })
      .filter(function (cells) { return cells.length > 0; });
  }

  function focusCell() {
    pos.r = Math.max(0, Math.min(grid.length - 1, pos.r));
    var cells = [grid[pos.r]].filter(Boolean).concat([[]])[0];
    pos.c = Math.max(0, Math.min(cells.length - 1, pos.c));
    [cells[pos.c]].filter(Boolean).forEach(function (el) { el.focus(); });
  }

  var ACT = {
    select:    function (b) { onAction('play-item', { item_id: b.getAttribute('data-item') }); },
    move:      function (b) { onAction('move-queue-entry', { entry_id: b.getAttribute('data-entry'), direction: b.getAttribute('data-dir') }); },
    remove:    function (b) { onAction('remove-queue-entry', { entry_id: b.getAttribute('data-entry') }); },
    transport: function (b) { onAction(b.getAttribute('data-action'), {}); }
  };

  function wireButton(b) {
    b.addEventListener('click', function () { ACT[b.getAttribute('data-act')](b); });
  }

  function render(snap) {
    lastSnap = snap;
    body.innerHTML = videoQueueViewHtml(snap);
    Array.prototype.slice.call(body.querySelectorAll('button')).forEach(wireButton);
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

  // A fresh snapshot repaints only while open (keeping the focus position, clamped);
  // a closed overlay just caches it for the next open().
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
