import { getProfile, getPerson, getParam, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { browseArrow, renderBrowse, getActiveTab } from './screen-browse.js';
import { connectApp } from '../../core/app-ws.js';
import { loadBrowse, loadContinueWatching, loadConfig, loadQueuePlayback, loadPlayback, loadTracks, loadEpisodes } from '../../core/app-api.js';
import { queueAdd, queueAddStatus, SECTION_MEDIA_TYPE } from '../../core/queue-shell-config.js';
import { parseConfig, badgePerson } from '../../core/profile-config.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { cardRoute, sectionOf, artistTiles } from '../../core/home-rails.js';
import { mountSearch } from './screen-search.js';
import { queueCount } from '../../core/queue-playback-router.js';
import { playNextCount } from '../../core/queue-view.js';
import { mountBreadcrumb } from './breadcrumb.js';

// Backend = page origin, not a hardcoded host (BUG-009 — see screen-video-page).
var SERVER = window.location.origin;
var LAST_TILE_KEY = 'grew-tv:last-tile';
var LAST_TAB_KEY = 'grew-tv:last-tab';
var ACTIVATE_KEYS = { Enter: true, ' ': true };

export function initBrowsePage() {
  // FEAT-040 Play Queue / TASK-259: the bottom-right shows TWO adjacent icon+count
  // buttons — 🎬 video, 🎵 music — each appearing only when ITS OWN override queue
  // is non-empty; each drives its persistent player to start the queue head
  // (?playQueue). The icon+`(N)` style matches the companion (TASK-258). Counts read
  // from the read-only playback snapshots, refreshed on load (+ the video one after
  // queueing a film here). Before this the music queue was unreachable from browse.
  //
  // TASK-517 — 🎬 counts the FILM queue on the unified engine, which is the
  // queue every ＋ here has actually filled since TASK-503. It read the old
  // video engine's queue until now, so the pill sat hidden on an empty count
  // while films piled up in the queue it wasn't looking at.
  function showPlayQueue(count) {
    var btn = document.getElementById('btn-play-queue');
    btn.textContent = '🎬 (' + count + ')';
    btn.style.display = ({ 'true': 'inline-block', 'false': 'none' })[(count > 0) + ''];
  }
  function refreshQueue() {
    loadQueuePlayback(SERVER, 'film', getPerson()).then(function(snap) { showPlayQueue(queueCount(snap)); }).catch(function() {});
  }
  function onPlayQueue() { navTo('video.html', { playQueue: 1, from: 'browse' }); }

  // The MUSIC twin, sitting beside the video button. Count read from the read-only
  // GET /api/playback snapshot (music override queue = play_next, via playNextCount);
  // tapping starts the music queue head (audio.html?playQueue, the TASK-255 entry).
  function showPlayQueueMusic(count) {
    var btn = document.getElementById('btn-play-queue-music');
    btn.textContent = '🎵 (' + count + ')';
    btn.style.display = ({ 'true': 'inline-block', 'false': 'none' })[(count > 0) + ''];
  }
  function refreshQueueMusic() {
    loadPlayback(SERVER, getPerson()).then(function(snap) { showPlayQueueMusic(playNextCount(snap)); }).catch(function() {});
  }
  function onPlayQueueMusic() { navTo('audio.html', { playQueue: 1, from: 'browse' }); }

  // TASK-445 — Play All: a whole-catalog "play everything of this type"
  // control, shown only on a tab that has one. Keyed by tab id, no branch.
  // renderBrowse's onTabChange fires this on every tab select, including the
  // initial one. TASK-446 (owner correction): ONE entry point, always
  // unshuffled — shuffle is a live toggle inside the player's Queue View
  // (core/video-queue-view.js), matching every other media source's shuffle
  // UX, not a second pre-entry button. TASK-486 drops 'home-movies' from this
  // map — its whole-catalog entry point is now the Play All rail's own "All"
  // tile (home-rails.js homeMoviesPlayAllRail), replacing this header button
  // for that tab; Music Videos keeps the header button as-is.
  var PLAY_ALL_PARAMS = { 'music-videos': { musicVideoAll: 1 } };
  function showPlayAll(tabId) {
    var btn = document.getElementById('btn-play-all');
    btn.style.display = ({ 'true': 'inline-block', 'false': 'none' })[!!PLAY_ALL_PARAMS[tabId] + ''];
  }
  function onPlayAll() {
    [PLAY_ALL_PARAMS[getActiveTab()]].filter(Boolean)
      .forEach(function(params) { navTo('video.html', Object.assign({ from: 'browse' }, params)); });
  }

  // Transient ＋Queue confirmation toast (films queued from a tile badge).
  var statusTimer = null;
  function hideStatus() { document.getElementById('queue-status').style.display = 'none'; }
  function showStatus(text) {
    var el = document.getElementById('queue-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(hideStatus, 2500);
  }
  // ＋Queue producer. TASK-516 drops this screen's own dispatch table for
  // queue-shell-config.js's single routing map: cardRoute() collapses a film
  // and a home-movie card to the same 'video' nav route, so the card's SECTION
  // is what names its media type, and queueAdd() takes it from there. A home
  // movie now reaches the same TASK-498 unified engine its player reads
  // (/api/queue/home-movie) instead of the old video-playback engine, which
  // nothing has read since TASK-499 — a home-movie ＋Queue silently queued to
  // nothing. The confirmation is the config's own wording, so it stays honest
  // per type: appended to a queue, or queued to play next.
  // TASK-517 — the 🎬 pill counts the same film queue this ＋ feeds again, so
  // a queue press refreshes it: queue a film and the pill appears (or its
  // count climbs) without a page reload, as it did before TASK-503 split the
  // two apart. A press on another media type re-reads a count that has not
  // moved, which is cheaper than a branch to decide it.
  function onQueue(card) {
    var mediaType = SECTION_MEDIA_TYPE[sectionOf(card)];
    queueAdd(SERVER, mediaType, getPerson(), card.id)
      .then(function() { showStatus(queueAddStatus(mediaType)); refreshQueue(); })
      .catch(function() {});
  }

  // BUG-007: the top-right profile control returns to the picker. Activating it
  // navigates the TV to profile.html, whose own load pushes the `profile`
  // context so the companion follows. Re-entering a locked profile re-runs the
  // PIN gate there — no silent re-entry.
  function goToProfile() {
    var t = switchProfileTarget();
    navTo(t.page, t.params);
  }

  var profileLabel = document.getElementById('profile-label');
  profileLabel.addEventListener('click', goToProfile);
  profileLabel.addEventListener('keydown', function(e) {
    [ACTIVATE_KEYS[e.key]].filter(Boolean).forEach(function() { e.preventDefault(); goToProfile(); });
  });

  document.getElementById('btn-play-queue').addEventListener('click', onPlayQueue);
  document.getElementById('btn-play-queue-music').addEventListener('click', onPlayQueueMusic);
  document.getElementById('btn-play-all').addEventListener('click', onPlayAll);
  document.addEventListener('keydown', dispatchKey);
  mountBreadcrumb('breadcrumb', buildCrumbs('browse'));

  initPage({
    onEnter: function() { [document.querySelector('.rail-row .film-tile')].filter(Boolean).forEach(function(t) { t.focus(); }); },
    keys: { ArrowLeft: browseArrow, ArrowRight: browseArrow, ArrowUp: browseArrow, ArrowDown: browseArrow },
    remote: {}
  });

  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];

  // id -> browse card, filled once /api/browse resolves (below). The companion's
  // `select` intent carries only an id, and its tab is decoupled from the app's
  // (the app renders one tab at a time), so the chosen tile is often absent from
  // the live DOM. Resolve against the full catalog instead of a rendered tile —
  // BUG-008: the old querySelector + activeElement.click() fallback re-opened the
  // focused (last-watched) tile whenever the target tile wasn't on the active tab.
  var catalog = {};

  // FEAT-048 (TASK-324) — the search overlay reads the live browse cards (Videos +
  // the album/artist derivations), the /api/tracks index (Music tracks) and the
  // /api/episodes index (TASK-368, Videos EPISODE hits); all three fill after
  // load, so the overlay pulls them through getters. A result tap reuses
  // onSelect (cardRoute routing), so search jumps go exactly where a tile tap does.
  var searchCards = [];
  var searchTracks = [];
  var searchEpisodes = [];
  mountSearch({
    server: SERVER,
    getVideoCards: function() { return searchCards; },
    getTracks: function() { return searchTracks; },
    getEpisodes: function() { return searchEpisodes; },
    onSelect: function(card) { onSelect(card); }
  });
  loadTracks(SERVER).then(function(t) { searchTracks = [t].filter(Array.isArray).concat([[]])[0]; }).catch(function() {});
  // Episodes are not browse cards (bound types stay collection-only), so a
  // companion `select` on an EPISODE search hit needs its own minimal video
  // card registered here too — same reason CW episode rows are registered below.
  loadEpisodes(SERVER).then(function(eps) {
    searchEpisodes = [eps].filter(Array.isArray).concat([[]])[0];
    searchEpisodes.forEach(function(e) { catalog[e.id] = { kind: 'video', id: e.id, series: e.series_id }; });
  }).catch(function() {});

  // TASK-330 — cross the TV to an external destination on a companion tap. The atlas
  // (or any config destination) is a separate LAN app; navigating there is a page
  // teleport, so a down destination fails in the browser AFTER we've left — grew-tv
  // itself never touches the destination at render, so it can't crash it. The TV has
  // no Atlas button of its own; it only RECEIVES the launchExternal intent (below).
  function crossExternal(url) { window.location.assign(url); }

  var wsApp = connectApp(window.location.origin, function(intent, params) {
    var INTENTS = {
      navigate_up:    function() { browseArrow({ key: 'ArrowUp',    preventDefault: function() {} }); },
      navigate_down:  function() { browseArrow({ key: 'ArrowDown',  preventDefault: function() {} }); },
      navigate_left:  function() { browseArrow({ key: 'ArrowLeft',  preventDefault: function() {} }); },
      navigate_right: function() { browseArrow({ key: 'ArrowRight', preventDefault: function() {} }); },
      select:         function() {
        var id = [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)[0];
        [catalog[id]].filter(Boolean).forEach(onSelect);
      },
      // A launchExternal intent from the companion crosses the TV to the carried
      // tvUrl (Story 2, TV half). Guarded so a params-less intent is a no-op, not a
      // throw (BUG-009 pattern).
      launchExternal: function() {
        [params].filter(Boolean).map(function(p) { return p.tvUrl; }).filter(Boolean).forEach(crossExternal);
      },
      back:           function() { navTo('profile.html'); },
      navigate:       function() { navTo(params.page, params.params); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'browse' });
  // Tell the companion the app is on Home (drives its catalog context + profile).
  wsApp.sendAppState({ screen: 'home', profile: profile });

  // A video card plays directly; a series card opens its detail screen. Music
  // (FEAT-027) routes by section: a 'music' card (album/playlist) opens the album
  // detail.
  // A video card carries `series` (its owning collection) when it is a series
  // episode — a Continue Watching tile (BUG-005). Threading it lets the player
  // resolve series context and run Next/Prev even though the episode was opened
  // from a tile, not the series detail. A standalone film has no `series`; navTo
  // drops the undefined param so it stays seriesless.
  // FEAT-039 (TASK-235): new-playlist creation moved off a rail tile onto the
  // Playlists rail-heading ＋ (createPlaylist below, passed to renderBrowse) — so
  // there is no 'create-playlist' select route any more. TASK-378: the same ＋ now
  // also lives on the Music Videos tab's Playlists rail — the collectionType the
  // new playlist gets follows which tab it was opened from (undefined on Music
  // falls through to the create page's own 'playlist' default).
  var COLLECTION_TYPE_BY_TAB = { 'music-videos': 'music-video-playlist' };
  function createPlaylist() { navTo('playlist-create.html', { collectionType: COLLECTION_TYPE_BY_TAB[getActiveTab()] }); }
  // @card-route-table
  var SELECT = {
    artist:   function(card) { navTo('artist.html', { artist: card.artist }); },
    album:    function(card) { navTo('album-detail.html', { album: card.id }); },
    playlist: function(card) { navTo('playlist-detail.html', { playlist: card.id }); },
    video:    function(card) { navTo('video.html', { video: card.id, from: 'browse', series: card.series }); },
    series:   function(card) { navTo('detail.html', { series: card.id }); },
    // TASK-324 search: a TRACK opens its album's player STARTED on that song
    // (audio.html fires play-source album -> play-track). Only search emits a
    // kind:'track' card; a browse tile never does.
    track:    function(card) { navTo('audio.html', { album: card.album, track: card.id, from: 'browse' }); },
    // TASK-373/374: a lone music-video item plays through its own client-owned
    // playthrough (never the plain 'video' route's server engine). A music-
    // video playlist card routes through 'playlist' like any other playlist
    // (TASK-376) — see playlist-detail for how a music-video track plays.
    'music-video': function(card) { navTo('video.html', { musicVideo: card.id, from: 'browse' }); },
    // TASK-486 (revision) — a Play All rail tile (All or a kid) opens the
    // scoped clip LIST first, like a boxset/series (detail.html's own
    // 'series' route above), not playback directly. navParams carries the
    // exact home-movies-list.html query params (home-rails.js playAllTile);
    // this route is a plain lookup, no branch, same shape as every other
    // entry here.
    'play-all': function(card) { navTo('home-movies-list.html', Object.assign({ from: 'browse' }, card.navParams)); }
  };

  // cardRoute (core) gives 'album' for a music card else the card's kind;
  // [value].filter(Boolean) guards an unknown route as a no-op rather than a throw.
  function onSelect(card) {
    sessionStorage.setItem(LAST_TILE_KEY, card.id);
    sessionStorage.setItem(LAST_TAB_KEY, getActiveTab());
    [SELECT[cardRoute(card)]].filter(Boolean).forEach(function(fn) { fn(card); });
  }

  Promise.all([
    loadBrowse(SERVER, profile),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; }),
    loadConfig(SERVER).catch(function() { return null; })
  ])
    .then(function(res) {
      var browse = res[0];
      var cw = [res[1].content].filter(Boolean).concat([[]])[0];
      // FEAT-045/TASK-318: the Music tab's Recently Played rail rides the same
      // /api/continue-watching response (TASK-317 serves `recents` there).
      var recents = [res[1].recents].filter(Boolean).concat([[]])[0];
      // FEAT-033: badge the bar with the active person's authored name + glyph
      // (e.g. "🦖 Daddy"); falls back to the profile class if config/id is absent.
      var person = badgePerson(parseConfig(res[2]), getPerson(), profile);
      searchCards = [browse.content].filter(Boolean).concat([[]])[0];
      searchCards.forEach(function(c) { catalog[c.id] = c; });
      // Register the synthesized Artists rail tiles so a companion `select` on an
      // artist (search result or Artists rail) resolves on the TV (their id is
      // 'artist:Name', absent from browse.content) — TASK-324.
      artistTiles(searchCards).forEach(function(t) { catalog[t.id] = t; });
      // Register CW items so a companion `select` on an in-progress tile resolves —
      // episodes are not browse cards, so add a minimal video card for any id the
      // browse catalog doesn't already hold (films keep their full browse card).
      cw.forEach(function(r) { catalog[r.item_id] = [catalog[r.item_id]].filter(Boolean).concat([{ kind: 'video', id: r.item_id, series: r.collection_id }])[0]; });
      var labels = [browse.genreLabels].filter(Boolean).concat([{}])[0];
      // A deep-link / breadcrumb ?tab= (FEAT-028 rail-grid section crumb) wins
      // over the last-visited tab; renderBrowse falls back when neither matches.
      var initialTab = [getParam('tab')].filter(Boolean).concat([sessionStorage.getItem(LAST_TAB_KEY)]).filter(Boolean)[0];
      renderBrowse(SERVER, browse.content, cw, labels, profile, person, onSelect, initialTab, onQueue, createPlaylist, recents, showPlayAll);
      [sessionStorage.getItem(LAST_TILE_KEY)].filter(Boolean).map(function(id) { return document.querySelector('.film-tile[data-id="' + id + '"]'); }).filter(Boolean).forEach(function(t) { t.focus(); });
      refreshQueue();
      refreshQueueMusic();
    })
    .catch(function() { navTo('error.html'); });
}
