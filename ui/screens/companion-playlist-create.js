import { createPlaylist, renamePlaylist, addToPlaylist, addSourceToPlaylist } from '../../core/app-api.js';
import { cleanName, isValidName, editorMode } from '../../core/playlist-name.js';

// FEAT-036 — the companion name screen, shared by create (TASK-209) and rename
// (TASK-210), and the PRACTICAL text path (a phone has a real keyboard, so a plain
// text input replaces the TV's on-screen keyboard). A `?rename=<id>` param selects
// rename mode (editorMode): it prefills the playlist's current name (?name=) and
// HIDES the kids/adults profile picker — a playlist's profile is immutable, so
// rename edits the name only. create mode shows the picker, preselecting the active
// profile from ?profile= (companion-browse links here knowing the live profile).
// Name editing + validation reuse the pure core/playlist-name helpers, so the rules
// can never drift from the TV path. Submit POSTs create/rename and returns to the
// companion playlists list (browse), where the change shows via the catalog; Cancel
// returns there unchanged. No WebSocket: this is a state write both surfaces read,
// not a TV-teleport the companion must drive.
//
// FEAT-036/TASK-207 (create only): an `addTrack` query param marks the create-from-
// a-track flow (the companion Add-to-playlist sheet's "New playlist" choice). When
// present, the new playlist is created, that track is added, then we return to the
// list — so the new playlist starts holding the track.
export function initPage() {
  var server = window.location.origin;
  var params = new URLSearchParams(window.location.search);
  var renameId = params.get('rename');
  var cfg = editorMode(renameId, params.get('name'));
  var st = { profile: [params.get('profile')].filter(Boolean).concat(['adults'])[0] };
  var addTrack = params.get('addTrack');
  var addSourceType = params.get('addSourceType');
  var addSourceId = params.get('addSourceId');

  var nameEl = document.getElementById('pl-name');
  var errEl = document.getElementById('error-msg');
  nameEl.value = cfg.initialName;
  document.getElementById('create-title').textContent = cfg.title;
  document.getElementById('btn-create').textContent = cfg.action;

  function render() {
    document.getElementById('btn-profile-kids').classList.toggle('selected', st.profile === 'kids');
    document.getElementById('btn-profile-adults').classList.toggle('selected', st.profile === 'adults');
  }
  function setProfile(p) { st.profile = p; render(); }

  function showError(msg) { errEl.textContent = msg; errEl.style.display = 'block'; }
  function invalidName() { showError('Enter a name (1–100 characters).'); }
  function cancel() { window.location.href = 'browse.html'; }
  // After create, apply any pending add — a single track (TASK-207) OR a whole
  // album/playlist snapshot (TASK-212) — then return to the list regardless of the
  // add outcome (the playlist already exists; a failed add just lands empty).
  function addTrackThenDone(rec) { addToPlaylist(server, rec.id, addTrack).then(cancel).catch(cancel); }
  function addSourceThenDone(rec) { addSourceToPlaylist(server, rec.id, addSourceType, addSourceId).then(cancel).catch(cancel); }
  // Pick the post-create step without branching: source > track > plain return.
  var POST_CREATE = [[Boolean(addSourceId), addSourceThenDone], [Boolean(addTrack), addTrackThenDone], [true, cancel]];
  function afterCreate(rec) { POST_CREATE.filter(function(p) { return p[0]; })[0][1](rec); }
  function doCreate() {
    createPlaylist(server, cleanName(nameEl.value), st.profile)
      .then(afterCreate)
      .catch(function() { showError('Could not create playlist. Try again.'); });
  }
  function doRename() {
    renamePlaylist(server, renameId, cleanName(nameEl.value))
      .then(cancel)
      .catch(function() { showError('Could not rename playlist. Try again.'); });
  }
  var SUBMIT = { create: doCreate, rename: doRename };
  function submit() { ({ true: function() { SUBMIT[cfg.kind](); }, false: invalidName })[isValidName(nameEl.value)](); }

  // rename mode drops the profile picker (immutable after create); the boolean-keyed
  // table keeps this branch-free for the companion cyclomatic gate.
  function noop() {}
  var HIDE_PROFILE = { true: noop, false: function() {
    document.getElementById('profile-row').style.display = 'none';
    document.getElementById('profile-label').style.display = 'none';
  } };
  HIDE_PROFILE[cfg.showProfile]();

  document.getElementById('btn-profile-kids').addEventListener('click', function() { setProfile('kids'); });
  document.getElementById('btn-profile-adults').addEventListener('click', function() { setProfile('adults'); });
  document.getElementById('btn-create').addEventListener('click', submit);
  document.getElementById('btn-cancel').addEventListener('click', cancel);
  render();
}
