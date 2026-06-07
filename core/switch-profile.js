// Switch-profile nav target (BUG-007). Single source of truth for "go back to
// the Who's-watching picker", shared by the app (the top-right profile control)
// and the companion (its Switch profile button). Both drive the TV to the same
// page via the same navigate path — the app calls navTo(target), the companion
// sends a `navigate` intent carrying this target, which the app's browse screen
// turns into the identical navTo. One path, no parallel routing.
//
// Profile is a login gate, not a browse ancestor, so this is deliberately
// separate from core/breadcrumb.js (Home stays the breadcrumb root). Returning
// to the picker re-runs the lock gate, so a locked profile (Adults) re-requires
// its PIN — there is no path that silently re-enters a locked profile.
var PROFILE_PAGE = 'profile.html';

export function switchProfileTarget() {
  return { page: PROFILE_PAGE, params: {} };
}
