import { connect } from '../../core/companion-ws.js';
import { loadBrowse, loadContinueWatching, mediaUrl } from '../../core/app-api.js';
import { screenPage, filterByTitle } from '../../core/companion-utils.js';

// Companion Home (TASK-117): full searchable catalog + a Continue-Watching
// shortcut. Catalog is backend state fetched straight from the API; only the
// live context (current screen + profile) comes from the app over WS. Tapping a
// tile sends the `select` intent — the app routes a video to playback and a
// series to its detail, teleporting the TV.
export function initPage() {
  var host = window.location.hostname;
  var server = 'http://' + host + ':8765';
  var els = {
    connStatus: document.getElementById('conn-status'),
    search: document.getElementById('search'),
    cwSection: document.getElementById('cw-section'),
    cw: document.getElementById('cw'),
    grid: document.getElementById('grid'),
    empty: document.getElementById('empty')
  };
  var state = { profile: null, cards: [], cw: [], query: '' };
  var api = {};

  function tap(card) { api.sendIntent('select', { id: card.id }); }

  function tile(card, poster) {
    var btn = document.createElement('button');
    btn.className = 'tile-btn';
    btn.setAttribute('data-id', card.id);
    var img = document.createElement('img');
    img.src = mediaUrl(server, poster);
    img.alt = '';
    btn.appendChild(img);
    var span = document.createElement('span');
    span.textContent = card.title || card.id;
    btn.appendChild(span);
    btn.addEventListener('click', function() { tap(card); });
    return btn;
  }

  function renderGrid() {
    els.grid.innerHTML = '';
    var shown = filterByTitle(state.cards, state.query);
    els.empty.style.display = shown.length ? 'none' : 'block';
    shown.forEach(function(card) { els.grid.appendChild(tile(card, card.poster)); });
  }

  // Continue Watching is hidden while searching (search spans the full catalog).
  function renderCW() {
    els.cw.innerHTML = '';
    var show = state.cw.length > 0 && !state.query.trim();
    els.cwSection.style.display = show ? 'block' : 'none';
    state.cw.forEach(function(row) {
      els.cw.appendChild(tile({ id: row.item_id, title: row.title }, row.poster));
    });
  }

  function loadCatalog(profile) {
    state.profile = profile;
    loadBrowse(server, profile)
      .then(function(b) { state.cards = b.content || []; renderGrid(); })
      .catch(function() { state.cards = []; renderGrid(); });
    loadContinueWatching(server, profile)
      .then(function(c) { state.cw = c.content || []; renderCW(); })
      .catch(function() { state.cw = []; renderCW(); });
  }

  els.search.addEventListener('input', function() {
    state.query = els.search.value;
    renderGrid();
    renderCW();
  });

  // Profile (and thus which catalog to show) comes from the live app snapshot;
  // (re)load when it first arrives or changes.
  function onAppState(snap) {
    [snap.profile].filter(Boolean).filter(function(p) { return p !== state.profile; }).forEach(loadCatalog);
  }

  // Legacy context routing still switches the companion between page files.
  function onContext(payload) {
    var page = screenPage(payload.context_id);
    [page].filter(function(p) { return p !== 'browse'; }).forEach(function(p) { window.location.href = p + '.html'; });
  }

  api = connect('ws://' + host + ':8766', onContext, function(s) { els.connStatus.textContent = s; }, onAppState);
}
