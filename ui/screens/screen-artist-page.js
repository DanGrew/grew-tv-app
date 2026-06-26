import { getParam, getProfile, getPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { gridArrow, renderGrid, focusFirstGridTile } from './screen-rail-grid.js';
import { connectApp } from '../../core/app-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { loadBrowse, loadContinueWatching } from '../../core/app-api.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';
import { albumsByArtist } from '../../core/home-rails.js';
import { progressMapFromCW } from '../../core/progress.js';

// FEAT-029 — the artist drill-down (L3 off the Music tab's Artists rail): a full
// poster grid of one artist's albums. Reuses the rail-grid grid + glass tokens
// (screen-rail-grid.js) so it matches browse; an album tile opens album detail.
// Pure album filtering lives in core/home-rails (albumsByArtist). Backend = page
// origin, not a hardcoded host (BUG-009 — see screen-video-page).
var SERVER = window.location.origin;

export function initArtistPage() {
  var artist = getParam('artist');
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];

  // id -> album card, filled once /api/browse resolves. The companion's `select`
  // intent carries only an id, so resolve against the catalog rather than a
  // rendered tile (BUG-008, mirrors the rail-grid page).
  var catalog = {};

  function onSelect(card) { navTo('album-detail.html', { album: card.id }); }

  // Header Play / Shuffle (TASK-214): the artist param IS the play-source id —
  // the audio page reads `?artist=` and fires `play-source` { source_type:
  // 'artist' } with the shuffle flag (TASK-187 plumbing). Play-all = ordered,
  // Shuffle = shuffled; both carry from:'artist' for the breadcrumb.
  function playArtist() { navTo('audio.html', { artist: artist, from: 'artist' }); }
  function shuffleArtist() { navTo('audio.html', { artist: artist, shuffle: '1', from: 'artist' }); }

  // Back collapses one level — to the Music tab on the browse page (?tab=music).
  function goBack(e) {
    [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); });
    navTo('browse.html', { tab: 'music' });
  }

  var wsApp = connectApp(wsUrl(window.location.hostname), function(intent, params) {
    var INTENTS = {
      navigate_up:    function() { gridArrow({ key: 'ArrowUp',    preventDefault: function() {} }); },
      navigate_down:  function() { gridArrow({ key: 'ArrowDown',  preventDefault: function() {} }); },
      navigate_left:  function() { gridArrow({ key: 'ArrowLeft',  preventDefault: function() {} }); },
      navigate_right: function() { gridArrow({ key: 'ArrowRight', preventDefault: function() {} }); },
      select:         function() {
        var id = [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)[0];
        [catalog[id]].filter(Boolean).forEach(onSelect);
      },
      playArtist:     function() { playArtist(); },
      shuffle:        function() { shuffleArtist(); },
      back:           function() { goBack(null); },
      navigate:       function() { navTo(params.page, params.params); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'artist', artist: artist });
  // Live snapshot so the companion mirrors this L3 state.
  wsApp.sendAppState({ screen: 'artist', artist: artist, profile: profile });

  document.getElementById('btn-play').addEventListener('click', playArtist);
  document.getElementById('btn-shuffle').addEventListener('click', shuffleArtist);
  document.addEventListener('keydown', dispatchKey);

  initPage({
    onEnter: focusFirstGridTile,
    keys: {
      ArrowLeft:  gridArrow,
      ArrowRight: gridArrow,
      ArrowUp:    gridArrow,
      ArrowDown:  gridArrow,
      Escape:     goBack,
      Backspace:  goBack
    },
    remote: {}
  });

  Promise.all([
    loadBrowse(SERVER, profile),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; })
  ])
    .then(function(res) {
      var browse = res[0];
      var cw = [res[1].content].filter(Boolean).concat([[]])[0];
      var cards = [browse.content].filter(Boolean).concat([[]])[0];
      var albums = albumsByArtist(cards, artist);
      albums.forEach(function(c) { catalog[c.id] = c; });
      document.getElementById('grid-title').textContent = artist;
      mountBreadcrumb('breadcrumb', buildCrumbs('artist', { artistName: artist }));
      renderGrid(SERVER, albums, progressMapFromCW(cw), onSelect);
      focusFirstGridTile();
    })
    .catch(function() { navTo('error.html'); });
}
