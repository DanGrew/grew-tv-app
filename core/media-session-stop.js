// TASK-599 — the couch remote's ⏹ Stop. It sends an HID consumer-control code
// that never reaches the page as a key, so the ONLY route to it is the Media
// Session's `stop` action — the same session Chrome already drives Play/Pause
// through with no app code. Only `stop` is ever claimed here: registering
// play/pause too would take over the browser's own handling of those
// (TASK-599's story 7), and nothing asks for that.
//
// Claimed by a player when something starts and released when it stops, so a
// stray Stop on a screen with nothing playing does nothing (story 6). A browser
// with no Media Session, or one that refuses the `stop` action (setActionHandler
// throws for an action it does not know), costs the button and never the
// playback that called in here.
//
// `navigator` is a browser global, not a DOM token, so it is allowed in core/.

function setStop(handler) {
  try {
    navigator.mediaSession.setActionHandler('stop', handler);
  } catch (e) {
    // No Media Session, or no `stop` in it — the button stays dead, nothing else.
  }
}

// Point the remote's Stop at `stop` — the player's own stopPlayback, the same
// act Home already performs, so where "back" is never gets re-derived here.
export function claimStop(stop) {
  setStop(stop);
}

// Stop does nothing again.
export function releaseStop() {
  setStop(null);
}
