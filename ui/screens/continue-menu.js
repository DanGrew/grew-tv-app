import { CONTINUE_TYPES, continueLabel } from '../../core/browse-continue.js';
import { transportState } from '../../core/queue-shell-view.js';
import { loadQueuePlayback } from '../../core/app-api.js';

// TASK-501 (FEAT-497) — the four Continue buttons, built once from
// core/browse-continue.js's CONTINUE_TYPES and shared by BOTH browse surfaces:
// the TV's play menu and the companion's. One builder is what stops the two
// drifting the way the old 🎬/🎵 pills did, each surface carrying its own copy
// (FEAT-017/028 mirror invariant). The surface supplies only where a press
// goes — the TV navigates itself, the companion drives the TV.
//
// Disabled-but-visible, never hidden (QUEUE-UX-SHELL.md's Hero rule, the same
// one every transport control follows): a type with nothing queued and no
// source to carry on with keeps its button and its place, dimmed via
// .is-disabled and carrying the real `disabled` attribute. Four buttons that
// hid at zero — which is what today's pills do — would leave a cluster
// shifting between one and four.
export function mountContinueMenu(opts) {
  var buttons = {};

  function build(entry) {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = entry.id;
    b.className = 'continue-btn is-disabled';
    b.setAttribute('data-media-type', entry.mediaType);
    b.textContent = continueLabel(entry);
    b.disabled = true;
    b.addEventListener('click', function() { opts.onContinue(entry.mediaType); });
    opts.mount.appendChild(b);
    buttons[entry.mediaType] = b;
  }
  CONTINUE_TYPES.forEach(build);

  // Live whenever the engine has ANYTHING ahead for that type — the queue
  // front, the rest of the source, or its next wrap. That is transportState's
  // own ⏭ rule verbatim, off the same read-only snapshot the Queue shell
  // renders from, so browse can never disagree with the player about whether
  // Continue would do anything.
  function apply(mediaType, snap) {
    var live = transportState(snap).next;
    var b = buttons[mediaType];
    b.disabled = !live;
    b.classList.toggle('is-disabled', !live);
  }

  // No active person yet ⇒ nothing to read, and the buttons stay in their
  // built (disabled) state rather than asking the server about person ''.
  function refreshType(entry) {
    [opts.getPerson()].filter(Boolean).forEach(function(person) {
      loadQueuePlayback(opts.server, entry.mediaType, person)
        .then(function(snap) { apply(entry.mediaType, snap); })
        .catch(function() {});
    });
  }
  function refresh() { CONTINUE_TYPES.forEach(refreshType); }

  return { refresh: refresh, buttons: buttons };
}
