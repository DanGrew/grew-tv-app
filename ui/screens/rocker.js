import { ROCKER_ACTIONS, ROCKER_BUTTONS, rockerTarget } from '../../core/rocker.js';

// TASK-602 — claims − and + in a PLAYING page's own key map, so each press is a
// click on the ⏮/⏭ already drawn (core/rocker.js says why). Wired by
// screen-video-page.js and screen-audio-page.js only — never by the shared
// players they build on, because the channel player is built on the same video
// player and flips channels on these keys; claiming them there would fire a
// flip and a skip together.
//
// surface.queue       — the page's Queue shell (isOpen, pressTransport)
// surface.overlayOpen — () -> whether something is drawn over the transport

// A dimmed control is really `disabled`, so its click does nothing on its own;
// a hidden one is skipped here so a press never reaches a control not on screen.
function isPressable(btn) {
  return ![btn.disabled, btn.classList.contains('hidden')].some(Boolean);
}

function pressPlayer(action) {
  [document.getElementById(ROCKER_BUTTONS[action])].filter(isPressable).forEach(function(b) { b.click(); });
}

export function claimRocker(keys, surface) {
  var PRESS = {
    none: function() {},
    queue: function(action) { surface.queue.pressTransport(action); },
    player: pressPlayer
  };
  Object.keys(ROCKER_ACTIONS).forEach(function(key) {
    keys[key] = function(e) {
      e.preventDefault();
      PRESS[rockerTarget(surface.queue.isOpen(), surface.overlayOpen())](ROCKER_ACTIONS[key]);
    };
  });
}
