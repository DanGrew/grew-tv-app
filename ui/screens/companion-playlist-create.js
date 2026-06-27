import { createPlaylist, addToPlaylist } from '../../core/app-api.js';
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
  // FEAT-036/TASK-207: an `addTrack` query param marks the create-from-a-track
  // flow (the companion Add-to-playlist sheet's "New playlist" choice). When
  // present, the new playlist is created, that track is added, then we return to
  // the playlists list — so the new playlist starts holding the track. The profile
  // picker preselects the track's profile (the sheet carries it), so the add
  // matches by construction.
  var addTrack = params.get('addTrack');

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
  // Add the prompting track, then return to the list regardless of the add outcome
  // (the playlist already exists; a failed add just lands on an empty one).
  function addThenDone(rec) { addToPlaylist(server, rec.id, addTrack).then(cancel).catch(cancel); }
  function afterCreate(rec) { ({ true: function() { addThenDone(rec); }, false: cancel })[String(!!addTrack)](); }
  function doCreate() {
    createPlaylist(server, cleanName(nameEl.value), st.profile)
      .then(afterCreate)
      .catch(function() { showError('Could not create playlist. Try again.'); });
  }
  function create() { ({ true: doCreate, false: invalidName })[isValidName(nameEl.value)](); }

  document.getElementById('btn-profile-kids').addEventListener('click', function() { setProfile('kids'); });
  document.getElementById('btn-profile-adults').addEventListener('click', function() { setProfile('adults'); });
  document.getElementById('btn-create').addEventListener('click', create);
  document.getElementById('btn-cancel').addEventListener('click', cancel);
  render();
}
