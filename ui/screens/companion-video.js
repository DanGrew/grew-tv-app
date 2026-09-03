import { connect } from '../../core/companion-ws.js';
import { loadSeries, videoPlaybackAction, queuePlaybackAction, loadBrowse, addToPlaylist } from '../../core/app-api.js';
import { screenPage, displayTitle, seriesIdFromSnap, queryString } from '../../core/companion-utils.js';
import { nowPlaying, upNextLine, seriesMode } from '../../core/video-player-router.js';
import { fmt } from '../../core/time.js';
import { percent } from '../../core/progress.js';
import { buildCrumbs, trailCrumbs, playerCrumbs } from '../../core/breadcrumb.js';
import { trimOnCrumb, entries as entriesTrail } from '../../core/nav-trail.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { nightLabel, isNightOn } from '../../core/night-mode.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';
import { mountStatusMenu } from './companion-status-menu.js';

// Companion player transport (FEAT-017 + FEAT-037/TASK-223). Two planes, by
// design. PLANE B — server-authoritative engine: prev/next/repeat/shuffle POST
// straight to the active person's engine (series/single film -> TASK-503's
// /api/queue/film, the browse "Play Queue" entry only -> the OLD
// /api/video-playback, a home movie -> /api/queue/home-movie, a music video ->
// /api/music-video-playback, BUG-485) — the server advances it and broadcasts
// the resolved snapshot, which repaints BOTH surfaces, so a media change the
// companion drives swaps the TV in place, no forced reload. Now-playing /
// up-next / the pills' on/off state still ride the TV's own `context` push
// (onVideoContext below), not a direct snapshot read here, for every mode
// except 'video'/legacy-queue (the one mode still reading the old engine's
// own broadcast, onVideoPlayback below) — unchanged plumbing, now reflecting
// the engine's truth for a film too instead of a second read of a snapshot
// this page no longer drives that engine to produce. PLANE A — the legacy WS
// intent rail still carries play/pause, graduated skip, captions, volume and
// reset (the <video>'s own transport has no server action); the progress bar
// is interpolated locally between 1 Hz app_state snapshots. No scrub — seek
// is a relative skip(deltaSec).
var JUMP = [
  { d: -10, label: '-10s' }, { d: -30, label: '-30s' }, { d: -120, label: '-2m' }, { d: -600, label: '-10m' }, { d: -1800, label: '-30m' },
  { d: 10, label: '+10s' }, { d: 30, label: '+30s' }, { d: 120, label: '+2m' }, { d: 600, label: '+10m' }, { d: 1800, label: '+30m' }
];
var PLAY_ICON = { 'true': '⏸', 'false': '▶' };
// TASK-488: read by companion-quick-pause.js by name, not import — matches how
// core/companion-ws.js's TARGET_KEY is already read there (that page opens no
// connection, so pulling in either module would be the wrong coupling).
var QP_SOURCE_KEY = 'grew-tv-quickpause-source';

