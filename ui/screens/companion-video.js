import { connect } from '../../core/companion-ws.js';
import { loadSeries, videoPlaybackAction, loadBrowse, addToPlaylist } from '../../core/app-api.js';
import { screenPage, displayTitle, seriesIdFromSnap, queryString } from '../../core/companion-utils.js';
import { nowPlaying, upNextLine, seriesMode } from '../../core/video-player-router.js';
import { mvTransportVisibility } from '../../core/music-video-playthrough.js';
import { fmt } from '../../core/time.js';
import { percent } from '../../core/progress.js';
import { buildCrumbs, trailCrumbs } from '../../core/breadcrumb.js';
import { trimOnCrumb, entries as entriesTrail } from '../../core/nav-trail.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';
import { mountStatusMenu } from './companion-status-menu.js';

// Companion player transport (FEAT-017 + FEAT-037/TASK-223). Two planes, by design
// (the music-companion migration hasn't landed yet, so the shared intent rail must
// stay). PLANE B — server-authoritative video engine: prev/next/repeat POST to
// /api/video-playback for the active person and now-playing / up-next / repeat
// repaint from the per-person `video_playback` snapshot (onVideoPlayback), the SAME
// snapshot the persistent TV player renders — so a media change the companion drives
// swaps the TV in place, no forced reload. PLANE A — the legacy WS intent rail still
// carries play/pause, graduated skip, captions, volume and reset (the <video>'s own
// transport has no server action); the progress bar is interpolated locally between
// 1 Hz app_state snapshots. No scrub — seek is a relative skip(deltaSec).
var JUMP = [
  { d: -10, label: '-10s' }, { d: -30, label: '-30s' }, { d: -120, label: '-2m' }, { d: -600, label: '-10m' }, { d: -1800, label: '-30m' },
  { d: 10, label: '+10s' }, { d: 30, label: '+30s' }, { d: 120, label: '+2m' }, { d: 600, label: '+10m' }, { d: 1800, label: '+30m' }
];
var PLAY_ICON = { 'true': '⏸', 'false': '▶' };

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
    queue: document.getElementById('c-queue'),
    addPlaylist: document.getElementById('c-add-playlist')
  };
  var state = { snap: null, vsnap: null, person: null, loadedSeriesId: null, musicVideo: false, itemId: null, profile: null, crumb: { seriesId: null, seriesTitle: null, videoTitle: '' } };
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
  function localGo(page, params) { window.location.href = page + queryString(params); }
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
  function mountVideoCrumbs() {
    mountCompanionBreadcrumb('breadcrumb', VIDEO_CRUMBS[Boolean(state.crumb.seriesId)](), navigate);
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

  function renderControls() {
    [state.snap].filter(Boolean).forEach(function(s) {
      els.toggle.textContent = PLAY_ICON[s.playing + ''];
      els.cc.classList.toggle('on', !!s.captionsOn);
    });
  }

  // PLANE B transport: each fires the same server action the TV player fires
  // (TASK-222), keyed to the active person — the server advances the engine and
  // broadcasts the resolved `video_playback` snapshot, which repaints BOTH surfaces.
  // A music video (TASK-374) never fires this — it has no video-playback engine
  // session, so a companion tap sends the WS `next`/`prev` intent instead (Plane
  // A), reaching the TV player's own local playthrough the same way toggle/skip
  // already do.
  function sendVideoAction(action) { videoPlaybackAction(server, action, state.person).catch(noop); }
  var PREV_ACTION = { 'true': function() { api.sendIntent('prev'); }, 'false': function() { sendVideoAction('previous'); } };
  var NEXT_ACTION = { 'true': function() { api.sendIntent('next'); }, 'false': function() { sendVideoAction('next'); } };
  // TASK-407 — Repeat rides the same Plane A/Plane B split as prev/next above:
  // a music video's repeat lives in the TV's own client-owned seq (WS intent),
  // never the video-playback engine. Shuffle is mv-only — its button is
  // hidden outright for a film/series (applyMusicVideoMode), so the 'false'
  // branch here is unreachable in practice; kept as a safe no-op rather than
  // an assumption a stray tap can't happen.
  var REPEAT_ACTION = { 'true': function() { api.sendIntent('toggleRepeat'); }, 'false': function() { sendVideoAction('toggle-repeat'); } };
  var SHUFFLE_ACTION = { 'true': function() { api.sendIntent('toggleShuffle'); }, 'false': function() {} };

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
  // A music video (TASK-374) never broadcasts a video_playback snapshot, so a
  // push that arrives while one is playing (e.g. a reconnect replay) can only be
  // stale film/series state — ignore it entirely rather than let it clobber the
  // music-video title/up-next/repeat this companion is correctly showing.
  var ON_VIDEO_PLAYBACK = { 'true': function() {}, 'false': applyVideoPlaybackSnap };
  function onVideoPlayback(snap) {
    state.vsnap = snap;
    ON_VIDEO_PLAYBACK[state.musicVideo + ''](snap);
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

  // FEAT-418 (TASK-420): a music video now HAS a queue (its own engine, on its
  // own channel) — the link stays visible in both modes and repoints instead
  // of hiding (QUEUE_HREF below). prev/next still hide only for a lone pick
  // (mirrors the TV's own seriesMode-style ⏮/⏭ hide for a single item).
  function applyNav(hide) {
    els.prev.classList.toggle('single', hide);
    els.next.classList.toggle('single', hide);
  }
  // OFF music-video mode, ⏮/⏭ go BACK to the engine snapshot rather than being
  // cleared — applySeriesMode owns `single` for a film/series, and a standalone
  // film (a one-item source) must stay greyed. Clearing it here instead used to
  // re-arm ⏮/⏭ on every film, because the TV's context push lands AFTER the
  // snapshot in production (onIntent('play'/'video') only fire once the player
  // has swapped the snapshot in). Before the first snapshot there is
  // nothing to restore, so that branch is a no-op.
  var HIDE_NAV = {
    'true':  function(multi) { applyNav(!multi); },
    'false': function() { [state.vsnap].filter(Boolean).forEach(function(s) { applySeriesMode(seriesMode(s)); }); }
  };
  // TASK-407 — Repeat now ALSO applies to a multi-item music-video playthrough
  // (it hid outright before); Shuffle is new and mv-only. mvTransportVisibility
  // is the one gate both this companion mirror and the TV read (story 4/5), so
  // the two surfaces can never disagree on when the pair shows.
  function applyMusicVideoMode(on, multi) {
    var vis = mvTransportVisibility(on, multi);
    els.repeat.classList.toggle('hidden', !vis.repeat);
    els.shuffle.classList.toggle('hidden', !vis.shuffle);
    // TASK-378 — Add to playlist is the INVERSE of repeat/shuffle: it only
    // makes sense FOR a music video, so it shows exactly when they hide.
    els.addPlaylist.classList.toggle('hidden', !on);
    HIDE_NAV[on + ''](multi);
  }
  // Repeat's/Shuffle's on/off state during a music video comes off the
  // context push's own flags (the client-owned seq, never the video-playback
  // engine snapshot — onVideoPlayback already ignores that snapshot outright
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
  function onVideoContext(payload) {
    els.ctxLabel.textContent = 'Now playing';
    els.title.textContent = displayTitle(payload);
    state.crumb.videoTitle = displayTitle(payload);
    state.musicVideo = !!payload.musicVideo;
    applyMusicVideoMode(state.musicVideo, !!payload.musicVideoMulti);
    SET_MV_ON[state.musicVideo + ''](payload);
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
  els.prev.addEventListener('click', function() { PREV_ACTION[state.musicVideo + ''](); });
  els.next.addEventListener('click', function() { NEXT_ACTION[state.musicVideo + ''](); });
  els.repeat.addEventListener('click', function() { REPEAT_ACTION[state.musicVideo + ''](); });
  els.shuffle.addEventListener('click', function() { SHUFFLE_ACTION[state.musicVideo + ''](); });
  document.getElementById('c-vol-down').addEventListener('click', function() { api.sendIntent('vol_down'); });
  document.getElementById('c-vol-up').addEventListener('click', function() { api.sendIntent('vol_up'); });
  els.reset.addEventListener('click', onResetTap);
  // FEAT-418 (TASK-420): the queue link now goes to whichever queue matches the
  // current mode — the music-video Queue View for a music video, the film/
  // series Video Queue View otherwise.
  var QUEUE_HREF = { 'true': 'music-video-queue.html', 'false': 'video-queue.html' };
  document.getElementById('c-queue').addEventListener('click', function() { window.location.href = QUEUE_HREF[state.musicVideo + '']; });
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
