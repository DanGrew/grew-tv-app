import { helpKeyAction } from '../../core/button-help.js';

// TASK-633 (FEAT-526) — the Info help card: the one card every TV page shows,
// drawing whichever row of core/button-help.js the page named on initPage.
// core/screen-registry.js installs it; no page wires Info itself.
//
// It takes the keys in the CAPTURE phase on window, ahead of everything else on
// the page. Two reasons, both load-bearing:
//   - the add sheets and Search stop every key on their own elements, so a
//     listener on the page's map would never hear Info while one is open — and
//     the card must open over them (spec risk: overlays under it);
//   - while the card is up, nothing may act behind it (story 5), including a
//     sheet's own handlers, which a bubbling listener could never get ahead of.
// Open, it swallows every key but Info and Home, which close it. Focus goes back
// to exactly the element that had it, so a sheet or the Jump grid underneath is
// still open and still focused (story 4).
//
// Nothing here touches playback — a film keeps playing under the card (story 6).
var st = { open: false, returnTo: null, el: null, getHtml: null };

function cardEl() {
  var el = document.createElement('div');
  el.id = 'help-card';
  el.tabIndex = -1;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'What the buttons do');
  el.style.cssText = 'position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);outline:none;';
  document.body.appendChild(el);
  return el;
}

function openCard() {
  st.returnTo = document.activeElement;
  st.el.innerHTML = st.getHtml();
  st.el.style.display = 'flex';
  st.open = true;
  st.el.focus();
}

function closeCard() {
  st.el.style.display = 'none';
  st.open = false;
  [st.returnTo].filter(Boolean).forEach(function(t) { t.focus(); });
}

function swallow(e) {
  e.preventDefault();
  e.stopPropagation();
}

var ACTIONS = {
  open: function(e) { swallow(e); openCard(); },
  close: function(e) { swallow(e); closeCard(); },
  swallow: swallow,
  pass: function() {}
};

function onKey(e) {
  ACTIONS[helpKeyAction(st.open, e.key)](e);
}

function install(getHtml) {
  st.getHtml = getHtml;
  st.el = cardEl();
  window.addEventListener('keydown', onKey, true);
}

export var helpCard = { install: install };