export function initPage() {
  mountStatusMenu(['mode', 'screen', 'profile']);
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    title: document.getElementById('now-title'),
    barFill: document.getElementById('bar-fill'),
    time: document.getElementById('time'),
    toggle: document.getElementById('c-toggle'),
    cc: document.getElementById('c-cc'),
    repeat: document.getElementById('c-repeat'),
    shuffle: document.getElementById('c-shuffle'),
    prev: document.getElementById('c-prev'),
    next: document.getElementById('c-next'),
    jump: document.getElementById('jump'),
    upnext: document.getElementById('upnext'),
    reset: document.getElementById('c-reset'),
    night: document.getElementById('c-night'),
    queue: document.getElementById('c-queue'),
    addPlaylist: document.getElementById('c-add-playlist')
  };
  var state = { snap: null, vsnap: null, person: null, loadedSeriesId: null, musicVideo: false, homeMovie: false, film: false, series: false, itemId: null, profile: null, crumb: { seriesId: null, seriesTitle: null, videoTitle: '', mvSource: null } };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }
  // FEAT-038 (TASK-230): the switch ONLY changes mode (consistent everywhere).
  // BROWSE greys the transport in place (body.browsing); reach the library via
  // the breadcrumb (local-nav while desynced). CONTROL reloads (reconnect).
  function reSync() { window.location.reload(); }
  function applyMode() { document.body.classList.toggle('browsing', mode.isDesynced()); }
  function onModeChange(browsing) { ({ true: applyMode, false: reSync })[browsing](); }

  // Breadcrumb trail (FEAT-021 / BUG-037): Home > Series > Episode for a series;
  // film: Home > Grid > Title (from the FEAT-032 nav-trail); Home > Title only on
  // deep-link. Ancestor crumbs send the `navigate` intent — the app teleports the
  // TV and echoes context back, which onContext follows. The episode/film title
  // arrives in the WS context; the series id/title are derived from the app_state
  // snapshot (itemId is the series for an episode, the video itself for a film) and
  // the series title is fetched once, mirroring the detail screen. A film has no
  // seriesId, so it reads the recorded genre-grid entry off the nav-trail (the
  // same retrace companion-artist builds) rather than collapsing to Home > Title.
  // Browse mode: crumb is a local hop (reach the library without driving the TV).
  function railEntry() {
    return entriesTrail().filter(function(e) { return e.page === 'browse.html'; }).slice(-1)[0];
  }
  // TASK-422: a music-video source crumb carries TV detail-page names (for the
  // navigate intent); translate the one that isn't co-named on the companion
  // (playlist-detail.html — companion's own is playlist.html?id=), mirroring
  // companion-audio.js's own LOCAL_PAGE (BUG-044). artist.html needs no
  // translation — the companion's own page shares the name and param.
  var LOCAL_PAGE = {
    'playlist-detail.html': function(p) { return { page: 'playlist.html', params: { id: p.playlist } }; }
  };
  function localGo(page, params) {
    var t = [LOCAL_PAGE[page]].filter(Boolean).map(function(fn) { return fn(params); }).concat([{ page: page, params: params }])[0];
    window.location.href = t.page + queryString(t.params);
  }
  function navigate(page, params) {
    // Trim the trail to the clicked ancestor (Home clears) so a later Back can't
    // retrace past this jump (FEAT-032 stale-Back fix).
    trimOnCrumb(page, params);
    ({ true: function() { localGo(page, params); }, false: function() { api.sendIntent('navigate', { page: page, params: params }); } })[mode.isDesynced()]();
  }
  // Film branch: the recorded genre grid retrace when the nav-trail holds a browse
  // entry, else the minimal deep-link crumb. Series branch: the unchanged
  // Home > Series > Episode. Nested boolean dispatch tables keep both cyclomatic-1.
  function filmCrumbs() {
    return ({ true: trailCrumbs(railEntry(), state.crumb.videoTitle), false: buildCrumbs('video', state.crumb) })[Boolean(railEntry())];
  }
  function seriesCrumbs() { return buildCrumbs('video', state.crumb); }
  var VIDEO_CRUMBS = { true: seriesCrumbs, false: filmCrumbs };
  function nonMvCrumbs() { return VIDEO_CRUMBS[Boolean(state.crumb.seriesId)](); }
  // TASK-422: a music video names its playback source (playlist/artist) instead —
  // mirrors the TV's own playerCrumbs call, off the source the TV pushed on the
  // context (state.crumb.mvSource); null degrades to Home > leaf (story 4).
  function mvCrumbs() { return playerCrumbs(null, state.crumb.mvSource, state.crumb.videoTitle); }
  var CRUMBS_BY_MODE = { true: mvCrumbs, false: nonMvCrumbs };
  function mountVideoCrumbs() {
    mountCompanionBreadcrumb('breadcrumb', CRUMBS_BY_MODE[state.musicVideo](), navigate);
  }
  function loadSeriesTitle(seriesId) {
    loadSeries(server, seriesId)
      .then(function(s) { state.crumb.seriesTitle = s.title; mountVideoCrumbs(); })
      .catch(function() { state.crumb.seriesTitle = 'Series'; mountVideoCrumbs(); });
  }
  function captureSeries(snap) {
    state.crumb.seriesId = seriesIdFromSnap(snap);
    [state.crumb.seriesId].filter(Boolean).filter(function(id) { return id !== state.loadedSeriesId; }).forEach(function(id) {
      state.loadedSeriesId = id;
      loadSeriesTitle(id);
    });
  }

  function buildJump() {
    JUMP.forEach(function(j) {
      var b = document.createElement('button');
      b.className = 'jump-btn';
      b.textContent = j.label;
      b.addEventListener('click', function() { api.skip(j.d); });
      els.jump.appendChild(b);
    });
  }

  // Smooth playhead from the interpolated position (api.position()), not from a
  // raw snapshot — gives a moving bar between 1 Hz heartbeats with no traffic.
  function renderBar() {
    [state.snap].filter(Boolean).forEach(function(s) {
      var pos = api.position();
      els.barFill.style.width = percent(pos, s.durationSec) + '%';
      els.time.textContent = fmt(pos) + ' / ' + fmt([s.durationSec].filter(Boolean).concat([0])[0]);
    });
  }

  // TASK-568 — Night Mode is a PLANE A control: the level lives on the TV (one
  // level for the whole TV, held for its current player page), so the phone
  // never keeps a copy. It renders whatever the app_state snapshot says and
  // sends a press as an intent — which is what makes the two agree within a
  // second whichever surface changed it (stories 2 and 3), by construction
  // rather than by two copies being kept in step. The label itself is
  // core/night-mode.js's own, the same string the TV pill shows.
  function renderControls() {
    [state.snap].filter(Boolean).forEach(function(s) {
      els.toggle.textContent = PLAY_ICON[s.playing + ''];
      els.cc.classList.toggle('on', !!s.captionsOn);
      els.night.textContent = nightLabel(s.nightMode);
      els.night.classList.toggle('on', isNightOn(s.nightMode));
    });
  }

  // PLANE B transport: each fires the same server action the TV player fires
  // (TASK-222 for 'video'/legacy queue mode, TASK-499 for a home movie,
  // TASK-503 for series/single film, TASK-505 for a music video), keyed to the
  // active person — the server advances the engine and broadcasts the resolved
  // snapshot, which repaints BOTH surfaces. All three cut-over types post to
  // the unified engine under their own media type (/api/queue/{type}), never
  // the video-playback one — the channels stay apart the same way the TV
  // player's own ON_NEXT/ON_PREV dispatch does.
  function sendVideoAction(action) { videoPlaybackAction(server, action, state.person).catch(noop); }
  function sendMvAction(action) { queuePlaybackAction(server, 'music-video', action, state.person).catch(noop); }
  function sendHmAction(action) { queuePlaybackAction(server, 'home-movie', action, state.person).catch(noop); }
  function sendFilmAction(action) { queuePlaybackAction(server, 'film', action, state.person).catch(noop); }
  // TASK-542 — a TV series drives its own engine, so the phone posts to
  // /api/queue/series. Sharing the film sender would have left every companion
  // ⏮/⏭/🔀/🔁 advancing the Films queue while the TV played an episode.
  function sendSeriesAction(action) { queuePlaybackAction(server, 'series', action, state.person).catch(noop); }
  // The engines this page can be driving are mutually exclusive for a
  // whole page load (a full navigate per mode, never a live switch) —
  // resolved off the mode flags the context push sets, keyed for every
  // dispatch table below so none of them need a second musicVideo/homeMovie/
  // film/series branch of their own. 'video' (the OLD engine, TASK-221/251) is the
  // fallback: TASK-503 moved series/single onto 'film' — only the browse
  // "Play Queue" entry is left on it (screen-video-page.js's own
  // MODE_ENGINE comment), which the TV signals by leaving `film` false on
  // the context push.
  function engineMode() {
    return [state.musicVideo].filter(Boolean).map(function() { return 'mv'; })
      .concat([state.homeMovie].filter(Boolean).map(function() { return 'hm'; }))
      .concat([state.film].filter(Boolean).map(function() { return 'film'; }))
      .concat([state.series].filter(Boolean).map(function() { return 'series'; }))
      .concat(['video'])[0];
  }
  var PREV_ACTION = { mv: function() { sendMvAction('previous'); }, hm: function() { sendHmAction('previous'); }, film: function() { sendFilmAction('previous'); }, series: function() { sendSeriesAction('previous'); }, video: function() { sendVideoAction('previous'); } };
  var NEXT_ACTION = { mv: function() { sendMvAction('next'); }, hm: function() { sendHmAction('next'); }, film: function() { sendFilmAction('next'); }, series: function() { sendSeriesAction('next'); }, video: function() { sendVideoAction('next'); } };
  // TASK-407/TASK-499/TASK-503/505 — Repeat rides the same Plane B split as
  // prev/next above. Shuffle belongs to the three cut-over types — its button
  // is hidden outright for 'video'/legacy queue mode (applyMusicVideoMode /
  // applyFilmMode never unhide it there), so the `video` branch here is
  // unreachable in practice; kept as a safe no-op rather than an assumption a
  // stray tap can't happen.
  var REPEAT_ACTION = { mv: function() { sendMvAction('toggle-repeat'); }, hm: function() { sendHmAction('toggle-repeat'); }, film: function() { sendFilmAction('toggle-repeat'); }, series: function() { sendSeriesAction('toggle-repeat'); }, video: function() { sendVideoAction('toggle-repeat'); } };
  var SHUFFLE_ACTION = { mv: function() { sendMvAction('toggle-shuffle'); }, hm: function() { sendHmAction('toggle-shuffle'); }, film: function() { sendFilmAction('toggle-shuffle'); }, series: function() { sendSeriesAction('toggle-shuffle'); }, video: function() {} };

  // ── server `video_playback` snapshot -> companion (the now-playing source of
  // truth, mirroring the TV). Now-playing + the breadcrumb leaf, the inline up-next
  // line (wraps to "Start again" under repeat), and the repeat pill all read the
  // snapshot; the ⏮/repeat/⏭ row hides for a single-item source (a standalone film).
  function renderNowFromSnap(snap) {
    [nowPlaying(snap)].filter(Boolean).forEach(function(np) {
      els.ctxLabel.textContent = 'Now playing';
      els.title.textContent = np.title;
      state.crumb.videoTitle = np.title;
      mountVideoCrumbs();
    });
  }
  function renderUpNext(snap) {
    els.upnext.textContent = [upNextLine(snap)].filter(Boolean).map(function(l) { return l.prefix + l.label; }).concat([''])[0];
  }
  function renderRepeat(snap) {
    els.repeat.classList.toggle('on', !!snap.repeat);
  }
  function applySeriesMode(on) {
    els.prev.classList.toggle('single', !on);
    els.next.classList.toggle('single', !on);
    els.repeat.classList.toggle('single', !on);
  }
  function applyVideoPlaybackSnap(snap) {
    renderNowFromSnap(snap);
    renderUpNext(snap);
    renderRepeat(snap);
    applySeriesMode(seriesMode(snap));
  }
  // A music video (TASK-374), a home movie (TASK-499) or a film (TASK-503)
  // never broadcasts a video_playback snapshot, so a push that arrives while
  // one is playing (e.g. a reconnect replay) can only be stale 'video'/
  // legacy-queue-mode state — ignore it entirely rather than let it clobber
  // the title/up-next/repeat this companion is correctly showing for its own
  // engine. TASK-503: film's own title/repeat/shuffle ride the context push
  // instead (onVideoContext below) — this companion mirror accepts the same
  // "Up next" gap TASK-499 already shipped for home movies (no queue_playback
  // subscription here), not a new one.
  var ON_VIDEO_PLAYBACK = { mv: function() {}, hm: function() {}, film: function() {}, video: applyVideoPlaybackSnap };
  function onVideoPlayback(snap) {
    state.vsnap = snap;
    ON_VIDEO_PLAYBACK[engineMode()](snap);
  }

  // The active person rides the app_state (TASK-158); the Plane B POSTs key per
  // person off it, like the companion-audio producer.
  function capturePerson(snap) {
    [snap.person].filter(Boolean).forEach(function(p) { state.person = p; });
  }

  function onAppState(snap) {
    state.snap = snap;
    // TASK-378 — the currently-playing item id + active profile, read straight off
    // the app_state snapshot (screen-video-player's buildSnapshot always carries
    // both); the Add-to-playlist sheet needs them to POST add-track and to
    // profile-filter the offered playlists.
    state.itemId = snap.itemId;
    state.profile = snap.profile;
    capturePerson(snap);
    renderControls();
    renderBar();
    captureSeries(snap);
  }

  // TASK-503/505 — the ONE "disabled but visible" helper both the film and the
  // music-video mirror apply, so the two cannot drift into two dimming rules.
  // Reuses the EXISTING `.single` opacity-dim class (applySeriesMode's own,
  // above) rather than a new one.
  var TRANSPORT_DEFAULT = { previous: false, next: false, shuffle: false, repeat: false };
  function applyControl(el, enabled) {
    el.classList.remove('hidden');
    el.classList.toggle('single', !enabled);
  }
  function applyTransport(transport) {
    var t = [transport].filter(Boolean).concat([TRANSPORT_DEFAULT])[0];
    applyControl(els.repeat, t.repeat);
    applyControl(els.shuffle, t.shuffle);
    applyControl(els.prev, t.previous);
    applyControl(els.next, t.next);
  }
  // TASK-505 — Shuffle/Repeat/⏮/⏭ are ALWAYS shown for a music video now,
  // dimmed when there is nothing to act on rather than hidden
  // (QUEUE-UX-SHELL.md's Hero section). The TV pushes the resolved
  // `musicVideoTransport` off the one shared rule (core/queue-shell-view.js
  // transportState) instead of this page re-deriving a show/hide from a raw
  // multi-item flag — which is exactly what made a lone pick's controls vanish
  // here (story 4), and the same fix TASK-517 already made for films.
  // FEAT-418 (TASK-420): the Queue link stays visible in every mode and
  // repoints instead of hiding (QUEUE_HREF below).
  function applyMusicVideoMode(on, transport) {
    applyEngineMode(on, transport);
    // TASK-378 — Add to playlist is music-video-only: it shows exactly when
    // this mode is on, and hides for every other rail.
    els.addPlaylist.classList.toggle('hidden', !on);
  }
  // Repeat's/Shuffle's on/off state during a music video comes off the
  // context push's own flags (BUG-485: the TV's own music-video engine
  // snapshot, relayed through sendVideoContext — never the video-playback
  // engine's own snapshot; onVideoPlayback already ignores that one outright
  // while state.musicVideo is true, so there is no ordering race with
  // renderRepeat below). Left alone for a film/series, where renderRepeat
  // (off the engine snapshot) is the sole owner of the on/off state.
  var SET_MV_ON = {
    'true': function(payload) {
      els.repeat.classList.toggle('on', !!payload.musicVideoRepeat);
      els.shuffle.classList.toggle('on', !!payload.musicVideoShuffle);
    },
    'false': function() {}
  };
  // TASK-524 — a home movie reads the resolved `homeMovieTransport` off the
  // context push like the other two rails, where it used to un-hide
  // Shuffle/Repeat unconditionally and never dim anything. That was the
  // companion half of the same divergence the TV player row carried: the
  // home-movie Queue hero already applied core/queue-shell-view.js's one
  // transportState rule, so the phone's own row disagreed with the hero right
  // next to it. Their on/off state still rides the per-source flags below
  // (sendVideoContext's homeMovieShuffle/homeMovieRepeat), mirroring SET_MV_ON.
  var SET_HM_ON = {
    'true': function(payload) {
      els.repeat.classList.toggle('on', !!payload.homeMovieRepeat);
      els.shuffle.classList.toggle('on', !!payload.homeMovieShuffle);
    },
    'false': function() {}
  };
  // TASK-503/517/524 — Shuffle/Repeat/⏮/⏭ are ALWAYS shown on whichever rail
  // is live (never hidden, QUEUE-UX-SHELL.md's Hero section), disabled-but-
  // visible when there is nothing to act on. WHICH controls are live is not
  // re-derived here from a raw flag: the TV pushes the resolved transport
  // straight off the one rule every surface shares (core/queue-shell-view.js
  // transportState), so ⏭ lights up for a queued film behind a standalone one
  // here exactly as it does on the TV row and in the Queue hero (BUG-510/512 —
  // the three used to disagree). TASK-524 pointed the home-movie rail at this
  // same call, where it had its own always-live copy.
  function applyEngineMode(on, transport) {
    [on].filter(Boolean).forEach(function() { applyTransport(transport); });
  }
  var SET_FILM_ON = {
    'true': function(payload) {
      els.repeat.classList.toggle('on', !!payload.filmRepeat);
      els.shuffle.classList.toggle('on', !!payload.filmShuffle);
    },
    'false': function() {}
  };
  // TASK-542 — the series rail's own on/off pair. Identical in shape to the
  // film one above and deliberately so: what separates the two rails is which
  // engine they drive, not how the phone paints them.
  var SET_SERIES_ON = {
    'true': function(payload) {
      els.repeat.classList.toggle('on', !!payload.seriesRepeat);
      els.shuffle.classList.toggle('on', !!payload.seriesShuffle);
    },
    'false': function() {}
  };
  function onVideoContext(payload) {
    els.ctxLabel.textContent = 'Now playing';
    els.title.textContent = displayTitle(payload);
    state.crumb.videoTitle = displayTitle(payload);
    state.musicVideo = !!payload.musicVideo;
    state.homeMovie = !!payload.homeMovie;
    state.film = !!payload.film;
    state.series = !!payload.series;
    state.crumb.mvSource = [payload.musicVideoSource].filter(Boolean).concat([null])[0];
    applyMusicVideoMode(state.musicVideo, payload.musicVideoTransport);
    applyEngineMode(state.homeMovie, payload.homeMovieTransport);
    applyEngineMode(state.film, payload.filmTransport);
    applyEngineMode(state.series, payload.seriesTransport);
    SET_MV_ON[state.musicVideo + ''](payload);
    SET_HM_ON[state.homeMovie + ''](payload);
    SET_FILM_ON[state.film + ''](payload);
    SET_SERIES_ON[state.series + ''](payload);
    mountVideoCrumbs();
  }

  // Following the TV onto another page is gated in Browse mode; staying on the
  // video page to refresh titles (display-only) is fine in both modes.
  function followToOtherPage(page) {
    ({ true: function() { window.location.href = page + '.html'; }, false: noop })[mode.drivesNav()]();
  }
  function onContext(payload) {
    var page = screenPage(payload.context_id);
    ({ true: function() { followToOtherPage(page); }, false: function() { onVideoContext(payload); } })[page !== 'video']();
  }

  // Reset progress (TASK-142): two-tap confirm (tap -> "Reset progress?" -> tap)
  // then send the `reset` intent — the TV player clears this item's progress and
  // exits, and the companion follows the echoed context. Auto-disarms after 4s so
  // an armed button never stays stuck on touch.
  var resetArmed = false;
  var resetTimer = null;
  function disarmReset() {
    resetArmed = false;
    els.reset.classList.remove('confirm');
    els.reset.textContent = '↻ Reset';
  }
  function armReset() {
    resetArmed = true;
    els.reset.classList.add('confirm');
    els.reset.textContent = '↻ Reset?';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(disarmReset, 4000);
  }
  function fireReset() {
    clearTimeout(resetTimer);
    disarmReset();
    api.sendIntent('reset');
  }
  function onResetTap() {
    ({ 'false': armReset, 'true': fireReset })[String(resetArmed)]();
  }

  // TASK-378 — "Add to playlist" for the currently-playing music video, the
  // companion mirror of the TV player's own sheet (screen-video-page.js). Same
  // shape as companion-detail's per-track sheet: profile-filtered music-video
  // playlists (core/playlist-pick) plus New playlist + Cancel.
  function activeProfile() { return [state.profile].filter(Boolean).concat(['adults'])[0]; }
  function closeAddSheet() { document.getElementById('add-sheet').style.display = 'none'; }
  function hideAddStatus() { document.getElementById('add-status').style.display = 'none'; }
  var addStatusTimer = null;
  function showAddStatus(text) {
    var el = document.getElementById('add-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(addStatusTimer);
    addStatusTimer = setTimeout(hideAddStatus, 2500);
  }
  function addExisting(id, title) {
    addToPlaylist(server, id, state.itemId)
      .then(function() { closeAddSheet(); showAddStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showAddStatus('Could not add to playlist.'); });
  }
  function createNewPlaylist() {
    window.location.href = 'playlist-create.html?addTrack=' + encodeURIComponent(state.itemId) +
      '&collectionType=music-video-playlist&profile=' + encodeURIComponent(activeProfile());
  }
  function choiceBtn(card) {
    var b = document.createElement('button');
    b.className = 'add-choice';
    b.setAttribute('data-id', card.id);
    b.textContent = '♪ ' + card.title;
    b.addEventListener('click', function() { addExisting(card.id, card.title); });
    return b;
  }
  function showAddSheet(cards) {
    var list = document.getElementById('add-sheet-list');
    list.innerHTML = '';
    cards.map(choiceBtn).forEach(function(b) { list.appendChild(b); });
    document.getElementById('add-sheet').style.display = 'flex';
  }
  function openAddSheet() {
    loadBrowse(server, activeProfile())
      .then(function(res) { showAddSheet(playlistCards([res.content].filter(Boolean).concat([[]])[0], null, 'music-video-playlist')); })
      .catch(function() { showAddStatus('Could not load playlists.'); });
  }

  els.toggle.addEventListener('click', function() { api.sendIntent('toggle'); });
  els.cc.addEventListener('click', function() { api.toggleCaptions(); });
  els.night.addEventListener('click', function() { api.sendIntent('nightMode'); });
  els.prev.addEventListener('click', function() { PREV_ACTION[engineMode()](); });
  els.next.addEventListener('click', function() { NEXT_ACTION[engineMode()](); });
  els.repeat.addEventListener('click', function() { REPEAT_ACTION[engineMode()](); });
  els.shuffle.addEventListener('click', function() { SHUFFLE_ACTION[engineMode()](); });
  document.getElementById('c-vol-down').addEventListener('click', function() { api.sendIntent('vol_down'); });
  document.getElementById('c-vol-up').addEventListener('click', function() { api.sendIntent('vol_up'); });
  els.reset.addEventListener('click', onResetTap);
  // FEAT-418 (TASK-420) / TASK-499/503: the queue link goes to whichever
  // queue matches the current mode.
  //
  // TASK-525 removed the 'video' entry with the page it pointed at
  // (companion/video-queue.html). engineMode() still FALLS BACK to 'video'
  // for the three cut-over rails' own tables below, and that fallback is what
  // this button sees in the one window where no context push has landed yet
  // (the page mounts with all three mode flags false) — so an absent href
  // leaves the tap inert rather than navigating to a page that no longer
  // exists. Every real mode has an entry.
  var QUEUE_HREF = { mv: 'music-video-queue.html', hm: 'home-movies-queue.html', film: 'film-queue.html' };
  document.getElementById('c-queue').addEventListener('click', function() {
    [QUEUE_HREF[engineMode()]].filter(Boolean).forEach(function(href) { window.location.href = href; });
  });
  document.getElementById('c-quickpause').addEventListener('click', function() { localStorage.setItem(QP_SOURCE_KEY, 'video'); window.location.href = 'quick-pause.html'; });
  els.addPlaylist.addEventListener('click', openAddSheet);
  document.getElementById('btn-add-create').addEventListener('click', createNewPlaylist);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);
  document.getElementById('switch-profile').addEventListener('click', function() { api.sendIntent('navigate', switchProfileTarget()); });
  buildJump();
  setInterval(renderBar, 250);

  mountSyncBar(mode, onModeChange);
  applyMode();
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { mode: mode, onVideoPlayback: onVideoPlayback });
  updateBar = mountScreenBar(getApi, noop);
}
