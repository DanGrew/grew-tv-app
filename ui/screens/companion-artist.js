import { connect } from '../../core/companion-ws.js';
import { loadBrowse, loadAlbum, mediaUrl, addToPlaylist, playbackAction } from '../../core/app-api.js';
import { screenPage, queryString } from '../../core/companion-utils.js';
import { albumsByArtist, artistFromId } from '../../core/home-rails.js';
import { artistTracks } from '../../core/artist-tracks.js';
import { episodeLabel } from '../../core/detail-view.js';
import { fmt } from '../../core/time.js';
import { buildCrumbs, trailCrumbs } from '../../core/breadcrumb.js';
import { pushUnique as pushTrail, trimOnCrumb, entries as entriesTrail, railEntry } from '../../core/nav-trail.js';
import { playlistCards } from '../../core/playlist-pick.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';
import { mountStatusMenu } from './companion-status-menu.js';
import { mountRowStep } from './companion-row-step.js';

// TASK-322 (FEAT-046) — the companion artist mirror: the same grouped SONG LIST as
// the TV artist page (all the artist's tracks, grouped under album headers, newest
// album first — core/artist-tracks). Tapping a song drives the TV to the artist
// player from there (the `play` intent → the TV screen-artist-page clicks that
// track's row → audio.html play-source {artist} + play-track). No Play/Shuffle
// header (TASK-321 mirror invariant). Catalog is backend state (loadBrowse +
// albumsByArtist + one /api/album per album, option (b)); only the live artist +
// profile arrive over WS. Desync (Browse): the song rows grey out (they drive the
// TV — the companion plays nothing itself), matching companion-detail's album tracks.
export function initPage() {
  mountStatusMenu(['mode', 'row', 'screen', 'profile']);
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxTitle: document.getElementById('ctx-title'),
    listEl: document.getElementById('songlist')
  };
  var state = { artist: null, profile: null, person: null, model: { title: '', items: [] } };
  var addState = { add: null, queue: null, createHref: '', statusTimer: null };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }
  // FEAT-038 (DSYNC-2c): the switch only changes mode. BROWSE greys the song rows
  // (they drive the TV); CONTROL reloads (reconnect).
  function reSync() { window.location.reload(); }
  var applyRowStepMode = mountRowStep(mode, getApi);
  function applyMode() { document.body.classList.toggle('browsing', mode.isDesynced()); applyRowStepMode(); }
  function onModeChange(browsing) { ({ true: applyMode, false: reSync })[browsing](); }

  // Breadcrumb trail (FEAT-021 / BUG-021): the artist page records its OWN
  // artist.html entry, so the rail it was reached through is the browse.html entry
  // sitting just BELOW that — build the middle crumb from that rail entry (Home ›
  // Artists › Artist), via the shared core/nav-trail.js railEntry (BUG-061: also
  // reused by companion-audio.js, which used to skip this and read raw peek()).
  // A deep-link / fresh session has no browse entry, so fall back to the static
  // Home › Music › Artist. Control: a crumb tap sends the `navigate` intent (TV
  // teleports, companion follows). Browse: a local hop to the library.
  function localGo(page, params) { window.location.href = page + queryString(params); }
  function navigate(page, params) {
    // Trim the trail to the clicked ancestor (Home clears) so a later Back can't
    // retrace past this jump (FEAT-032 stale-Back fix).
    trimOnCrumb(page, params);
    ({ true: function() { localGo(page, params); }, false: function() { api.sendIntent('navigate', { page: page, params: params }); } })[mode.isDesynced()]();
  }
  function mountCrumbs(artistName) {
    var rail = railEntry(entriesTrail());
    mountCompanionBreadcrumb('breadcrumb', ({ true: trailCrumbs(rail, artistName), false: buildCrumbs('artist', { artistName: artistName }) })[Boolean(rail)], navigate);
  }

  // TASK-440 — the artist song list's "Add to playlist" sheet, ported from
  // companion-detail's per-track openAddSheet/albumTrackNode (an artist's tracks
  // are music-only, same as an album's, so this is the same machinery).
  function activeProfile() { return [state.profile].filter(Boolean).concat(['adults'])[0]; }
  function hideStatus() { document.getElementById('add-status').style.display = 'none'; }
  function showStatus(text) {
    var el = document.getElementById('add-status');
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(addState.statusTimer);
    addState.statusTimer = setTimeout(hideStatus, 2500);
  }
  function closeAddSheet() { document.getElementById('add-sheet').style.display = 'none'; }
  function addExisting(id, title) {
    addState.add(id)
      .then(function() { closeAddSheet(); showStatus('Added to ' + title); })
      .catch(function() { closeAddSheet(); showStatus('Could not add to playlist.'); });
  }
  function createNew() { window.location.href = addState.createHref; }
  function choiceBtn(card) {
    var b = document.createElement('button');
    b.className = 'add-choice';
    b.setAttribute('data-id', card.id);
    b.textContent = '♪ ' + card.title;
    b.addEventListener('click', function() { addExisting(card.id, card.title); });
    return b;
  }
  function queueChoiceBtn() {
    var b = document.createElement('button');
    b.className = 'add-queue';
    b.textContent = '☰ Play Next';
    b.addEventListener('click', addState.queue);
    return b;
  }
  function showAddSheet(cards) {
    var list = document.getElementById('add-sheet-list');
    list.innerHTML = '';
    [addState.queue].filter(Boolean).forEach(function() { list.appendChild(queueChoiceBtn()); });
    cards.forEach(function(c) { list.appendChild(choiceBtn(c)); });
    document.getElementById('add-sheet').style.display = 'flex';
  }
  function loadAndShowSheet() {
    loadBrowse(server, activeProfile())
      .then(function(res) { showAddSheet(playlistCards([res.content].filter(Boolean).concat([[]])[0])); })
      .catch(function() { showStatus('Could not load playlists.'); });
  }
  function openAddSheet(item) {
    addState.add = function(id) { return addToPlaylist(server, id, item.video.id); };
    addState.queue = function() { queueThenClose(item); };
    addState.createHref = 'playlist-create.html?addTrack=' + encodeURIComponent(item.video.id) +
      '&profile=' + encodeURIComponent(activeProfile());
    loadAndShowSheet();
  }
  function queueTrack(item) {
    playbackAction(server, 'queue-track', state.person, { track_id: item.video.id })
      .then(function() { showStatus('Queued to Play Next'); })
      .catch(function() { showStatus('Could not queue track.'); });
  }
  function queueThenClose(item) { closeAddSheet(); queueTrack(item); }
  function addBtn(item) {
    var b = document.createElement('button');
    b.className = 'detail-add-btn';
    b.setAttribute('data-add', item.video.id);
    b.textContent = '＋';
    b.addEventListener('click', function() { openAddSheet(item); });
    return b;
  }

  // A ♪ placeholder (consistent with the audio-player .cover placeholder) shown
  // when a track has no cover art — and swapped in on a 404 via the img onerror.
  function placeholderCover() {
    var d = document.createElement('span');
    d.className = 'ph-cover-ph';
    d.textContent = '♪';
    return d;
  }
  function imgCover(url) {
    var img = document.createElement('img');
    img.className = 'ph-cover';
    img.src = url;
    img.addEventListener('error', function() { img.replaceWith(placeholderCover()); });
    return img;
  }
  // A song row: cover + "N. Title" + duration, the whole row a play tile that drives
  // the TV. Greyed (desync-off) in Browse — the WS layer also no-ops the intent.
  function songRow(item) {
    var video = item.video;
    var btn = document.createElement('button');
    btn.className = 'song';
    btn.setAttribute('data-id', video.id);
    btn.classList.toggle('desync-off', mode.isDesynced());
    var url = mediaUrl(server, video.poster);
    btn.appendChild(({ true: function() { return imgCover(url); }, false: placeholderCover })[Boolean(url)]());
    var sub = [video.duration].filter(Boolean).map(function(d) { return '<span class="s-sub">' + fmt(d) + '</span>'; }).concat([''])[0];
    btn.insertAdjacentHTML('beforeend', '<span class="s-info"><span class="s-label">' + episodeLabel(item) + '</span>' + sub + '</span>');
    btn.addEventListener('click', function() { api.sendIntent('play', { id: video.id }); });
    return btn;
  }
  // A song track row: the play tile + a single ＋ control beside it (TASK-440,
  // mirrors companion-detail's albumTrackNode) — the add sheet's top option is
  // ▶ Play Next, playlist cards below. A <button> can't nest, so they are siblings.
  function songTrackNode(item) {
    var row = document.createElement('div');
    row.className = 'detail-track-row';
    row.appendChild(songRow(item));
    row.appendChild(addBtn(item));
    return row;
  }

  function albumHead(title) {
    var h = document.createElement('div');
    h.className = 'album-head';
    h.textContent = title;
    return h;
  }
  // Emit an album header whenever the album changes, so the flat song list reads
  // grouped by album (newest album first — the model order).
  function maybeHead(ctx, item) {
    [item.albumId].filter(function(k) { return k !== ctx.last; }).forEach(function(k) { els.listEl.appendChild(albumHead(item.albumTitle)); ctx.last = k; });
  }
  function renderSongs() {
    var ctx = { last: null };
    state.model.items.forEach(function(it) { maybeHead(ctx, it); els.listEl.appendChild(songTrackNode(it)); });
  }
  function renderNoContent() {
    var p = document.createElement('div');
    p.className = 'no-actions';
    p.textContent = 'No songs';
    els.listEl.appendChild(p);
  }
  var RENDER = { 'true': renderSongs, 'false': renderNoContent };
  function render() { els.listEl.innerHTML = ''; RENDER[(state.model.items.length > 0) + ''](); }

  // Songs need BOTH the artist (context) and the profile (app_state, picks the
  // catalog); they can arrive in either order, so load only once both are set and
  // re-load if the profile changes. Assemble from the artist's albums (newest-first
  // browse cards) + one /api/album fetch per album (option (b)).
  function loadSongs() {
    [state.artist].filter(Boolean).filter(function() { return Boolean(state.profile); }).forEach(function(artist) {
      loadBrowse(server, state.profile)
        .then(function(b) {
          var albums = albumsByArtist([b.content].filter(Boolean).concat([[]])[0], artist);
          return Promise.all(albums.map(function(a) { return loadAlbum(server, a.id).catch(function() { return null; }); }))
            .then(function(details) { state.model = artistTracks(artist, details); render(); });
        })
        .catch(function() { state.model = { title: artist, items: [] }; render(); });
    });
  }

  function captureArtist(payload) {
    [payload.artist].filter(Boolean).filter(function(a) { return a !== state.artist; }).forEach(function(a) {
      state.artist = a;
      els.ctxTitle.textContent = a;
      // FEAT-032 (TASK-218): record this artist's page as a trail level so a child
      // (the player) can return here, not skip back to the artists rail. pushUnique
      // avoids stacking a duplicate when re-entered via a child's Back.
      pushTrail({ page: 'artist.html', params: { artist: a }, label: a });
      mountCrumbs(a);
      loadSongs();
    });
  }

  function followContext(payload) {
    var page = screenPage(payload.context_id);
    var ROUTE = {
      'true':  function() { window.location.href = page + '.html'; },
      'false': function() { captureArtist(payload); }
    };
    ROUTE[(page !== 'artist') + '']();
  }
  // Status strip title always; nav-follow gated in Browse mode.
  function onContext(payload) {
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
  }

  // Profile keys the catalog (FEAT-026 TASK-158 — reloads when it changes). Person
  // (captured first, GATES-CHECKS.md) keys the per-person queue-track POST.
  function onAppState(snap) {
    state.person = [snap.person].filter(Boolean).concat([state.person])[0];
    [snap.profile].filter(Boolean).filter(function(p) { return p !== state.profile; }).forEach(function(p) {
      state.profile = p;
      loadSongs();
    });
  }

  document.getElementById('switch-profile').addEventListener('click', function() { api.sendIntent('navigate', switchProfileTarget()); });
  document.getElementById('btn-add-create').addEventListener('click', createNew);
  document.getElementById('btn-add-cancel').addEventListener('click', closeAddSheet);
  mountSyncBar(mode, onModeChange);
  applyMode();
  // Browse-mode entry: browse linked here with ?id=<artist>, so seed the artist
  // ourselves (captureArtist loads its songs once the profile arrives). The
  // breadcrumb/TV path instead links ?artist=<name> (BUG-035) — seed that too; the
  // value is already a name and captureArtist dedupes, so both keys are safe.
  [new URLSearchParams(window.location.search).get('id')].filter(Boolean).forEach(function(id) { captureArtist({ artist: artistFromId(id) }); });
  [new URLSearchParams(window.location.search).get('artist')].filter(Boolean).forEach(function(name) { captureArtist({ artist: name }); });
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; }, onAppState, onDevices, { mode: mode });
  updateBar = mountScreenBar(getApi, noop);
}
