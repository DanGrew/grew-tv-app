import { connect } from '../../core/companion-ws.js';
import { loadChannels, loadChannelSchedule } from '../../core/app-api.js';
import { screenPage } from '../../core/companion-utils.js';
import { channelCardView } from '../../core/channels.js';
import { dayTabs, todayKey, guideColumn, guideHead, guideTailLine, guideMoreLine,
         nowLabel, quietLabel } from '../../core/guide.js';
import { buildCrumbs } from '../../core/breadcrumb.js';
import { createCompanionMode } from '../../core/companion-mode.js';
import { switchProfileTarget } from '../../core/switch-profile.js';
import { mountCompanionBreadcrumb } from './companion-breadcrumb.js';
import { mountScreenBar } from './companion-screen-bar.js';
import { mountSyncBar } from './companion-sync-bar.js';
import { mountStatusMenu } from './companion-status-menu.js';

// TASK-590 — the companion mirror of screen-guide-page.js (FEAT-017/028 mirror
// invariant). The same Guide, off the SAME core/guide.js model and the same two
// reads, so the phone and the television cannot disagree about what is on or
// what follows it.
//
// The phone is arguably where the question actually gets asked — "is it on now,
// or is it on at eight" is asked standing in a kitchen — so this is not a
// consolation copy. What differs is only the shape a phone can hold: the TV's
// four bands sit side by side across a 1920px grid, and here they stack, one
// channel after another, each carrying the same four things.
//
// Tapping an on-now card drives the TV into that channel, like every other
// companion control that moves the television — greyed while desynced. The day
// tabs are local in both modes (reading is the whole point of the page) and tell
// the TV to follow when synced, so the two surfaces stay on the same day.
var STRIP_POLL_MS = 30000;
var SCHEDULE_POLL_MS = 300000;
var TICK_MS = 1000;

var OFF_AIR_TAG = 'OFF AIR';

