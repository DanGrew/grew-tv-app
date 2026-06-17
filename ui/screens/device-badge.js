import { ensureDevice, getDeviceLabel } from '../../core/state.js';
import { deviceColour } from '../../core/device-colour.js';
import { deviceBadgeMarkup } from '../../core/device-badge.js';
import { installErrorReporter } from '../../core/error-reporter.js';

// Mounts the shared persistent device-colour badge (TASK-197) on a TV page. Finds
// the #device-badge container, fills it with the pure markup, then paints the
// swatch with this screen's identity colour — the same two lines
// screen-profile-page.js used at 42-43, now shared across every page so the
// screen's colour stays visible beyond the profile picker. Non-interactive: no
// tabindex, never in the d-pad focus order (CSS pointer-events:none on the badge).
export function mountDeviceBadge() {
  // Piggyback the app-wide error reporter (TASK-213) on the one boot call every
  // real TV page already makes. Installed FIRST and before any DOM work so even a
  // failure mounting the badge below is captured. Idempotent per window.
  installErrorReporter(window);
  var badge = document.getElementById('device-badge');
  badge.innerHTML = deviceBadgeMarkup(getDeviceLabel());
  badge.querySelector('#device-swatch').style.backgroundColor = deviceColour(ensureDevice());
}
