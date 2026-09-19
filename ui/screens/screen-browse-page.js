import { getProfile, getPerson, getParam, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { pressFocusedPlus } from './context-press.js';
import { browseArrow, browseHome, renderBrowse, getActiveTab, updateChannels, menuStops } from './screen-browse.js';
import { connectApp } from '../../core/app-ws.js';
import { loadBrowse, loadContinueWatching, loadConfig, loadTracks, loadEpisodes, loadChannels } from '../../core/app-api.js';
import { queueAdd, queueAddStatus, itemMediaType } from '../../core/queue-shell-config.js';
import { parseConfig, badgePerson } from '../../core/profile-config.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { cardRoute, artistTiles, channelRails } from '../../core/home-rails.js';
import { CHANNELS_TAB } from '../../core/channels.js';
import { mountSearch } from './screen-search.js';
import { mountContinueMenu } from './continue-menu.js';
import { continueTarget } from '../../core/browse-continue.js';
import { mountBreadcrumb } from './breadcrumb.js';
import { helpCard } from './help-card.js';

// Backend = page origin, not a hardcoded host (BUG-009 — see screen-video-page).
var SERVER = window.location.origin;
var LAST_TILE_KEY = 'grew-tv:last-tile';
var LAST_TAB_KEY = 'grew-tv:last-tab';
var ACTIVATE_KEYS = { Enter: true, ' ': true };

function noop() {}

export function initBrowsePage() {
  // TASK-501 (FEAT-497) — Continue, one button per media type, in a play menu
  // behind the bottom-right ▶ icon (the shape the companion has carried since
  // TASK-445, now the TV's too — owner's call: four Continue buttons would
  // otherwise make that floating row six wide). Replaces FEAT-040/TASK-259's
  // two 🎬/🎵 play-the-queue pills, which covered two of the four types, hid
  // themselves at an empty queue, and STARTED a queue rather than carrying on.
  //
  // A press carries on with that type — the front of its queue, else the next
  // item of the source it was last playing. Both halves are the engine's own
  // advance(), fired by the player's continue entry; browse itself does no
  // queue maths, and the buttons come out of one shared builder the companion
  // uses too (ui/screens/continue-menu.js).
  var continueMenu = mountContinueMenu({
    mount: document.getElementById('queue-menu'),
    server: SERVER,
    getPerson: getPerson,
    onContinue: function(mediaType) {
      var t = continueTarget(mediaType);
      navTo(t.page, t.params);
    }
  });
  // TASK-595 (FEAT-526) — the menu is opened, walked and closed like an overlay.
  // It only ever toggled a class: no focus went into it and nothing but a second
  // click closed it, so from the couch it was a menu you could open and then be
  // stranded in.
  //
  // Opening lands on the first button that has something to play (menuStops
  // skips the dimmed Continue buttons and the per-tab hidden Play All), and
  // closing hands focus back to the ▶ that opened it, so the cluster walk picks
  // up exactly where it was. A menu with no live button at all keeps focus on ▶
  // rather than putting it somewhere a press would do nothing.
  function queueMenuEl() { return document.getElementById('queue-menu'); }
  function queueMenuBtn() { return document.getElementById('btn-queue-menu'); }
  function queueMenuOpen() { return queueMenuEl().classList.contains('open'); }
  // Where the burger hands focus back to when it closes the menu. Every open
  // resets it to ▶, so a menu opened with OK and closed with the burger lands
  // on ▶, never on a tile left over from an earlier burger press.
  var menuOrigin = null;
  function openQueueMenu() {
    menuOrigin = queueMenuBtn();
    queueMenuEl().classList.add('open');
    [menuStops()[0]].filter(Boolean).forEach(function(b) { b.focus(); });
  }
  function closeQueueMenu() {
    queueMenuEl().classList.remove('open');
    document.getElementById('btn-queue-menu').focus();
  }
  var MENU_TOGGLE = { 'true': closeQueueMenu, 'false': openQueueMenu };
  function toggleQueueMenu() { MENU_TOGGLE[queueMenuOpen() + ''](); }

  // TASK-637 (FEAT-526) — the burger opens and closes the ▶ play menu, so
  // carrying on from the couch is one press. It is a click on the ▶ already
  // drawn, so the menu's own open and focus (TASK-595) stay the menu's. Focus
  // moves to ▶ first, so a menu with nothing live to focus leaves it on ▶ —
  // never on the tile, where + would add what sits behind the menu. Closing
  // hands focus back to where the burger was pressed from, not to ▶.
  //
  // Search stops every key at its panel, so the burger never reaches here while
  // Search is open.
  var BURGER = {
    'false': function() {
      var from = document.activeElement;
      queueMenuBtn().focus();
      queueMenuBtn().click();
      menuOrigin = from;
    },
    'true': function() {
      var back = menuOrigin;
      queueMenuBtn().click();
      back.focus();
    }
  };
  function burgerPlayMenu(e) {
    e.preventDefault();
    BURGER[queueMenuOpen() + '']();
  }

  // Home closes it, the way Home closes Search and the Queue overlay. Scoped to
  // the menu's own mount and live only while the menu is open, and it stops the
  // press there: browse's own Home (TASK-594, browseHome) steps up to the section
  // tab, and one press must close the menu without also making that step.
  var CLOSE_KEYS = { Escape: true };
  var MENU_CLOSE = { 'true': function(e) { e.stopPropagation(); closeQueueMenu(); }, 'false': noop };
  function onQueueMenuKey(e) {
    [CLOSE_KEYS[e.key]].filter(Boolean).forEach(function() { MENU_CLOSE[queueMenuOpen() + ''](e); });
  }

  // TASK-445 — Play All: a whole-catalog "play everything of this type"
  // control, shown only on a tab that has one. Keyed by tab id, no branch.
  // renderBrowse's onTabChange fires this on every tab select, including the
  // initial one. TASK-446 (owner correction): ONE entry point, always
  // unshuffled — shuffle is a live toggle inside the player's Queue View
  // (core/queue-shell-view.js), matching every other media source's shuffle
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

  // TASK-590 — the Guide's entry point on the TV: a floating button in the
  // bottom-right cluster, beside Search and the play menu, NOT a tile in the
  // strip (owner, 2026-09-08). A strip of channels is a strip of things that are
  // ON; a tile among them that is not a channel reads as one until it is pressed.
  //
  // Shown only on the Channels tab, the same way Play All is shown only on a tab
  // that has one — this cluster is where a tab-scoped control belongs, and a
  // Guide button over the Music tab would be furniture for a feature that tab
  // has nothing to do with. A profile with no channels never sees the tab at all
  // (story 6 of TASK-563), so it never sees the button either.
  //
  // It carries no id and no channel: the Guide asks the endpoint for every
  // channel this profile can see, exactly as the strip behind it does.
  function showGuide(tabId) {
    var btn = document.getElementById('btn-guide');
    btn.style.display = ({ 'true': 'inline-flex', 'false': 'none' })[(tabId === CHANNELS_TAB.id) + ''];
  }
  function onGuide() { navTo('guide.html'); }

  // One callback is what renderBrowse takes, so the two tab-scoped controls are
  // applied together rather than the screen learning about either of them.
  function onTabChange(tabId) {
    showPlayAll(tabId);
    showGuide(tabId);
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
  // queue-shell-config.js's single routing map. BUG-531: the media type comes
  // from the CARD's own itemType, not its browse section — sectionOf() falls
  // back to 'films' for a card carrying no section, which quietly filed such a
  // press under Films. Only a `kind: 'video'` card gets a ＋ at all
  // (core/tile-model.js), and every one of those carries its itemType. A home
  // movie reaches the same TASK-498 unified engine its player reads
  // (/api/queue/home-movie) instead of the old video-playback engine, which
  // nothing has read since TASK-499 — a home-movie ＋Queue silently queued to
  // nothing. The confirmation is the config's own wording, so it stays honest
  // per type: appended to a queue, or queued to play next.
  // TASK-501 — a ＋ press refreshes the Continue cluster, so queueing the first
  // thing of a type wakes that type's button without a reload (the 🎬 pill's
  // own TASK-517 behaviour, now across all four). Refreshing every type re-reads
  // three snapshots that have not moved, which is cheaper than a branch.
  function onQueue(card) {
    var mediaType = itemMediaType(card.itemType);
    queueAdd(SERVER, mediaType, getPerson(), card.id)
      .then(function() { showStatus(queueAddStatus(mediaType)); continueMenu.refresh(); })
      .catch(function() { showStatus('Could not queue.'); });
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

  document.getElementById('btn-queue-menu').addEventListener('click', toggleQueueMenu);
  document.getElementById('queue-menu-mount').addEventListener('keydown', onQueueMenuKey);
  document.getElementById('btn-play-all').addEventListener('click', onPlayAll);
  document.getElementById('btn-guide').addEventListener('click', onGuide);
  document.addEventListener('keydown', dispatchKey);
  mountBreadcrumb('breadcrumb', buildCrumbs('browse'));

  // TASK-633 — Search is a surface of its own over browse, so the Info card
  // reads its row while the panel is open.
  var HELP_SURFACE = { 'true': 'search', 'false': 'browse' };
  function helpSurface() { return HELP_SURFACE[document.getElementById('search-panel').classList.contains('open') + '']; }

  initPage({
    onEnter: function() { [document.querySelector('.rail-row .film-tile')].filter(Boolean).forEach(function(t) { t.focus(); }); },
    keys: { ArrowLeft: browseArrow, ArrowRight: browseArrow, ArrowUp: browseArrow, ArrowDown: browseArrow, Escape: browseHome, '=': pressFocusedPlus, c: burgerPlayMenu },
    remote: {},
    help: helpSurface,
    card: helpCard
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
    // TASK-542: `collectionType` rides beside the collection id (a CW episode
    // tile, a search episode hit) so the player opens the right queue; a
    // standalone film card carries neither and navTo drops both.
    video:    function(card) { navTo('video.html', { video: card.id, from: 'browse', series: card.series, collectionType: card.collectionType }); },
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
    'play-all': function(card) { navTo('home-movies-list.html', Object.assign({ from: 'browse' }, card.navParams)); },
    // FEAT-560/TASK-564 — picking a channel tunes the player into it.
    // `navParams` (core/channels.js) carries the channel id and nothing else:
    // the player asks the endpoint itself where the channel has got to, so a
    // position that was true when this card was drawn can never be handed on
    // through a URL and played as if it were still true.
    //
    // An OFF-AIR channel goes nowhere. Its card already says "Off air" and when
    // the channel is back, so the press has nothing to add and a player with
    // nothing to play would only bounce the viewer straight back. The card
    // between items, which is what will eventually fill dead air, is TASK-565.
    channel: function(card) { CHANNEL_PRESS[!!card.line.on_air + ''](card); }
  };
  var CHANNEL_PRESS = {
    'true':  function(card) { navTo('video.html', Object.assign({ from: 'browse' }, card.navParams)); },
    'false': noop
  };

  // cardRoute (core) gives 'album' for a music card else the card's kind;
  // [value].filter(Boolean) guards an unknown route as a no-op rather than a throw.
  function onSelect(card) {
    sessionStorage.setItem(LAST_TILE_KEY, card.id);
    sessionStorage.setItem(LAST_TAB_KEY, getActiveTab());
    [SELECT[cardRoute(card)]].filter(Boolean).forEach(function(fn) { fn(card); });
  }

  // FEAT-560/TASK-563 — the Channels strip. Its own poll, because a channel is a
  // clock: the per-second tick inside screen-browse moves a card's position, but
  // only a re-read rolls it on to the next programme entry when an item ends.
  // Thirty seconds is well inside the shortest thing the library airs (a
  // sub-minute home movie is not channel material; the shortest real pool item
  // is a 7-minute Hey Duggee), so a card is never more than half a minute behind
  // what is actually on.
  //
  // A failed poll leaves the last good strip on screen and lets the next one try
  // — the tab going blank because one request lost the LAN is worse than a card
  // that is thirty seconds stale.
  var CHANNEL_POLL_MS = 30000;
  // TASK-564 — a channel tile has to be in the catalog like every other card the
  // companion can press: the phone's tap carries an id and the TV resolves it
  // here, and a channel tile is not a browse card so nothing else registers one.
  // Re-registered on every poll rather than once, because the LINE is what a
  // press reads (whether the channel is on air, above), and that goes stale in
  // exactly the thirty seconds the poll exists to close.
  function registerChannels(lines) {
    channelRails(lines).forEach(function(rail) {
      rail.items.forEach(function(tile) { catalog[tile.id] = tile; });
    });
  }
  function applyChannels(lines) {
    registerChannels(lines);
    updateChannels(lines);
  }
  function pollChannels() {
    loadChannels(SERVER, profile)
      .then(function(res) { applyChannels([res.channels].filter(Boolean).concat([[]])[0]); })
      .catch(function() {});
  }

  Promise.all([
    loadBrowse(SERVER, profile),
    loadContinueWatching(SERVER, profile, getPerson()).catch(function() { return { content: [] }; }),
    loadConfig(SERVER).catch(function() { return null; }),
    // Story 6 — no channels is a normal answer, and so is a backend too old to
    // serve the route: browse falls back to the tab it used to land on and shows
    // no Channels tab, rather than failing the whole page over a strip.
    loadChannels(SERVER, profile).catch(function() { return { channels: [] }; })
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
      // A deep-link / breadcrumb ?tab= (FEAT-028 rail-grid section crumb) and the
      // last-visited tab now go to core's landingTab separately, because Channels
      // sits between them: an explicit crumb still wins, but "opening the TV shows
      // what's on" (decision 10) outranks a remembered tab.
      var channels = [res[3].channels].filter(Boolean).concat([[]])[0];
      registerChannels(channels);
      renderBrowse(SERVER, browse.content, cw, labels, profile, person, onSelect, getParam('tab'), onQueue, createPlaylist, recents, onTabChange, channels, sessionStorage.getItem(LAST_TAB_KEY));
      [sessionStorage.getItem(LAST_TILE_KEY)].filter(Boolean).map(function(id) { return document.querySelector('.film-tile[data-id="' + id + '"]'); }).filter(Boolean).forEach(function(t) { t.focus(); });
      continueMenu.refresh();
      setInterval(pollChannels, CHANNEL_POLL_MS);
    })
    .catch(function() { navTo('error.html'); });
}
