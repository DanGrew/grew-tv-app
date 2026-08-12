// TASK-403 — offline playlist download. Reached from the playlist detail
// page's Download button (companion-playlist.js); a standalone utility page
// (no WS, like companion-quick-pause.js) — the folder/File System Access
// choice is local to this phone, not TV-driven state to mirror. `?profile=`
// scopes which playlists are offered, matching the app's profile-scoped
// browse everywhere else. All non-DOM logic (sync orchestration, status
// text) lives in core/ — this module is DOM glue only, kept cyclomatic-1.
import { loadBrowse } from '../../core/app-api.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { getStoredHandle, setStoredHandle, ensureReadWritePermission } from '../../core/downloads-handle-store.js';
import { syncCheckedPlaylists } from '../../core/downloads-sync.js';
import { playlistStatusText } from '../../core/downloads-status-text.js';

var PANEL_DISPLAY = { true: 'flex', false: 'none' };
var CHECK_TOGGLE = { true: false, false: true };

export function initPage() {
  var server = window.location.origin;
  var profile = [new URLSearchParams(window.location.search).get('profile')].filter(Boolean).concat(['adults'])[0];
  var els = {
    unsupported: document.getElementById('unsupported'),
    folderPicker: document.getElementById('folder-picker'),
    playlistPanel: document.getElementById('playlist-panel'),
    folderChip: document.getElementById('folder-chip'),
    list: document.getElementById('pl-list'),
    syncBtn: document.getElementById('btn-sync'),
    status: document.getElementById('dl-status')
  };
  var state = { handle: null, playlists: [], checked: {}, syncing: false, progress: {} };

  function showStatus(text) { els.status.textContent = text; }

  function panel(name) {
    ['unsupported', 'folderPicker', 'playlistPanel'].forEach(function(k) {
      els[k].style.display = PANEL_DISPLAY[(k === name) + ''];
    });
  }

  function checkedIds() {
    return Object.keys(state.checked).filter(function(id) { return state.checked[id]; });
  }

  function syncDisabled() {
    return [state.syncing, checkedIds().length === 0].filter(Boolean).length > 0;
  }

  function toggleChecked(id) {
    state.checked[id] = CHECK_TOGGLE[Boolean(state.checked[id]) + ''];
    render();
  }

  function checkboxEl(pl) {
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'pl-check';
    cb.checked = Boolean(state.checked[pl.id]);
    cb.disabled = state.syncing;
    cb.setAttribute('aria-label', pl.title);
    cb.addEventListener('change', function() { toggleChecked(pl.id); });
    return cb;
  }

  function rowEl(pl) {
    var row = document.createElement('div');
    row.className = 'pl-row';
    row.appendChild(checkboxEl(pl));
    var meta = document.createElement('div');
    meta.className = 'pl-meta';
    var name = document.createElement('div');
    name.className = 'pl-name';
    name.textContent = pl.title;
    var status = document.createElement('div');
    status.className = 'pl-status';
    status.textContent = playlistStatusText(pl.id, state.progress[pl.id], pl.clipCount);
    meta.appendChild(name);
    meta.appendChild(status);
    row.appendChild(meta);
    return row;
  }

  function renderList() {
    els.list.innerHTML = '';
    state.playlists.forEach(function(pl) { els.list.appendChild(rowEl(pl)); });
  }

  function renderSyncBtn() {
    els.syncBtn.textContent = 'Sync selected (' + checkedIds().length + ')';
    els.syncBtn.disabled = syncDisabled();
  }

  function render() {
    renderList();
    renderSyncBtn();
  }

  function onTrackProgress(playlistId, done, total) {
    state.progress[playlistId] = { done: done, total: total };
    render();
  }

  function onSyncClick() {
    var ids = checkedIds();
    state.syncing = true;
    render();
    ensureReadWritePermission(state.handle)
      .then(function(granted) {
        var ACT = {
          true: function() {
            return syncCheckedPlaylists(state.handle, server, ids, onTrackProgress)
              .then(function() { state.progress = {}; });
          },
          false: function() { showStatus('Permission to write to the folder was not granted.'); return Promise.resolve(); }
        };
        return ACT[Boolean(granted) + '']();
      })
      .catch(function() { showStatus('Sync failed.'); })
      .then(function() { state.syncing = false; render(); });
  }
  els.syncBtn.addEventListener('click', onSyncClick);

  function loadPlaylists() {
    loadBrowse(server, profile)
      .then(function(res) {
        state.playlists = playlistCards([res.content].filter(Boolean).concat([[]])[0]);
        render();
      })
      .catch(function() { showStatus('Could not load playlists.'); });
  }

  function showFolderChip() {
    els.folderChip.textContent = [state.handle.name].filter(Boolean).concat(['(chosen folder)'])[0];
  }

  function loadWithHandle(handle) {
    state.handle = handle;
    showFolderChip();
    panel('playlistPanel');
    loadPlaylists();
  }

  function chooseFolder() {
    window.showDirectoryPicker({ mode: 'readwrite' })
      .then(function(handle) { return setStoredHandle(handle).then(function() { loadWithHandle(handle); }); })
      .catch(function() { showStatus('Could not access that folder.'); });
  }
  document.getElementById('btn-choose-folder').addEventListener('click', chooseFolder);

  function afterStoredHandle(handle) {
    var ROUTE = { true: function() { loadWithHandle(handle); }, false: function() { panel('folderPicker'); } };
    ROUTE[Boolean(handle) + '']();
  }

  function initSupported() {
    panel('folderPicker');
    getStoredHandle().then(afterStoredHandle).catch(function() { panel('folderPicker'); });
  }

  function initUnsupported() { panel('unsupported'); }

  var SUPPORT = { true: initUnsupported, false: initSupported };
  SUPPORT[(!('showDirectoryPicker' in window)) + '']();
}
