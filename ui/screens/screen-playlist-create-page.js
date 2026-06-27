import { getProfile, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { createPlaylist } from '../../core/app-api.js';
import { CHAR_KEYS, KEY_COLS, appendChar, backspace, cleanName, isValidName, gridIndex } from '../../core/playlist-name.js';

// FEAT-036 (TASK-208) — the TV create-playlist screen. A name field driven by an
// on-screen keyboard (the only text-entry device a d-pad has), a kids/adults
// profile picker (the tag is immutable after create), and Create/Cancel. The
// keyboard + name editing + validation are the pure core/playlist-name helpers,
// so this file is render-only. Create POSTs /api/playlists/create and opens the
// new playlist's detail; Cancel returns to browse. The companion's create path is
// its own (TASK-209, phone keyboard) — this is the TV d-pad path.
var SERVER = window.location.origin;

// The on-screen keyboard / action cells, row-major (KEY_COLS per row). Char cells
// append their letter; the trailing cells edit, pick the profile, and act. Anon
// closures keep these out of the pure-fn check; `run` fires on click + Enter.
function defaultProfile() { return [getProfile()].filter(Boolean).concat(['adults'])[0]; }

export function initPlaylistCreatePage() {
  var nameEl = document.getElementById('pl-name');
  var grid = document.getElementById('pl-keys');
  var st = { name: '', profile: defaultProfile(), focus: 0 };
  var cells = [];

  function render() {
    nameEl.textContent = [st.name].filter(Boolean).concat(['Playlist name'])[0];
    nameEl.classList.toggle('placeholder', st.name.length === 0);
    document.getElementById('btn-profile-kids').classList.toggle('selected', st.profile === 'kids');
    document.getElementById('btn-profile-adults').classList.toggle('selected', st.profile === 'adults');
  }
  function setName(n) { st.name = n; render(); }
  function setProfile(p) { st.profile = p; render(); }
  function showError(msg) {
    var el = document.getElementById('error-msg');
    el.textContent = msg;
    el.style.display = 'block';
  }
  function invalidName() { showError('Enter a name (1–100 characters).'); }
  function doCreate() {
    createPlaylist(SERVER, cleanName(st.name), st.profile)
      .then(function(rec) { navTo('playlist-detail.html', { playlist: rec.id }); })
      .catch(function() { showError('Could not create playlist. Try again.'); });
  }
  function create() { ({ true: doCreate, false: invalidName })[isValidName(st.name)](); }
  function cancel() { navTo('browse.html'); }

  var CHAR_CELLS = CHAR_KEYS.map(function(ch) {
    return { label: ch, run: function() { setName(appendChar(st.name, ch)); } };
  });
  var SPECIAL_CELLS = [
    { label: 'Space', cls: 'pl-wide', run: function() { setName(appendChar(st.name, ' ')); } },
    { label: '⌫', run: function() { setName(backspace(st.name)); } },
    { label: 'Clear', run: function() { setName(''); } },
    { id: 'btn-profile-kids', label: 'Kids', cls: 'pl-profile', run: function() { setProfile('kids'); } },
    { id: 'btn-profile-adults', label: 'Adults', cls: 'pl-profile', run: function() { setProfile('adults'); } },
    { id: 'btn-create', label: '✓ Create', cls: 'pl-action', run: function() { create(); } },
    { id: 'btn-cancel', label: '✕ Cancel', cls: 'pl-action', run: function() { cancel(); } }
  ];
  var CELLS = CHAR_CELLS.concat(SPECIAL_CELLS);

  function moveTo(i) { st.focus = i; cells[i].focus(); }
  function onCellKey(e) {
    var ni = gridIndex(st.focus, KEY_COLS, cells.length, e.key);
    [ni].filter(function(x) { return x !== st.focus; }).forEach(function(x) { e.preventDefault(); moveTo(x); });
  }
  function buildCell(cfg, idx) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'pl-key ' + [cfg.cls].filter(Boolean).concat([''])[0];
    b.textContent = cfg.label;
    [cfg.id].filter(Boolean).forEach(function(id) { b.id = id; });
    b.addEventListener('click', cfg.run);
    b.addEventListener('focus', function() { st.focus = idx; });
    b.addEventListener('keydown', onCellKey);
    grid.appendChild(b);
    return b;
  }

  cells = CELLS.map(buildCell);
  render();

  document.getElementById('btn-back-create').addEventListener('click', cancel);
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
