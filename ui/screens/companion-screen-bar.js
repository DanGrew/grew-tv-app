import { chooserState, chooserMode, screenLabel } from '../../core/screen-chooser.js';

// Persistent screen chooser for the companion content pages (TASK-179 A1/A2/A3,
// FEAT-026 device plane). Generalises the bespoke chooser that lived only on
// companion-profile so every content page (browse/detail/video/audio) can both
// SEE which screen it drives and RE-TARGET to another — leaving the first app
// running untouched (re-target sends register_companion only; A3). When nothing
// is targeted, or the persisted target's screen is offline, it renders an
// explicit "Pick a screen" picker instead of a blank page (A2 — BUG-013/012).
//
// `getApi()` returns the live companion-ws api (resolved lazily: the page wires
// the bar after connect()). `onBound(bound)` lets the page hide its own content
// while unbound. Branch-free per the cyclomatic-1 gate — the mode decision lives
// in core/screen-chooser.js.
export function mountScreenBar(getApi, onBound) {
  var bar = document.getElementById('screen-bar');
  var last = { devices: [] };
  var open = { v: false };

  function pick(id) { open.v = false; getApi().target(id); refresh(); }
  function toggleOpen() { open.v = !open.v; refresh(); }

  function headerEl(text) {
    var h = document.createElement('div');
    h.className = 'screen-bar-label';
    h.textContent = text;
    return h;
  }

  function deviceBtn(d, current) {
    var b = document.createElement('button');
    b.className = 'screen-btn';
    b.setAttribute('data-id', d.device_id);
    b.classList.toggle('on', d.device_id === current);
    b.textContent = screenLabel(d);
    b.addEventListener('click', function() { pick(d.device_id); });
    return b;
  }

  function buttonsRow(state) {
    var row = document.createElement('div');
    row.className = 'screen-list';
    var cur = [state.current].filter(Boolean).map(function(d) { return d.device_id; }).concat([null])[0];
    state.devices.forEach(function(d) { row.appendChild(deviceBtn(d, cur)); });
    return row;
  }

  function currentPill(state) {
    var b = document.createElement('button');
    b.className = 'screen-current';
    b.setAttribute('data-open', String(open.v));
    b.textContent = '▣ ' + state.currentLabel + ' ▾';
    b.addEventListener('click', toggleOpen);
    return b;
  }

  function renderWaiting() { bar.appendChild(headerEl('Waiting for a screen…')); }
  function renderUnbound(state) { bar.appendChild(headerEl('Pick a screen')); bar.appendChild(buttonsRow(state)); }
  function renderCollapsed(state) { bar.appendChild(currentPill(state)); }
  function renderExpanded(state) { bar.appendChild(currentPill(state)); bar.appendChild(headerEl('Drive screen')); bar.appendChild(buttonsRow(state)); }

  var MODE = { waiting: renderWaiting, unbound: renderUnbound, collapsed: renderCollapsed, expanded: renderExpanded };

  function render(state) {
    bar.innerHTML = '';
    MODE[chooserMode(state, open.v)](state);
  }

  function refresh() {
    var state = chooserState(last.devices, getApi().currentTarget());
    render(state);
    onBound(state.bound);
  }

  // Wired as connect()'s onDevices: a fresh screen list re-derives the bar.
  function update(devices) { last.devices = devices; refresh(); }

  refresh();
  return update;
}
