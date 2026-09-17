import { getParam, getProfile, navTo, initCaptions } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { setup as setupPlayer } from './screen-video-player.js';
import { connectApp } from '../../core/app-ws.js';
import { loadChannel, loadChannels } from '../../core/app-api.js';
import { tickedOffset, channelPercent } from '../../core/channels.js';
import { isBehindLive, shouldRetune, upNextParts, channelRecord, identLabel, flipTarget, channelIds } from '../../core/channel-player.js';
import { cardView, cardStatus, laterText, holdSeconds, CARD_LOOKAHEAD } from '../../core/channel-card.js';
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
//
// TASK-565 adds THE GAP — the card between items, and the same card holding an
// off-air channel (decisions 8 and 12). The card's own model is
// core/channel-card.js; what lives here is when the card goes up, when it comes
// down, and the DOM.
//
// TASK-574 settles WHEN IT COMES DOWN — when the next programme actually starts,
// never before (core/channel-card.js holdSeconds) — and takes the music bed out
// entirely. Decision 13 specified a per-channel bed and it was built, but no
// channel ever named an album, so it shipped without playing a note; the owner
// would rather come back to it fresh than carry a feature nobody has heard. The
// card is SILENT, and that is now the intended state — a session finding a
// static, silent panel has not found a defect.

