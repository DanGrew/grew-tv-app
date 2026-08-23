import { queueShellHtml } from '../../core/queue-shell-view.js';
import { queueCrumbHtml } from '../../core/queue-crumb.js';

// TASK-515 (FEAT-497) — THE TV Queue View overlay, for every media type. One
// controller replacing the per-cutover copies TASK-499 and TASK-503 each
// shipped (identical but for which view module they imported). Nothing points
// at it yet: TASK-516 (home movies) and TASK-517 (films) mount it,
// TASK-504/505 after them.
//
// Hangs off the persistent video/audio player: the media element stays
// mounted and this layer draws the server `queue_playback` snapshot
// (TASK-498) — the hero + Queue/Next/Coming-Up tabs — on top. It owns no
// queue state: it renders the snapshot and turns each control into a queue
// engine action (play-item / remove-queue-entry / move-queue-entry /
// toggle-shuffle / toggle-repeat / next / previous), then repaints from the
// next snapshot the server pushes. Play/pause is the one device-local control
// (config.onToggle) — it toggles the already-mounted element directly, not a
// server action. The phone mirror is ui/screens/companion-queue-shell.js.
//
// config.media           — the core/queue-shell-config.js entry for this type.
// config.getSourceTitle  — () -> the hero's source line for a type whose
//                          source id is opaque (a series/boxset, an album),
//                          read fresh on every render so a title that
//                          resolves after the first paint still lands. A type
//                          that derives its own returns ''.
//
// d-pad focus is a 2-D grid over the rows: Up/Down between rows, Left/Right
// between a row's cells; Enter fires the focused cell; Back closes. Every fn
// stays cyclomatic-1 per the UI gate.
export function setupQueueShell(config) {
  var root     = config.root;          // #queue-overlay (display toggled by .open)
  var body     = config.body;          // inner container we own the innerHTML of
  var onAction = config.onAction;      // (action, payload) -> POST /api/queue/{type}/{action}
  var onToggle = config.onToggle;      // device-local play/pause (the hero's own button)
  var onClose  = config.onClose;       // restore focus to the opener
  var media    = config.media;         // the per-type config (queue-shell-config.js)
  var getSourceTitle = config.getSourceTitle; // () -> current hero source line
  var lastSnap = null;
  var grid = [];                       // rows of focusable cells (DOM order)
  var pos  = { r: 0, c: 0 };
  var activeTab = null;                // chosen Queue/Next/Coming-Up tab
  var crumb = config.crumb;            // overlay breadcrumb host

  [crumb].filter(Boolean).forEach(function(el) {
    el.innerHTML = queueCrumbHtml();
    el.querySelector('#queue-crumb-back').addEventListener('click', function() { close(); });
  });

  // Grid rows (DOM order, empty groups drop out): the hero transport row, the
  // tab bar, then the ACTIVE tab's rows only (hidden panels' rows are
  // excluded so the d-pad never lands on an off-tab row). Only enabled
  // buttons count — a transport control the shell rendered disabled-but-
  // visible is skipped the same way a disabled queue-row action already is.
  function buildGrid() {
    grid = Array.prototype.slice.call(body.querySelectorAll('.qs-transport, .qs-tabbar, .qs-panel.active .qs-row'))
      .map(function(rowEl) { return Array.prototype.slice.call(rowEl.querySelectorAll('button:not([disabled])')); })
      .filter(function(cells) { return cells.length > 0; });
  }

  function applyTab(key) {
    Array.prototype.slice.call(body.querySelectorAll('.qs-tab')).forEach(function(t) { t.classList.toggle('active', t.getAttribute('data-tab') === key); });
    Array.prototype.slice.call(body.querySelectorAll('.qs-panel')).forEach(function(p) { p.classList.toggle('active', p.getAttribute('data-tab') === key); });
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
    [cells[pos.c]].filter(Boolean).forEach(function(el) { el.focus(); });
  }

  // Every row's own name plays it now (play-item) — never a remove/re-add
  // pair, so tapping a row never mutates queue/source data.
  var ACT = {
    select:    function(b) { onAction('play-item', { item_id: b.getAttribute('data-item') }); },
    move:      function(b) { onAction('move-queue-entry', { entry_id: b.getAttribute('data-entry'), direction: b.getAttribute('data-dir') }); },
    remove:    function(b) { onAction('remove-queue-entry', { entry_id: b.getAttribute('data-entry') }); },
    transport: function(b) { onAction(b.getAttribute('data-action'), {}); },
    toggle:    function() { onToggle(); },
    tab:       function(b) { switchTab(b.getAttribute('data-tab')); }
  };

  function wireButton(b) {
    b.addEventListener('click', function() { ACT[b.getAttribute('data-act')](b); });
  }

  function render(snap) {
    lastSnap = snap;
    body.innerHTML = queueShellHtml(snap, media, getSourceTitle());
    Array.prototype.slice.call(body.querySelectorAll('button[data-act]')).forEach(wireButton);
    [activeTab].filter(Boolean).forEach(applyTab);
    buildGrid();
  }

  var NAV = {
    ArrowUp:    function() { pos.r = pos.r - 1; focusCell(); },
    ArrowDown:  function() { pos.r = pos.r + 1; focusCell(); },
    ArrowLeft:  function() { pos.c = pos.c - 1; focusCell(); },
    ArrowRight: function() { pos.c = pos.c + 1; focusCell(); },
    Enter:      function() { document.activeElement.click(); },
    ' ':        function() { document.activeElement.click(); },
    Escape:     function() { close(); },
    Backspace:  function() { close(); }
  };

  function handleKey(e) {
    [NAV[e.key]].filter(Boolean).forEach(function(fn) { e.preventDefault(); fn(); });
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

  // A fresh snapshot repaints only while open (keeping the focus position,
  // clamped); a closed overlay just caches it for the next open().
  var ON_SNAP = {
    'true':  function(snap) { render(snap); focusCell(); },
    'false': function() {}
  };
  function applySnapshot(snap) {
    lastSnap = snap;
    ON_SNAP[isOpen() + ''](snap);
  }

  // The hero's source line resolves asynchronously (getSourceTitle's own
  // fetch) and may land after the overlay is already open — a plain re-render
  // off the last snapshot picks it up without waiting for the next push.
  function refreshSourceTitle() {
    [isOpen()].filter(Boolean).forEach(function() { render(lastSnap); focusCell(); });
  }

  return { open: open, close: close, isOpen: isOpen, applySnapshot: applySnapshot, handleKey: handleKey, refreshSourceTitle: refreshSourceTitle };
}
