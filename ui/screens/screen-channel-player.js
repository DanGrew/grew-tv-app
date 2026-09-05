import { getParam, getProfile, navTo, initCaptions } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-video-player.js';
import { connectApp } from '../../core/app-ws.js';
import { loadChannel, loadChannels } from '../../core/app-api.js';
import { tickedOffset, channelPercent } from '../../core/channels.js';
import { isBehindLive, shouldRetune, upNextTitle, channelRecord, identLabel, flipTarget, channelIds } from '../../core/channel-player.js';
import { channelVideoContext } from '../../core/video-page-config.js';
import { playerCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// FEAT-560/TASK-564 — CHANNEL MODE on the existing player (decision 11): a mode
// flag on `#controls`, not a second player. `app/homeview/video.html` dispatches
// here on `?channel=`, and `ui/screens/screen-video-page.js` keeps the four
// queue-engine rails; both drive the SAME transport
// (ui/screens/screen-video-player.js), the same `#controls`, the same 5px
// `#progress` bar and the same `#video-upnext` line.
//
// ⛔ THE CHANNEL IS NOT A QUEUE, and none of the queue plumbing is reached from
// here. There is no media_type, no `queue_playback` snapshot, no Queue View and
// no engine action: what plays is whatever GET /api/channels/{id} says is on,
// and the only thing that moves it on is the wall clock. That is why this is a
// sibling of screen-video-page.js rather than a fifth entry in its
// core/video-page-config.js table — every field in that table answers a question
// about a queue, and a channel has none of them.
//
// The four things the chrome adds over a normal play:
//   ident       — `#channel-ident`, top LEFT, because `#device-badge` owns
//                 top-right on this page
//   live marker — a ghost diamond ON the existing `#progress` bar at the
//                 CHANNEL's position. Tuned in it sits on the playhead; restart
//                 and the two separate, which is the model in one glyph
//   back to live— `#btn-live`, shown only while behind
//   up next     — the schedule's next item, in the line that already exists
//
// ⚠️ AND ONE THING IT TAKES AWAY: a channel play records NO watch progress
// (decision 16), so the player is built with `savesProgress: false`. Nothing
// here POSTs /api/progress, and `#btn-clear-progress` is hidden — a channel
// writes nothing, so there is nothing to clear, and offering it would let a
// tune-in wipe the deliberate resume position the viewer has in that same item.

var SERVER = window.location.origin;
// The chrome re-renders every second: the marker is wrong within a second of
// paint otherwise, which is the same reason the strip's own card ticks.
var TICK_MS = 1000;
// The volume rocker, and nothing else (decision 15). Claimed HERE rather than in
// the shared player because they are printable characters: unclaimed they type
// into a focused field, so only channel mode may take them. TASK-556 allocates
// the rest of the handset and is not to be pre-empted from this row.
var FLIP_DOWN_KEY = '-';
var FLIP_UP_KEY = '=';
var VIDEO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
// Shown only in channel mode; `video.html` ships them hidden.
var CHANNEL_PILLS = ['btn-restart'];
// Hidden in channel mode: there is no queue to open, and nothing recorded to
// clear.
var QUEUE_PILLS = ['btn-queue', 'btn-clear-progress'];

function noop() {}

export function initChannelPage() {
  var channelId = getParam('channel');
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var wsApp = null;
  var player;
  // The last answer from the channel, and WHEN it arrived — the two together are
  // the clock. Nothing carries a position forward through a URL or a variable:
  // an offset is only true at the moment it was served, and every reading is
  // that offset plus the real seconds since.
  var detail = {};
  var detailAt = 0;
  var loadedId = null;
  var retuning = false;
  var ids = [];

  function elapsedSeconds() { return (Date.now() - detailAt) / 1000; }
  // Where the CHANNEL is, right now. Same clock the strip's cards run on.
  function channelSeconds() { return tickedOffset(detail, elapsedSeconds()); }
  // Where the VIEWER is, versus that.
  function behind() { return isBehindLive(player.position(), channelSeconds()); }

  function renderIdent() {
    var el = document.getElementById('channel-ident');
    el.textContent = identLabel(detail);
    el.classList.remove('hidden');
  }
  // The marker is placed by the CHANNEL's position over the ENTRY's runtime,
  // while `#progress-fill` is filled by the viewer's own position over the
  // file's duration. Two facts on one bar, which is the point — tuned in they
  // coincide, and after a Restart they visibly do not (stories 2 and 3).
  function renderMarker() {
    document.getElementById('live-marker').style.left = channelPercent(channelSeconds(), detail.runtime_seconds) + '%';
  }
  // Story 4, both halves: offered while behind, gone while level. There is no
  // third state — without the pill, letting the item finish is the only way back.
  function renderLivePill() {
    document.getElementById('btn-live').classList.toggle('hidden', !behind());
  }
  // Story 6 — up next is the PROGRAMME. The line is the one the player already
  // renders for a queue; only what fills it changes.
  function renderUpNext() {
    [upNextTitle(detail)].filter(Boolean).forEach(function(title) { player.setUpNext('Up next: ', title); });
  }
  // Home › <channel> › <what's on>. The channel's own crumb returns to the
  // Channels tab, the way a music video's crumb returns to its playlist. The
  // phone is handed this SAME target on the context push (below), so both
  // surfaces name the channel and neither falls back to a browse rail.
  function crumbSource() {
    return { label: identLabel(detail), page: 'browse.html', params: { tab: 'channels' } };
  }
  function mountCrumbs() {
    mountBreadcrumb('breadcrumb', playerCrumbs(null, crumbSource(),
      [channelRecord(detail)].filter(Boolean).concat([{}])[0].title));
  }

  function sendChannelContext() {
    [wsApp].filter(Boolean).forEach(function(ws) {
      ws.sendContext(channelVideoContext(player.currentVideoDisplay(), crumbSource()));
    });
  }

  // Nothing on. The strip's card already says "Off air" and when the channel is
  // back, and browse refuses to open an off-air card at all — so this is the
  // race (a channel that went off air in the thirty seconds since its card was
  // drawn) and the end of the night's programme. Both land the viewer back on
  // the Channels tab rather than on a black screen. The card between items and
  // the music bed that will one day fill dead air are TASK-565.
  function leaveOffAir() { navTo('browse.html', { tab: 'channels' }); }

  // A live channel plays the item on air FROM WHERE THE CHANNEL IS — that is
  // what tuning in means, and it is the only start position this mode has.
  //
  // Swapping media only when the item actually changed keeps Back to live from
  // re-buffering the thing already on screen: pressed mid-item it is a seek, and
  // only a genuine roll-on to the next programme entry reloads.
  var TUNE = {
    'true':  function() { player.playVideo(channelRecord(detail), 'browse', channelSeconds()); },
    'false': function() { player.seekTo(channelSeconds()); }
  };
  function startOnAir() {
    var record = channelRecord(detail);
    TUNE[(record.id !== loadedId) + '']();
    loadedId = record.id;
    mountCrumbs();
    // The phone learns it is on a channel the moment the TV tunes in, not when
    // something happens to fire a play intent — until it knows, its mirror is
    // the last queue rail's and its crumb names a browse rail.
    sendChannelContext();
    renderUpNext();
    renderMarker();
    renderLivePill();
  }

  var ON_AIR = { 'true': startOnAir, 'false': leaveOffAir };
  function applyChannel(answer) {
    retuning = false;
    detail = answer;
    detailAt = Date.now();
    renderIdent();
    ON_AIR[!!channelRecord(answer) + '']();
  }

  // THE one way in and the one way on — the first tune-in, the rejoin when an
  // item ends, and Back to live are the same act: ask the channel what is on NOW
  // and start there. Nothing computes where the channel got to on its own.
  function rejoin() {
    retuning = true;
    loadChannel(SERVER, channelId, profile)
      .then(applyChannel)
      .catch(function() { retuning = false; });
  }
  // The FIRST fetch is different in one way only: failing it means nothing plays
  // at all, which is the existing "can't reach the server" page rather than a
  // silent black screen. A later failure just leaves the viewer watching and
  // lets the next tick try again.
  function tuneIn() {
    loadChannel(SERVER, channelId, profile)
      .then(applyChannel)
      .catch(function() { navTo('error.html'); });
  }

  // ⚠️ RESTART DOES NOT PAUSE THE CHANNEL (decision 11) — this seeks the VIEWER
  // and moves nothing else. The channel keeps running without them, the marker
  // walks away from the playhead, and finishing the item skips roughly what was
  // re-watched. That is the whole point: a clock, not a queue that waits.
  function restart() { player.seekTo(0); }

  var RETUNE = { 'true': rejoin, 'false': noop };
  // Story 5 — the rejoin. Two things ask for it and they are deliberately
  // different questions: the file ENDING always rejoins (that is what a viewer
  // who restarted gets), while the channel's own entry finishing only rejoins a
  // viewer who is LEVEL with it. Without that second condition the channel would
  // yank a restarted item away at the moment it would have ended, which is
  // exactly the behaviour restart exists to avoid.
  function tick() {
    renderMarker();
    renderLivePill();
    // The phone's own Back to live, in step with the pill above. Driven from
    // HERE rather than from the player's heartbeat because that beat stops on
    // pause — and a channel does not, so a paused viewer goes on falling behind.
    player.emitState();
    RETUNE[[shouldRetune(detail, elapsedSeconds(), behind()), !retuning].every(Boolean) + '']();
  }

  // The rocker flips (decision 15). A flip is a fresh page load of the same
  // player on another channel, so it tunes in from that channel's own answer —
  // there is no state to carry across, which is what makes it a lookup and not a
  // hand-over.
  function flip(delta) {
    [flipTarget(ids, channelId, delta)].filter(Boolean).forEach(function(id) { navTo('video.html', { channel: id }); });
  }

  player = setupPlayer({
    video: document.getElementById('video'),
    server: SERVER,
    // Decision 16 — a channel play records nothing. No position, no completion,
    // no clobbering a deliberate resume with a tune-in fragment.
    savesProgress: false,
    onStop: leaveOffAir,
    // The end of the item the viewer was actually watching. Always a rejoin,
    // whether they sat through it level with the channel or restarted it and
    // finished late.
    onEnded: rejoin,
    // ⏮/⏭ are hidden in channel mode (setSeriesMode below), so nothing fires
    // these — the rocker is what moves between channels, and there is no
    // previous or next ITEM to step to on a schedule.
    onNext: noop,
    onPrev: noop,
    // The 1 Hz heartbeat the phone already draws its progress bar from, carrying
    // one extra fact: whether the viewer is behind the channel. It is what shows
    // and hides the phone's Back to live button, in step with the TV pill and
    // off the same answer — story 4 is a rule about the viewer's position, not
    // about which screen is asking. No new traffic: the snapshot goes out every
    // second regardless.
    emitState: function(snap) {
      var payload = Object.assign({}, snap, { channelBehind: behind() });
      [wsApp].filter(Boolean).forEach(function(ws) { ws.sendAppState(payload); });
    },
    appContext: function() {
      return { screen: 'player', itemId: loadedId, episodeId: loadedId, profile: profile };
    },
    onIntent: function(intent) {
      var VIDEO_CTX = { play: true, video: true };
      [VIDEO_CTX[intent]].filter(Boolean).forEach(sendChannelContext);
    }
  });

  document.getElementById('controls').classList.add('channel-mode');
  CHANNEL_PILLS.forEach(function(id) { document.getElementById(id).classList.remove('hidden'); });
  QUEUE_PILLS.forEach(function(id) { document.getElementById(id).classList.add('hidden'); });
  player.setSeriesMode(false);
  document.getElementById('btn-restart').addEventListener('click', restart);
  document.getElementById('btn-live').addEventListener('click', rejoin);

  var KEY_TARGET = function(e) { player.handleVideoKey(e); };
  var keys = {};
  VIDEO_KEYS.forEach(function(k) { keys[k] = KEY_TARGET; });
  keys[FLIP_DOWN_KEY] = function(e) { e.preventDefault(); flip(-1); };
  keys[FLIP_UP_KEY] = function(e) { e.preventDefault(); flip(1); };
  initPage({ onEnter: function() { document.getElementById('btn-play-pause').focus(); }, keys: keys, remote: player.remote });

  // The phone's own channel controls (the mirror of the two pills above) and the
  // one intent channel mode has to REFUSE.
  //
  // ⛔ `reset` is inert here. The shared player's reset clears the item's stored
  // progress and exits — on a channel that would wipe a resume position the
  // viewer set deliberately in their own time, for an item the channel merely
  // happens to be airing, and drop them out of the channel for it. Decision 16
  // says a channel play touches watch_progress not at all, in either direction.
  // The phone hides its Clear progress button in channel mode; this is what
  // makes a stray press from a page that connected before the tune-in harmless.
  var CHANNEL_INTENTS = {
    channelRestart: restart,
    channelLive: rejoin,
    reset: noop
  };

  function appIntent(intent, params) {
    var EXTRA = Object.assign({ navigate: function() { navTo(params.page, params.params); } }, CHANNEL_INTENTS);
    var fn = [EXTRA[intent]].filter(Boolean).concat([player.remote[intent]]).filter(Boolean)[0];
    [fn].filter(Boolean).forEach(function(f) { f(params); });
  }
  wsApp = connectApp(window.location.origin, appIntent);

  document.addEventListener('keydown', dispatchKey);

  // The strip, for the rocker alone — the ORDER the backend served, so flipping
  // matches the order the cards were in. TASK-571 settles who sees which
  // channel; this asks the same endpoint the strip did, under the same profile,
  // so whatever that row decides is honoured here without a check of its own.
  // A failed strip fetch costs the rocker and nothing else: what is playing does
  // not depend on it.
  loadChannels(SERVER, profile)
    .then(function(res) { ids = channelIds([res.channels].filter(Boolean).concat([[]])[0]); })
    .catch(noop);

  initCaptions(SERVER).then(tuneIn);
  setInterval(tick, TICK_MS);
}