var SERVER = window.location.origin;
// The chrome re-renders every second: the marker is wrong within a second of
// paint otherwise, which is the same reason the strip's own card ticks.
var TICK_MS = 1000;
// How often a HELD channel asks whether it is back. Only the off-air card waits
// on this — everything else moves on its own event — so it is sized for a viewer
// sitting in front of a holding card rather than for the clock: half a minute is
// soon enough not to feel stuck, and rare enough that a channel left off air
// overnight is not polling every second until morning.
var OFF_AIR_POLL_MS = 30000;
// The volume rocker, and nothing else (decision 15). Claimed HERE rather than in
// the shared player because they are printable characters: unclaimed they type
// into a focused field, so only channel mode may take them. TASK-556 allocates
// the rest of the handset and is not to be pre-empted from this row.
var FLIP_DOWN_KEY = '-';
var FLIP_UP_KEY = '=';
// TASK-600: `c` — the remote's burger button — cycles Night Mode here exactly as
// on any film; this page registers its own key map over the shared player, so it
// has to list it too.
var VIDEO_KEYS = ['Escape', 'Backspace', ' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'c'];
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
  // Whether a card is on screen. Read by the context push, so the phone's
  // now-playing line says what the TV is actually showing rather than the title
  // of the programme that just finished.
  var cardUp = false;
  // The pending end of a hold. Kept so a rejoin from anywhere else — Back to
  // live, the off-air poll — cancels it: a hold now runs as long as the slot the
  // viewer skipped out of, so a stale timer firing minutes later would yank a
  // viewer who had already rejoined, where the old fixed eight seconds gave it
  // almost no window to happen in.
  var holdTimer = null;

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
  // renders for a queue; only what fills it changes. TASK-588 — the show is the
  // emphasised half and the episode trails it, so the line says the same thing
  // the channel's own card does.
  function renderUpNext() {
    [upNextParts(detail)].filter(Boolean).forEach(function(p) { player.setUpNext(p.prefix, p.label, p.suffix); });
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

  // TASK-565 — the phone is told what the CARD says while one is up, and
  // nothing while a programme plays. Two answers from one place, so the two
  // surfaces cannot disagree about what the television is showing.
  var CARD_LINE = {
    'true': function() { return cardStatus(detail); },
    'false': function() { return null; }
  };
  function sendChannelContext() {
    [wsApp].filter(Boolean).forEach(function(ws) {
      ws.sendContext(channelVideoContext(player.currentVideoDisplay(), crumbSource(), CARD_LINE[cardUp + '']()));
    });
  }

  // ── THE CARD ──────────────────────────────────────────────────────────────
  //
  // One component, two callers (decision 8): the gap between two items, and a
  // channel with nothing on. What differs is which fields the view carries, so
  // the render hides what is absent rather than branching on which card it is.
  // TASK-592 — TWO children per row, still. `#card-rows` is a two-column grid
  // (`auto 1fr`), so the episode goes INSIDE the title cell as a stack: a third
  // child appended here would shift every clock into the wrong column and the
  // card would come apart. The episode is empty for anything with no show, and
  // `.card-episode:empty` hides it in CSS — the `:empty` idiom `#card-rows`
  // already uses — rather than a branch here, because cyclomatic complexity is
  // capped at 1 across `ui/**`.
  function appendRow(line) {
    var rows = document.getElementById('card-rows');
    var time = document.createElement('div');
    time.className = 'card-time';
    time.textContent = line.time;
    var cell = document.createElement('div');
    cell.className = 'card-title-cell';
    var title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = line.title;
    var episode = document.createElement('div');
    episode.className = 'card-episode';
    episode.textContent = line.episode;
    cell.appendChild(title);
    cell.appendChild(episode);
    rows.appendChild(time);
    rows.appendChild(cell);
  }
  function renderCard(view) {
    document.getElementById('card-label').textContent = view.label;
    var headline = document.getElementById('card-headline');
    headline.textContent = [view.headline].filter(Boolean).concat([''])[0];
    headline.classList.toggle('hidden', !view.headline);
    var back = document.getElementById('card-return');
    back.textContent = [view.returnAt].filter(Boolean).concat([''])[0];
    back.classList.toggle('hidden', !view.returnAt);
    var rows = document.getElementById('card-rows');
    rows.textContent = '';
    view.timed.forEach(appendRow);
    document.getElementById('card-rule').classList.toggle('hidden', !view.later.length);
    document.getElementById('card-later-block').classList.toggle('hidden', !view.later.length);
    document.getElementById('card-later').textContent = laterText(view.later);
  }
  function showCard() {
    cardUp = true;
    renderCard(cardView(detail));
    document.getElementById('channel-card').classList.remove('hidden');
    sendChannelContext();
  }
  function hideCard() {
    cardUp = false;
    document.getElementById('channel-card').classList.add('hidden');
  }

  // Stop, and only stop. Escape/Backspace and the phone's own back leave the
  // channel the way they leave any play — an off-air channel HOLDS on its card
  // now (below) rather than bouncing the viewer out from under themselves.
  function leaveChannel() { navTo('browse.html', { tab: 'channels' }); }

  // Nothing on (story 5). The card names when the channel is back, or says off
  // air and names nothing — a channel between slots with nothing left, one
  // nobody has regenerated, and one whose programme has run out all arrive here
  // and there is deliberately no fourth card. The hold is what the viewer sees
  // when a channel goes off air under them, and when browse's own thirty-second-
  // old card loses the race; it polls, so the channel coming back tunes itself in.
  function holdOffAir() {
    loadedId = null;
    showCard();
  }

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
    hideCard();
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

  var ON_AIR = { 'true': startOnAir, 'false': holdOffAir };
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
  //
  // The lookahead is the CARD's (TASK-565): three timed lines and an untimed
  // later list come out of this one answer, so the request asks for both halves
  // rather than the endpoint's own default of three.
  function rejoin() {
    clearTimeout(holdTimer);
    retuning = true;
    loadChannel(SERVER, channelId, profile, CARD_LOOKAHEAD)
      .then(applyChannel)
      .catch(function() { retuning = false; });
  }
  // The FIRST fetch is different in one way only: failing it means nothing plays
  // at all, which is the existing "can't reach the server" page rather than a
  // silent black screen. A later failure just leaves the viewer watching and
  // lets the next tick try again.
  function tuneIn() {
    loadChannel(SERVER, channelId, profile, CARD_LOOKAHEAD)
      .then(applyChannel)
      .catch(function() { navTo('error.html'); });
  }

  // THE GAP (TASK-565 story 1). The card goes up on the schedule the player is
  // already holding — which is why it can be drawn the instant an item ends,
  // with nothing to fetch first — and the player rejoins when it clears.
  //
  // ⚠️ THE CHANNEL STILL RUNS THROUGH THE CARD. Nothing is paused: the hold is
  // read off the channel's own clock, so the card comes down when the schedule
  // says the next programme has started and never sooner (TASK-574 —
  // core/channel-card.js holdSeconds says why the eight seconds is a floor and
  // not the whole answer). An item that ended on time is followed within eight
  // seconds by a programme already running; an item the viewer skipped out of
  // holds for the rest of its slot, rather than clearing into the middle of the
  // thing that just finished.
  //
  // `retuning` is what stops the tick asking again while the card is up; the
  // rejoin clears it.
  function interstitial() {
    retuning = true;
    showCard();
    holdTimer = setTimeout(rejoin, holdSeconds(detail, elapsedSeconds()) * 1000);
  }

  // ⚠️ RESTART DOES NOT PAUSE THE CHANNEL (decision 11) — this seeks the VIEWER
  // and moves nothing else. The channel keeps running without them, the marker
  // walks away from the playhead, and finishing the item skips roughly what was
  // re-watched. That is the whole point: a clock, not a queue that waits.
  function restart() { player.seekTo(0); }

  var RETUNE = { 'true': interstitial, 'false': noop };
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

  // The one thing that waits on a poll rather than an event: a channel HELD on
  // its off-air card has no clock of its own to run out, so nothing else would
  // ever ask whether it is back.
  var POLL = { 'true': rejoin, 'false': noop };
  function pollOffAir() {
    POLL[[cardUp, !detail.on_air, !retuning].every(Boolean) + '']();
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
    onStop: leaveChannel,
    // The end of the item the viewer was actually watching. Always the gap,
    // whether they sat through it level with the channel or restarted it and
    // finished late — and the card is what covers the join either way.
    onEnded: interstitial,
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
  setInterval(pollOffAir, OFF_AIR_POLL_MS);
}
