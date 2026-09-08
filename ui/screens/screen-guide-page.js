import { getProfile, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { connectApp } from '../../core/app-ws.js';
import { loadChannels, loadChannelSchedule } from '../../core/app-api.js';
import { channelCardView } from '../../core/channels.js';
import { dayTabs, todayKey, guideColumn, guideHead, guideTailLine, guideMoreLine,
         nowLabel, quietLabel } from '../../core/guide.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { mountBreadcrumb } from './breadcrumb.js';

// TASK-590 (FEAT-560) — the Guide: every channel this profile can see on one
// page, what each is playing right now on a single line across the top, and the
// rest of today and tomorrow listed underneath.
//
// THE PRINCIPLE: now is aligned across channels, later is not. One horizontal
// line answers "three things are on, which do I sit down for", so every
// channel's ON NOW card sits on one baseline — that is the whole reason this is
// a grid rather than three lists side by side. Below it a proportional grid
// would draw a 22-minute episode as an unlabelable sliver beside a 194-minute
// film, so each channel runs its own list at its own length instead.
//
// READ ONLY. OK on an on-now card tunes in; a later programme is not a control
// at all — no reminders, no watch-later, no recording. A channel that queues
// things up for you is a queue, which is what decision 1 rejected on purpose.
var SERVER = window.location.origin;

// The strip's own poll, the same thirty seconds the Channels tab uses: only a
// re-read rolls a card on to the next programme when an item ends.
var STRIP_POLL_MS = 30000;
// The listing moves far more slowly — a programme is written down six months
// ahead — so it is re-read on the minutes rather than the seconds. It is re-read
// at all so a Guide left up for an evening drops the rows that have since aired
// instead of offering a viewer a programme that started an hour ago.
var SCHEDULE_POLL_MS = 300000;
var TICK_MS = 1000;

// A column never divides below this. Four fit a 1080p screen without scrolling;
// a fifth channel scrolls sideways rather than shrinking all five into columns
// too narrow to read a programme title in. The alternative — every channel
// always visible — is what makes eight channels unreadable at any size.
var COL_MIN_PX = 400;
// One press of ▲ ▼ moves the listing about a card's worth. Enough that a press
// is worth making, small enough that nothing is jumped over unread.
var SCROLL_STEP_PX = 240;

var OFF_AIR_TAG = 'OFF AIR';
var PLAY_KEYS = { Enter: true, ' ': true };

export function initGuidePage() {
  var profile = [getProfile()].filter(Boolean).concat(['kids'])[0];
  var state = { lines: [], schedules: {}, stripAt: 0, tabs: [], dayKey: null, today: null };

  function noop() {}
  function grid() { return document.getElementById('guide-grid'); }

  // The card ticks off the clock, exactly as the strip's does: a position baked
  // at fetch time is wrong within a minute of render, so what moves it is real
  // seconds elapsed since the fetch, not a second request.
  function elapsedSeconds() { return (Date.now() - state.stripAt) / 1000; }
  function isToday() { return state.dayKey === state.today; }

  function el(tag, className) {
    var node = document.createElement(tag);
    node.className = className;
    return node;
  }
  // One line of text, absent rather than blank when there is nothing to say —
  // the same rule the channel card's Next line follows.
  function textLine(parent, className, text) {
    var node = el('div', className);
    node.textContent = text;
    node.hidden = !text;
    parent.appendChild(node);
    return node;
  }

  // --- band 1: the channel heads -------------------------------------------
  function headCell(line) {
    var head = document.createElement('div');
    head.className = 'guide-colhead';
    var column = guideColumn(state.schedules[line.channel_id], state.dayKey, isToday());
    var view = guideHead(state.schedules[line.channel_id], column);
    textLine(head, 'guide-chname', [view.name].filter(Boolean).concat([line.name])[0]);
    textLine(head, 'guide-chmeta', view.meta);
    return head;
  }

  // --- band 2: the now line ------------------------------------------------
  function fromStamp() {
    return Object.keys(state.schedules)
      .map(function(id) { return state.schedules[id].from; }).filter(Boolean)[0];
  }
  var NOW_TAG = {
    'true': function() { return nowLabel(fromStamp()); },
    'false': function() { return quietLabel(state.dayKey); }
  };
  function nowLine() {
    var row = document.createElement('div');
    row.id = 'now-line';
    row.classList.toggle('quiet', !isToday());
    var tag = document.createElement('span');
    tag.id = 'now-tag';
    tag.textContent = NOW_TAG[isToday() + '']();
    var rule = document.createElement('span');
    rule.id = 'now-rule';
    row.appendChild(tag);
    row.appendChild(rule);
    return row;
  }

  // --- band 3: what is on, on one baseline ---------------------------------
  // TODAY the card is the STRIP's own card — the same core view model, the same
  // ticking amber bar, the same minutes. The window deliberately does not carry
  // the programme already playing (it belongs to the window before this one), so
  // this is the band the listing cannot draw and the one the two surfaces must
  // never derive twice.
  //
  // ⛔ The bar is the CHANNEL's position, never the viewer's (decision 14).
  // Nothing here may reach core/progress.js.
  function todayCard(card, line) {
    var view = channelCardView(line, elapsedSeconds());
    card.setAttribute('data-tune', ({ 'true': '1', 'false': '0' })[view.onAir + '']);
    card.classList.toggle('off-air', !view.onAir);
    textLine(card, 'now-tag', ({ 'true': 'ON NOW', 'false': OFF_AIR_TAG })[view.onAir + '']);
    textLine(card, 'now-title', view.title);
    // The episode where there is one, else what follows this — both are the
    // strip's own lines, and an off-air card has neither.
    textLine(card, 'now-sub', [view.episode].filter(Boolean).concat([view.next])[0]);
    textLine(card, 'now-pos', view.time);
    var bar = el('div', 'now-bar');
    var fill = el('span', 'now-bar-fill');
    fill.style.width = view.percent + '%';
    bar.appendChild(fill);
    card.appendChild(bar);
  }

  // TOMORROW nothing is on, so the channel's FIRST programme of that day stands
  // where its on-now card was (story 6) and the rest of the day lists under it.
  // The page keeps its four bands rather than becoming a second layout.
  function leadCard(card, line) {
    var column = guideColumn(state.schedules[line.channel_id], state.dayKey, isToday());
    var lead = [column.lead].filter(Boolean);
    card.setAttribute('data-tune', '0');
    card.classList.toggle('off-air', !column.lead);
    textLine(card, 'now-tag', ({ 'true': 'FIRST ON', 'false': OFF_AIR_TAG })[!!column.lead + '']);
    textLine(card, 'now-title', lead.map(function(l) { return l.title; }).concat(['Off air'])[0]);
    textLine(card, 'now-sub', lead.map(function(l) { return l.sub; }).concat([''])[0]);
    textLine(card, 'now-pos', lead.map(function(l) { return l.time; }).concat([''])[0]);
  }

  var FILL_CARD = { 'true': todayCard, 'false': leadCard };

  // Story 5 — OK on an on-now card tunes to that channel; on a later programme
  // nothing happens. `data-tune` is written where the card is filled, so the
  // press is a plain lookup: a channel off air has nothing to tune into, and a
  // day that has not started has nothing on at all.
  var PRESS = {
    '1': function(id) { navTo('video.html', { from: 'guide', channel: id }); },
    '0': noop
  };
  function press(card) {
    PRESS[card.getAttribute('data-tune')](card.getAttribute('data-channel'));
  }

  function nowCell(line) {
    var card = el('article', 'guide-now');
    card.tabIndex = 0;
    card.setAttribute('data-band', 'cards');
    card.setAttribute('data-channel', line.channel_id);
    FILL_CARD[isToday() + ''](card, line);
    card.addEventListener('click', function() { press(card); });
    card.addEventListener('keydown', function(e) {
      [PLAY_KEYS[e.key]].filter(Boolean).forEach(function() { e.preventDefault(); press(card); });
    });
    return card;
  }

  // --- band 4: the rest of the day -----------------------------------------
  function listRow(row) {
    var node = el('div', 'guide-row');
    textLine(node, 'guide-time', row.time);
    var info = el('div', 'guide-row-info');
    textLine(info, 'guide-row-title', row.title);
    textLine(info, 'guide-row-sub', row.sub);
    node.appendChild(info);
    return node;
  }
  function listCell(line) {
    var column = guideColumn(state.schedules[line.channel_id], state.dayKey, isToday());
    var list = el('div', 'guide-list');
    column.rows.forEach(function(row) { list.appendChild(listRow(row)); });
    textLine(list, 'guide-more', guideMoreLine(column));
    // Story 4 — the day's end names the time it stops and when it is next on.
    // The stop is the last programme's REAL end, never the slot's: an item
    // pulled inside a slot runs past it (decision 7).
    textLine(list, 'guide-tail', guideTailLine(column.tail));
    return list;
  }

  // --- the grid ------------------------------------------------------------
  // Four bands, appended a band at a time: heads, the now line, the cards, the
  // lists. A CSS grid of one column per channel is what puts every card on one
  // baseline — the alignment is the page's whole argument, so it is geometry
  // rather than three columns agreeing to be the same height.
  function renderGrid() {
    var root = grid();
    root.innerHTML = '';
    root.style.gridTemplateColumns = 'repeat(' + state.lines.length + ', minmax(' + COL_MIN_PX + 'px, 1fr))';
    state.lines.forEach(function(line) { root.appendChild(headCell(line)); });
    root.appendChild(nowLine());
    state.lines.forEach(function(line) { root.appendChild(nowCell(line)); });
    state.lines.forEach(function(line) { root.appendChild(listCell(line)); });
  }
  function renderEmpty() {
    var root = grid();
    root.innerHTML = '';
    root.style.gridTemplateColumns = '1fr';
    textLine(root, 'guide-empty', 'No channels');
  }
  var RENDER_GRID = { 'true': renderGrid, 'false': renderEmpty };

  function selectDay(key) {
    state.dayKey = key;
    render();
  }
  function dayTab(tab) {
    var b = document.createElement('button');
    b.className = 'guide-day';
    b.classList.toggle('on', tab.key === state.dayKey);
    b.setAttribute('data-band', 'tabs');
    b.setAttribute('data-day', tab.key);
    b.textContent = tab.label;
    b.addEventListener('click', function() { selectDay(tab.key); });
    return b;
  }
  function renderTabs() {
    var root = document.getElementById('day-tabs');
    root.innerHTML = '';
    state.tabs.forEach(function(tab) { root.appendChild(dayTab(tab)); });
  }

  // Re-rendering rebuilds every card, so the focused channel is remembered
  // across it: a schedule re-read or a day switch should not throw the viewer
  // back to the first column.
  function focusedChannel() {
    return [document.activeElement].filter(Boolean)
      .map(function(node) { return node.getAttribute('data-channel'); }).filter(Boolean)[0];
  }
  function restoreFocus(channelId) {
    [document.querySelector('.guide-now[data-channel="' + channelId + '"]')]
      .filter(Boolean).forEach(function(node) { node.focus(); });
  }
  function render() {
    var focused = focusedChannel();
    renderTabs();
    RENDER_GRID[(state.lines.length > 0) + '']();
    [focused].filter(Boolean).forEach(restoreFocus);
  }

  // --- the clock -----------------------------------------------------------
  // Only today's cards tick: tomorrow's band names a start time, which does not
  // move. Re-applying the view rather than rebuilding the card keeps focus where
  // it is mid-browse.
  function tickCard(card, view) {
    card.querySelector('.now-pos').textContent = view.time;
    card.querySelector('.now-bar-fill').style.width = view.percent + '%';
  }
  function tickCards() {
    var elapsed = elapsedSeconds();
    var byId = {};
    state.lines.forEach(function(line) { byId[line.channel_id] = line; });
    Array.from(document.querySelectorAll('.guide-now')).forEach(function(card) {
      [byId[card.getAttribute('data-channel')]].filter(Boolean).forEach(function(line) {
        tickCard(card, channelCardView(line, elapsed));
      });
    });
  }
  var TICK = { 'true': tickCards, 'false': noop };
  function tick() { TICK[isToday() + ''](); }

  // --- loading -------------------------------------------------------------
  function applyStrip(lines) {
    state.lines = lines;
    state.stripAt = Date.now();
  }
  // A failed poll leaves the last good page on screen and lets the next one try:
  // a Guide going blank because one request lost the LAN is worse than one that
  // is thirty seconds stale.
  function pollStrip() {
    loadChannels(SERVER, profile)
      .then(function(res) {
        applyStrip([res.channels].filter(Boolean).concat([[]])[0]);
        render();
      })
      .catch(noop);
  }

  // One listing per channel, each asking for nothing but the profile: the
  // backend's own defaults are exactly the window this page wants — from now,
  // for the two days it shows — so the app never puts its own clock in the
  // question. A channel whose listing fails is drawn from the strip alone rather
  // than taking the page down with it.
  function loadSchedules() {
    return Promise.all(state.lines.map(function(line) {
      return loadChannelSchedule(SERVER, line.channel_id, profile).catch(noop);
    }));
  }
  function applySchedules(answers) {
    var schedules = {};
    answers.filter(Boolean).forEach(function(s) { schedules[s.channel_id] = s; });
    state.schedules = schedules;
    // Today comes back WITH the data — every answer carries the `from` the
    // backend settled on — so the page's idea of what day it is never comes off
    // this device's own clock.
    state.today = [todayKey(answers.filter(Boolean))].filter(Boolean).concat([state.today])[0];
    state.tabs = dayTabs(state.today);
    state.dayKey = [state.dayKey].filter(Boolean).concat([state.today])[0];
  }
  function pollSchedules() {
    loadSchedules()
      .then(function(answers) { applySchedules(answers); render(); })
      .catch(noop);
  }

  // --- the page ------------------------------------------------------------
  function goBack(e) {
    [e].filter(Boolean).forEach(function(ev) { ev.preventDefault(); });
    navTo('browse.html', { tab: 'channels' });
  }

  function bandStops(band) {
    return Array.from(document.querySelectorAll('[data-band="' + band + '"]'));
  }
  function bandOf(node) {
    return [node].filter(Boolean).map(function(n) { return n.getAttribute('data-band'); })
      .filter(Boolean).concat(['cards'])[0];
  }
  // ◀ ▶ move along the band you are in — between the day tabs, or between the
  // channels' on-now cards, which is the row the page is built around.
  function step(delta) {
    var here = document.activeElement;
    var stops = bandStops(bandOf(here));
    var at = stops.indexOf(here);
    [stops[Math.max(0, Math.min(stops.length - 1, at + delta))]].filter(Boolean)
      .forEach(function(node) { node.focus(); });
  }
  function focusTabs() {
    [document.querySelector('.guide-day.on')].filter(Boolean).forEach(function(node) { node.focus(); });
  }
  function focusCards() {
    [document.querySelector('.guide-now')].filter(Boolean).forEach(function(node) { node.focus(); });
  }

  // ▲ ▼ move the PAGE, because the listing has nothing to focus. A later
  // programme is not a control (no reminders, no recording — decision 1), so
  // there is no focus stop to walk down into and no way to read past the fold
  // unless the page itself moves. ◀ ▶ still move focus between the cards, and
  // focusing one scrolls it into view, which is what carries the sideways scroll
  // when there are more channels than fit.
  //
  // The browser clamps scrollTop at both ends, so neither direction needs to ask
  // how far it can go.
  function scrollGrid(delta) {
    grid().scrollTop += delta;
  }
  // ▲ from the cards scrolls back up, and only once the listing is already at
  // the top does it leave for the day tabs — so a viewer reading down a column
  // gets back to the top of that column before the page hands them somewhere
  // else. From the tabs there is nothing above.
  var UP_FROM_CARDS = {
    'true':  focusTabs,
    'false': function() { scrollGrid(-SCROLL_STEP_PX); }
  };
  var UP = {
    tabs:  noop,
    cards: function() { UP_FROM_CARDS[(grid().scrollTop <= 0) + ''](); }
  };
  var DOWN = {
    tabs:  focusCards,
    cards: function() { scrollGrid(SCROLL_STEP_PX); }
  };
  function goUp() { UP[bandOf(document.activeElement)](); }
  function goDown() { DOWN[bandOf(document.activeElement)](); }

  var wsApp = connectApp(window.location.origin, function(intent, params) {
    var INTENTS = {
      navigate_left:  function() { step(-1); },
      navigate_right: function() { step(1); },
      navigate_up:    goUp,
      navigate_down:  goDown,
      // The phone drives the TV into a channel by naming it, the same way its
      // Channels dock does — the Guide's own press rule still decides, so an
      // off-air channel refuses here exactly as it does on the TV.
      play:           function() {
        [params].filter(Boolean).map(function(p) { return p.id; }).filter(Boolean)
          .map(function(id) { return document.querySelector('.guide-now[data-channel="' + id + '"]'); })
          .filter(Boolean).forEach(press);
      },
      // Switching day is a page-level move rather than a channel one, so it
      // rides its own intent and both surfaces end up on the same day.
      guide_day:      function() {
        [params].filter(Boolean).map(function(p) { return p.day; }).filter(Boolean).forEach(selectDay);
      },
      back:           function() { goBack(null); },
      navigate:       function() { navTo(params.page, params.params); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  });
  wsApp.sendContext({ context_id: 'guide' });
  wsApp.sendAppState({ screen: 'guide', profile: profile });

  document.addEventListener('keydown', dispatchKey);
  mountBreadcrumb('breadcrumb', buildCrumbs('guide'));

  initPage({
    onEnter: focusCards,
    keys: {
      Escape:     function(e) { goBack(e); },
      Backspace:  function(e) { goBack(e); },
      ArrowLeft:  function(e) { e.preventDefault(); step(-1); },
      ArrowRight: function(e) { e.preventDefault(); step(1); },
      ArrowUp:    function(e) { e.preventDefault(); goUp(); },
      ArrowDown:  function(e) { e.preventDefault(); goDown(); }
    },
    remote: {}
  });

  loadChannels(SERVER, profile)
    .then(function(res) {
      applyStrip([res.channels].filter(Boolean).concat([[]])[0]);
      return loadSchedules();
    })
    .then(function(answers) {
      applySchedules(answers);
      render();
      focusCards();
      setInterval(pollStrip, STRIP_POLL_MS);
      setInterval(pollSchedules, SCHEDULE_POLL_MS);
      setInterval(tick, TICK_MS);
    })
    .catch(function() { navTo('error.html'); });
}
