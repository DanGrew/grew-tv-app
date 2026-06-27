import { createPlaylist } from '../../core/app-api.js';
import { cleanName, isValidName } from '../../core/playlist-name.js';

// FEAT-036 (TASK-209) — the companion create-playlist screen: the mirror of the
// TV's screen-playlist-create-page, and the PRACTICAL create path (a phone has a
// real keyboard, so a plain text input replaces the TV's on-screen keyboard). A
// kids/adults profile picker (immutable after create — backend rule), Create and
// Cancel. The active profile arrives as a ?profile= query param (companion-browse
// links here knowing the live profile) so the picker preselects it. Name editing
// + validation reuse the pure core/playlist-name helpers, so the rules can never
// drift from the TV path. Create POSTs /api/playlists/create and returns to the
// companion playlists list (browse), where the new playlist now appears; Cancel
// returns there unchanged. No WebSocket: create is a state write reflected on
// both surfaces via the catalog, not a TV-teleport the companion must drive.
export function initPage() {
  var host = window.location.hostname;
  var server = 'http://' + host + ':8765';
  var params = new URLSearchParams(window.location.search);
  var st = { profile: [params.get('profile')].filter(Boolean).concat(['adults'])[0] };

  var nameEl = document.getElementById('pl-name');
  var errEl = document.getElementById('error-msg');

  function render() {
    document.getElementById('btn-profile-kids').classList.toggle('selected', st.profile === 'kids');
    document.getElementById('btn-profile-adults').classList.toggle('selected', st.profile === 'adults');
  }
  function setProfile(p) { st.profile = p; render(); }

  function showError(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
  function invalidName() { showError('Enter a name (1–100 characters).'); }
  function cancel() { window.location.href = 'browse.html'; }
  function doCreate() {
    createPlaylist(server, cleanName(nameEl.value), st.profile)
      .then(function() { cancel(); })
      .catch(function() { showError('Could not create playlist. Try again.'); });
  }
  function create() { ({ true: doCreate, false: invalidName })[isValidName(nameEl.value)](); }

  document.getElementById('btn-profile-kids').addEventListener('click', function() { setProfile('kids'); });
  document.getElementById('btn-profile-adults').addEventListener('click', function() { setProfile('adults'); });
  document.getElementById('btn-create').addEventListener('click', create);
  document.getElementById('btn-cancel').addEventListener('click', cancel);
  render();
}