export function initPage() {
  mountStatusMenu(['mode', 'screen', 'profile']);
  var server = window.location.origin;
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxTitle: document.getElementById('ctx-title'),
    actionsEl: document.getElementById('actions')
  };
  var state = { profile: null, person: null, lines: [], schedules: {}, stripAt: 0,
                tabs: [], dayKey: null, today: null };
  var api = {};
  var updateBar = null;
  var mode = createCompanionMode();
  function noop() {}
  function getApi() { return api; }
  function onDevices(devices) { updateBar(devices); }

  function elapsedSeconds() { return (Date.now() - state.stripAt) / 1000; }
  function isToday() { return state.dayKey === state.today; }

  function el(tag, className) {
    var node = document.createElement(tag);
    node.className = className;
    return node;
  }
  function textLine(parent, className, text) {
    var node = el('div', className);
    node.textContent = text;
    node.hidden = !text;
    parent.appendChild(node);
    return node;
  }

  // --- the day tabs and the now line ---------------------------------------
  function selectDay(key) {
    state.dayKey = key;
    // The TV follows a day switch made here; while desynced the intent is
    // already a no-op at the WS layer, and the phone still switches its own.
    api.sendIntent('guide_day', { day: key });
    render();
  }
  function dayTab(tab) {
    var b = document.createElement('button');
    b.className = 'guide-day';
    b.classList.toggle('on', tab.key === state.dayKey);
    b.setAttribute('data-day', tab.key);
    b.textContent = tab.label;
    b.addEventListener('click', function() { selectDay(tab.key); });
    return b;
  }
  function tabsRow() {
    var row = el('div', 'guide-days');
    state.tabs.forEach(function(tab) { row.appendChild(dayTab(tab)); });
    return row;
  }
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
    row.className = 'guide-nowline';
    row.classList.toggle('quiet', !isToday());
    row.textContent = NOW_TAG[isToday() + '']();
    return row;
  }

  // --- one channel ---------------------------------------------------------
  // ⛔ The bar is the CHANNEL's position, never the viewer's (decision 14) —
  // the same view model the TV draws and the phone's own Channels dock draws,
  // and nothing here may reach core/progress.js.
  function todayCard(card, line) {
    var view = channelCardView(line, elapsedSeconds());
    card.setAttribute('data-tune', ({ 'true': '1', 'false': '0' })[view.onAir + '']);
    card.classList.toggle('off-air', !view.onAir);
    card.classList.toggle('desync-off', mode.isDesynced());
    textLine(card, 'now-tag', ({ 'true': 'ON NOW', 'false': OFF_AIR_TAG })[view.onAir + '']);
    textLine(card, 'now-title', view.title);
    textLine(card, 'now-sub', [view.episode].filter(Boolean).concat([view.next])[0]);
    textLine(card, 'now-pos', view.time);
    var bar = el('div', 'now-bar');
    var fill = el('span', 'now-bar-fill');
    fill.style.width = view.percent + '%';
    bar.appendChild(fill);
    card.appendChild(bar);
  }
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

  // Story 5 on the phone: an on-now card drives the TV into that channel, a
  // later programme does nothing at all. Same `data-tune` rule as the TV, so
  // neither surface can start treating a listing as something to press.
  var PRESS = {
    '1': function(id) { api.sendIntent('play', { id: id }); },
    '0': noop
  };
  function press(card) {
    PRESS[card.getAttribute('data-tune')](card.getAttribute('data-channel'));
  }
  function nowCard(line) {
    var card = document.createElement('button');
    card.className = 'guide-now';
    card.setAttribute('data-channel', line.channel_id);
    FILL_CARD[isToday() + ''](card, line);
    card.addEventListener('click', function() { press(card); });
    return card;
  }

  function listRow(row) {
    var node = el('div', 'guide-row');
    textLine(node, 'guide-time', row.time);
    var info = el('div', 'guide-row-info');
    textLine(info, 'guide-row-title', row.title);
    textLine(info, 'guide-row-sub', row.sub);
    node.appendChild(info);
    return node;
  }
  function channelSection(line) {
    var column = guideColumn(state.schedules[line.channel_id], state.dayKey, isToday());
    var head = guideHead(state.schedules[line.channel_id], column);
    var section = document.createElement('div');
    section.className = 'guide-channel';
    section.setAttribute('data-channel', line.channel_id);
    textLine(section, 'guide-chname', [head.name].filter(Boolean).concat([line.name])[0]);
    textLine(section, 'guide-chmeta', head.meta);
    section.appendChild(nowCard(line));
    var list = el('div', 'guide-list');
    column.rows.forEach(function(row) { list.appendChild(listRow(row)); });
    textLine(list, 'guide-more', guideMoreLine(column));
    textLine(list, 'guide-tail', guideTailLine(column.tail));
    section.appendChild(list);
    return section;
  }

  // --- the page ------------------------------------------------------------
  function renderChannels() {
    els.actionsEl.appendChild(tabsRow());
    els.actionsEl.appendChild(nowLine());
    state.lines.forEach(function(line) { els.actionsEl.appendChild(channelSection(line)); });
  }
  function renderNoChannels() {
    var p = el('div', 'no-actions');
    p.textContent = 'No channels';
    els.actionsEl.appendChild(p);
  }
  var RENDER = { 'true': renderChannels, 'false': renderNoChannels };
  function render() {
    els.actionsEl.innerHTML = '';
    RENDER[(state.lines.length > 0) + '']();
  }

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
  function loadSchedules() {
    return Promise.all(state.lines.map(function(line) {
      return loadChannelSchedule(server, line.channel_id, state.profile).catch(noop);
    }));
  }
  function applySchedules(answers) {
    var schedules = {};
    answers.filter(Boolean).forEach(function(s) { schedules[s.channel_id] = s; });
    state.schedules = schedules;
    state.today = [todayKey(answers.filter(Boolean))].filter(Boolean).concat([state.today])[0];
    state.tabs = dayTabs(state.today);
    state.dayKey = [state.dayKey].filter(Boolean).concat([state.today])[0];
  }
  function applyStrip(res) {
    state.lines = [[res].filter(Boolean).map(function(r) { return r.channels; })[0]]
      .filter(Boolean).concat([[]])[0];
    state.stripAt = Date.now();
  }
  // The Guide needs the profile (which channels this page may see at all), and
  // it arrives on the app_state snapshot — so nothing is fetched until it has,
  // and everything is re-fetched if it changes.
  function loadGuide() {
    [state.profile].filter(Boolean).forEach(function(profile) {
      loadChannels(server, profile)
        .then(function(res) { applyStrip(res); return loadSchedules(); })
        .then(function(answers) { applySchedules(answers); render(); })
        .catch(function() { applyStrip(null); render(); });
    });
  }
  function pollStrip() {
    [state.profile].filter(Boolean).forEach(function(profile) {
      loadChannels(server, profile)
        .then(function(res) { applyStrip(res); render(); })
        .catch(noop);
    });
  }
  function pollSchedules() {
    loadSchedules().then(function(answers) { applySchedules(answers); render(); }).catch(noop);
  }

  function mountCrumbs() {
    mountCompanionBreadcrumb('breadcrumb', buildCrumbs('guide'), function(page, params) {
      api.sendIntent('navigate', { page: page, params: params });
    });
  }

  function followContext(payload) {
    var page = screenPage(payload.context_id);
    var ROUTE = {
      'true':  function() { window.location.href = page + '.html'; },
      'false': noop
    };
    ROUTE[(page !== 'guide') + '']();
  }
  function onContext(payload) {
    ({ true: function() { followContext(payload); }, false: noop })[mode.drivesNav()]();
  }

  function onAppState(snap) {
    state.person = [snap.person].filter(Boolean).concat([state.person])[0];
    [snap.profile].filter(Boolean).filter(function(p) { return p !== state.profile; })
      .forEach(function(p) {
        state.profile = p;
        loadGuide();
      });
  }

  function reSync() { window.location.reload(); }
  function applySwitchProfile() {
    document.getElementById('switch-profile').classList.toggle('desync-off', mode.isDesynced());
  }
  function onToggle(desynced) {
    applySwitchProfile();
    ({ true: render, false: reSync })[desynced]();
  }

  document.getElementById('switch-profile')
    .addEventListener('click', function() { api.sendIntent('navigate', switchProfileTarget()); });
  mountSyncBar(mode, onToggle);
  applySwitchProfile();
  els.ctxTitle.textContent = 'Guide';
  api = connect(server, onContext, function(status) { els.connStatus.textContent = status; },
                onAppState, onDevices, { mode: mode });
  updateBar = mountScreenBar(getApi, noop);
  mountCrumbs();
  setInterval(pollStrip, STRIP_POLL_MS);
  setInterval(pollSchedules, SCHEDULE_POLL_MS);
  setInterval(tick, TICK_MS);
}
