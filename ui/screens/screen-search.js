import { CHAR_KEYS, KEY_COLS, appendChar, backspace, gridIndex, typedChar } from '../../core/playlist-name.js';
import { videoItems, musicItems, rankSearch, searchResultsHtml } from '../../core/search-rank.js';

// FEAT-048 (TASK-324) — the TV search overlay. A modal panel (Videos|Music
// toggle · on-screen keyboard · ranked results) that is a SEPARATE surface over
// browse: opening/typing/closing never re-renders the rails, so closing leaves
// browse exactly where it was. The keyboard REUSES the create-playlist on-screen
// keyboard helpers (core/playlist-name: CHAR_KEYS / appendChar / backspace /
// gridIndex / typedChar) — no new keyboard. Ranking + result markup + routing
// (via the caller's onSelect, i.e. cardRoute) are the shared core/search-rank, so
// TV and companion never drift. Every fn here is cyclomatic-1 (dispatch tables).

export function mountSearch(opts) {
  var server = opts.server;
  var panel = document.getElementById('search-panel');
  var queryEl = document.getElementById('search-query');
  var keysEl = document.getElementById('search-keys');
  var resultsEl = document.getElementById('search-results');
  var st = { query: '', domain: 'videos', items: [] };
  var keyCells = [];

  var DOMAIN_ITEMS = {
    videos: function() { return videoItems(opts.getVideoCards()); },
    music: function() { return musicItems(opts.getTracks(), opts.getVideoCards()); }
  };

  function resultButtons() { return Array.prototype.slice.call(resultsEl.querySelectorAll('.sr-row')); }
  function focusKey(i) { keyCells[i].focus(); }
  function focusFirstResult() { [resultButtons()[0]].filter(Boolean).forEach(function(b) { b.focus(); }); }
  function focusSeg() { [document.querySelector('#search-seg .seg-opt.on')].filter(Boolean).forEach(function(b) { b.focus(); }); }

  function renderQuery() {
    queryEl.textContent = [st.query].filter(Boolean).concat(['Search…'])[0];
    queryEl.classList.toggle('placeholder', st.query.length === 0);
  }
  function openResult(i) { closeSearch(); opts.onSelect(st.items[i].card); }
  // Each freshly-rendered result row wires a tap (route via onSelect) + d-pad
  // Up/Down (and Up off the top -> back to the keyboard).
  var STEP = { ArrowDown: 1, ArrowUp: -1 };
  function moveResult(btns, j) {
    ({ true: function() { focusKey(0); }, false: function() { [btns[j]].filter(Boolean).forEach(function(b) { b.focus(); }); } })[j < 0]();
  }
  function onResultKey(e, i) {
    var btns = resultButtons();
    [STEP[e.key]].filter(function(s) { return s !== undefined; }).forEach(function(s) { e.preventDefault(); moveResult(btns, i + s); });
  }
  function bindResult(b, i) {
    b.addEventListener('click', function() { openResult(i); });
    b.addEventListener('keydown', function(e) { onResultKey(e, i); });
  }
  function renderResults() {
    st.items = rankSearch(st.query, DOMAIN_ITEMS[st.domain]());
    resultsEl.innerHTML = searchResultsHtml(st.items, server);
    resultButtons().forEach(bindResult);
  }
  function render() { renderQuery(); renderResults(); }
  function setQuery(q) { st.query = q; render(); }
  function setDomain(d) {
    st.domain = d;
    document.querySelectorAll('#search-seg .seg-opt').forEach(function(b) { b.classList.toggle('on', b.getAttribute('data-domain') === d); });
    render();
  }

  // Keyboard-cell d-pad: gridIndex moves within the grid; at an edge where it
  // can't move, Up leaves to the segmented toggle and Down leaves to the results.
  var BOUNDARY = { ArrowUp: focusSeg, ArrowDown: focusFirstResult };
  function keyBoundary(e) { [BOUNDARY[e.key]].filter(Boolean).forEach(function(fn) { e.preventDefault(); fn(); }); }
  function onKeyCell(e, i) {
    var ni = gridIndex(i, KEY_COLS, keyCells.length, e.key);
    ({ true: function() { e.preventDefault(); focusKey(ni); }, false: function() { keyBoundary(e); } })[ni !== i]();
  }

  var SPECIAL = [
    { label: 'Space', cls: 'sk-wide', run: function() { setQuery(appendChar(st.query, ' ')); } },
    { label: '⌫', run: function() { setQuery(backspace(st.query)); } },
    { label: 'Clear', run: function() { setQuery(''); } }
  ];
  function keySpecs() {
    return CHAR_KEYS.map(function(ch) { return { label: ch, run: function() { setQuery(appendChar(st.query, ch)); } }; }).concat(SPECIAL);
  }
  function buildKey(spec, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sk-key ' + [spec.cls].filter(Boolean).concat([''])[0];
    b.textContent = spec.label;
    b.addEventListener('click', spec.run);
    b.addEventListener('keydown', function(e) { onKeyCell(e, i); });
    keysEl.appendChild(b);
    return b;
  }

  // Segmented toggle d-pad: Left/Right pick the domain, Down drops into the keys.
  var SEG_LR = { ArrowRight: 'music', ArrowLeft: 'videos' };
  var SEG_DOWN = { ArrowDown: true };
  function onSegKey(e) {
    [SEG_LR[e.key]].filter(Boolean).forEach(function(d) { e.preventDefault(); setDomain(d); focusSeg(); });
    [SEG_DOWN[e.key]].filter(Boolean).forEach(function() { e.preventDefault(); focusKey(0); });
  }
  function onSegClick(e) { [e.target.closest('.seg-opt')].filter(Boolean).forEach(function(b) { setDomain(b.getAttribute('data-domain')); }); }

  // Panel-level handler runs AFTER any focused child's own keydown and always
  // stops propagation, so the browse d-pad (document listener) never fires while
  // the overlay is open. It also routes a hardware keyboard's printable keys +
  // Escape/Backspace, mirroring the create screen's onTyping.
  function closeSearch() { panel.classList.remove('open'); }
  var PANEL_KEYS = { Escape: closeSearch, Backspace: function() { setQuery(backspace(st.query)); } };
  function onPanelKey(e) {
    e.stopPropagation();
    [typedChar(e)].filter(Boolean).forEach(function(c) { e.preventDefault(); setQuery(appendChar(st.query, c)); });
    [PANEL_KEYS[e.key]].filter(Boolean).forEach(function(fn) { e.preventDefault(); fn(); });
  }
  function openSearch() { panel.classList.add('open'); render(); focusKey(0); }

  keyCells = keySpecs().map(buildKey);
  document.getElementById('btn-search').addEventListener('click', openSearch);
  document.getElementById('btn-search-close').addEventListener('click', closeSearch);
  document.getElementById('search-seg').addEventListener('click', onSegClick);
  document.getElementById('search-seg').addEventListener('keydown', onSegKey);
  panel.addEventListener('keydown', onPanelKey);
  render();
}
