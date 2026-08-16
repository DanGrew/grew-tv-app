// TASK-412 — the companion header consolidates Screen, Mode, Profile and Atlas
// into one popout menu off a single icon (replaces the four separately-stacked
// rows). Opens/closes ONLY via that icon, never on an outside tap, so the rest
// of the drill stays fully usable underneath it while the menu stays open
// (Stories 1-3). TASK-431: mountStatusMenu now builds the #btn-status icon and
// the #status-menu popout itself (mirroring mountScreenBar building its own
// content into an empty mount `<div>`) — a page names which rows it wants and
// gets an empty mount point per row for that row's own existing mount function
// (mountSyncBar, mountScreenBar) or population code (Atlas's door tiles) to
// fill, unchanged. `#switch-profile` is the one row mountStatusMenu builds in
// full, since every page's copy was identical markup + a page-owned click
// listener wired afterward.

var ROW_EL = {
  mode: function() {
    var el = document.createElement('div');
    el.id = 'sync-bar';
    return el;
  },
  screen: function() {
    var el = document.createElement('div');
    el.id = 'screen-bar';
    return el;
  },
  profile: function() {
    var el = document.createElement('button');
    el.id = 'switch-profile';
    el.type = 'button';
    el.textContent = '👤 Switch profile';
    return el;
  },
  atlas: function() {
    var el = document.createElement('div');
    el.id = 'door';
    return el;
  }
};

var STATUS_MENU_CSS = '\n' +
  '#btn-status { flex: 0 0 auto; font-size: 18px; line-height: 1; padding: 8px 13px; border-radius: 999px; border: 2px solid var(--border); background: var(--surface); color: var(--text); font-family: inherit; cursor: pointer; touch-action: manipulation; transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease); }\n' +
  '#btn-status:active, #btn-status:focus { outline: none; border-color: var(--focus); color: var(--focus); }\n' +
  '#status-menu { display: none; flex-direction: column; gap: 14px; position: absolute; top: calc(100% + 8px); right: 0; z-index: 15; width: max-content; max-width: min(320px, calc(100vw - 24px)); padding: 16px; background: #1f2d50; border: 2px solid var(--border); border-radius: var(--radius); box-shadow: 0 12px 36px rgba(0,0,0,0.5); }\n' +
  '#status-menu.open { display: flex; }\n' +
  '#switch-profile { width: 100%; text-align: left; font-size: 14px; padding: 10px 14px; border-radius: var(--radius-sm); border: 2px solid var(--border); background: var(--surface); color: var(--text); font-family: inherit; cursor: pointer; touch-action: manipulation; transition: border-color var(--dur) var(--ease), color var(--dur) var(--ease); }\n' +
  '#switch-profile:active, #switch-profile:focus { outline: none; border-color: var(--focus); color: var(--focus); }\n';

// `rows` names, in menu order, which of mode/screen/profile/atlas this page
// wants — e.g. ['mode', 'screen', 'profile', 'atlas']. Mounts into the page's
// empty `<div id="status-menu-mount"></div>`.
export function mountStatusMenu(rows) {
  var mount = document.getElementById('status-menu-mount');
  var style = document.createElement('style');
  style.textContent = STATUS_MENU_CSS;
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'btn-status';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Menu');
  btn.textContent = '☰';

  var menu = document.createElement('div');
  menu.id = 'status-menu';
  rows.map(function(r) { return ROW_EL[r](); }).forEach(function(el) { menu.appendChild(el); });

  mount.appendChild(btn);
  mount.appendChild(menu);
  btn.addEventListener('click', function() { menu.classList.toggle('open'); });
}
