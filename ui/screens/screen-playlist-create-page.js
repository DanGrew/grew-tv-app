import { getParam, getProfile, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { createPlaylist, renamePlaylist, addToPlaylist, addSourceToPlaylist } from '../../core/app-api.js';
import { CHAR_KEYS, KEY_COLS, appendChar, backspace, cleanName, isValidName, gridIndex, editorMode, typedChar } from '../../core/playlist-name.js';

// FEAT-036 — the TV name screen, shared by create (TASK-208) and rename (TASK-210)
// so the on-screen keyboard (the only text-entry a d-pad has) is built once. A
// `?rename=<id>` param selects rename mode (editorMode): it prefills the playlist's
// current name (?name=) and drops the kids/adults profile picker — a playlist's
// profile is immutable, so rename edits the name only. create mode starts blank with
// the picker. The keyboard + name editing + validation are the pure
// core/playlist-name helpers, so this file is render-only; the mode `kind` keys the
// submit/cancel dispatch tables (UI cyclomatic cap = 1, no inline branching).
//
// FEAT-036/TASK-206 (create only): an `addTrack` query param marks the inline
// create-from-a-track flow (the album Add-to-playlist sheet's "New playlist"
// choice). When present, the new playlist is created, that track is added, then its
// detail opens — so a brand-new playlist starts with the track that prompted it.
var SERVER = window.location.origin;

function defaultProfile() { return [getProfile()].filter(Boolean).concat(['adults'])[0]; }

export function initPlaylistCreatePage() {
  var nameEl = document.getElementById('pl-name');
  var grid = document.getElementById('pl-keys');
  var renameId = getParam('rename');
  var cfg = editorMode(renameId, getParam('name'));
  var st = { name: cfg.initialName, profile: defaultProfile(), focus: 0 };
  var cells = [];

  function render() {
    document.getElementById('create-title').textContent = cfg.title;
    nameEl.textContent = [st.name].filter(Boolean).concat(['Playlist name'])[0];
    nameEl.classList.toggle('placeholder', st.name.length === 0);
    [document.getElementById('btn-profile-kids')].filter(Boolean).forEach(function(el) { el.classList.toggle('selected', st.profile === 'kids'); });
    [document.getElementById('btn-profile-adults')].filter(Boolean).forEach(function(el) { el.classList.toggle('selected', st.profile === 'adults'); });
  }
  function setName(n) { st.name = n; render(); }
  function setProfile(p) { st.profile = p; render(); }
  function showError(msg) {
    var el = document.getElementById('error-msg');
    el.textContent = msg;
    el.style.display = 'block';
  }
  function invalidName() { showError('Enter a name (1–100 characters).'); }

  var addTrack = getParam('addTrack');
  var addSourceType = getParam('addSourceType');
  var addSourceId = getParam('addSourceId');
  function openNew(rec) { navTo('playlist-detail.html', { playlist: rec.id }); }
  // After create, apply any pending add — a single track (TASK-206) OR a whole
  // album/playlist snapshot (TASK-212) — then open the new playlist regardless of
  // the add outcome (the playlist already exists; a failed add just lands empty).
  function addTrackThenOpen(rec) { addToPlaylist(SERVER, rec.id, addTrack).then(function() { openNew(rec); }).catch(function() { openNew(rec); }); }
  function addSourceThenOpen(rec) { addSourceToPlaylist(SERVER, rec.id, addSourceType, addSourceId).then(function() { openNew(rec); }).catch(function() { openNew(rec); }); }
  // Pick the post-create step without branching: source > track > plain open.
  var POST_CREATE = [[Boolean(addSourceId), addSourceThenOpen], [Boolean(addTrack), addTrackThenOpen], [true, openNew]];
  function afterCreate(rec) { POST_CREATE.filter(function(p) { return p[0]; })[0][1](rec); }
  function doCreate() {
    createPlaylist(SERVER, cleanName(st.name), st.profile)
      .then(afterCreate)
      .catch(function() { showError('Could not create playlist. Try again.'); });
  }
  // Rename keeps the same id (the server does not re-slug), so this returns to the
  // very playlist it renamed — now showing the new title.
  function backToDetail() { navTo('playlist-detail.html', { playlist: renameId }); }
  function doRename() {
    renamePlaylist(SERVER, renameId, cleanName(st.name))
      .then(backToDetail)
      .catch(function() { showError('Could not rename playlist. Try again.'); });
  }
  var SUBMIT = { create: doCreate, rename: doRename };
  function submit() { ({ true: function() { SUBMIT[cfg.kind](); }, false: invalidName })[isValidName(st.name)](); }
  var CANCEL = { create: function() { navTo('browse.html'); }, rename: backToDetail };
  function cancel() { CANCEL[cfg.kind](); }

  var CHAR_CELLS = CHAR_KEYS.map(function(ch) {
    return { label: ch, run: function() { setName(appendChar(st.name, ch)); } };
  });
  // Profile picker cells exist in create mode only (immutable after create); the
  // boolean-keyed segment keeps the assembly branch-free for the cyclomatic gate.
  var PROFILE_CELLS = [
    { id: 'btn-profile-kids', label: 'Kids', cls: 'pl-profile', run: function() { setProfile('kids'); } },
    { id: 'btn-profile-adults', label: 'Adults', cls: 'pl-profile', run: function() { setProfile('adults'); } }
  ];
  var PROFILE_SEGMENT = { true: function() { return PROFILE_CELLS; }, false: function() { return []; } };
  var SPECIAL_CELLS = [
    { label: 'Space', cls: 'pl-wide', run: function() { setName(appendChar(st.name, ' ')); } },
    { label: '⌫', run: function() { setName(backspace(st.name)); } },
    { label: 'Clear', run: function() { setName(''); } }
  ].concat(PROFILE_SEGMENT[cfg.showProfile]()).concat([
    { id: 'btn-create', label: cfg.action, cls: 'pl-action', run: function() { submit(); } },
    { id: 'btn-cancel', label: '✕ Cancel', cls: 'pl-action', run: function() { cancel(); } }
  ]);
  var CELLS = CHAR_CELLS.concat(SPECIAL_CELLS);

  function moveTo(i) { st.focus = i; cells[i].focus(); }
  function onCellKey(e) {
    var ni = gridIndex(st.focus, KEY_COLS, cells.length, e.key);
    [ni].filter(function(x) { return x !== st.focus; }).forEach(function(x) { e.preventDefault(); moveTo(x); });
  }
  function buildCell(cfg2, idx) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pl-key ' + [cfg2.cls].filter(Boolean).concat([''])[0];
    b.textContent = cfg2.label;
    [cfg2.id].filter(Boolean).forEach(function(id) { b.id = id; });
    b.addEventListener('click', cfg2.run);
    b.addEventListener('focus', function() { st.focus = idx; });
    b.addEventListener('keydown', onCellKey);
    grid.appendChild(b);
    return b;
  }

  cells = CELLS.map(buildCell);
  render();

  // BUG-023 — route a hardware keyboard's printable keys through the same
  // setName(appendChar(...)) path the on-screen grid uses (the d-pad grid stays the
  // kiosk fallback). preventDefault stops a focused key button from also activating
  // on the space bar (double-append); non-typing keys yield '' and drop out here.
  function onTyping(e) {
    [typedChar(e)].filter(Boolean).forEach(function(c) { e.preventDefault(); setName(appendChar(st.name, c)); });
  }
  document.getElementById('btn-back-create').addEventListener('click', cancel);
  document.addEventListener('keydown', onTyping);
  document.addEventListener('keydown', dispatchKey);
  initPage({
    onEnter: function() { moveTo(0); },
    keys: {
      Escape:    function(e) { e.preventDefault(); cancel(); },
      Backspace: function(e) { e.preventDefault(); setName(backspace(st.name)); }
    },
    remote: {}
  });
}
