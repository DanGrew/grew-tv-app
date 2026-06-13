// Companion person picker (FEAT-026 TASK-156, generalizing TASK-120): mirrors
// the TV person cards + adult PIN gate. A kid person sends the setProfile intent
// (carrying the person id) straight away; an adult person reveals a tappable
// keypad and only sends the intent on its effective code. The gate is validated
// here against the same config.json the TV uses, then a setProfile intent jumps
// both devices to Home. View-model logic lives in core/.

import { connect } from '../../core/companion-ws.js';
import { wsUrl } from '../../core/server-config.js';
import { screenPage } from '../../core/companion-utils.js';
import { screenColour, screenLabel } from '../../core/screen-chooser.js';
import { loadConfig, mediaUrl } from '../../core/app-api.js';
import {
  defaultConfig, parseConfig, isLocked, pinMatches, pushDigit, popDigit, isPinComplete, dotFill
} from '../../core/profile-config.js';

var KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
var KEY_LABEL = { back: '⌫', ok: '✓' };
var PH_EMOJI = { kids: '🧒', adults: '🧑' };

export function initPage() {
  var host = window.location.hostname;
  var server = 'http://' + host + ':8765';
  var els = {
    connStatus: document.getElementById('conn-status'),
    ctxLabel: document.getElementById('ctx-label'),
    ctxTitle: document.getElementById('ctx-title'),
    screenBar: document.getElementById('screen-bar'),
    actionsEl: document.getElementById('actions')
  };
  var config = defaultConfig();
  var pinEntry = '';
  var pinForPerson = null;
  var onProfile = false;
  var dotsEl = null;
  var keypadWrap = null;
  var keypadTitle = null;
  var api = {};
  function getApi() { return api; }

  function noop() {}

  function pick(id) { getApi().setProfile(id); }

  function shake() {
    keypadWrap.classList.add('shake');
    setTimeout(function() { keypadWrap.classList.remove('shake'); }, 400);
  }

  function renderDots() {
    var fills = dotFill(pinEntry);
    Array.prototype.slice.call(dotsEl.children).forEach(function(el, i) { el.className = ({ true: 'on', false: '' })[fills[i]]; });
  }

  function submit() {
    ({ true: function() { pick(pinForPerson.id); }, false: function() { shake(); pinEntry = ''; renderDots(); } })[pinMatches(config, pinForPerson, pinEntry)]();
  }

  function onDigit(d) {
    pinEntry = pushDigit(pinEntry, d);
    renderDots();
    ({ true: submit, false: noop })[isPinComplete(pinEntry)]();
  }

  function onBack() { pinEntry = popDigit(pinEntry); renderDots(); }
  function onOk() { ({ true: submit, false: noop })[isPinComplete(pinEntry)](); }

  function showKeypad(person) {
    pinForPerson = person;
    pinEntry = '';
    keypadTitle.textContent = 'Enter code — ' + person.name;
    keypadWrap.classList.add('active');
    renderDots();
  }

  function onCardTap(person) {
    ({ true: function() { showKeypad(person); }, false: function() { pick(person.id); } })[isLocked(person)]();
  }

  function photoNode(person) {
    var photo = document.createElement('div');
    photo.className = 'cmp-photo ' + person.profile;
    var img = document.createElement('img');
    img.className = 'cmp-photo-img';
    img.alt = '';
    var ph = document.createElement('div');
    ph.className = 'cmp-photo-ph';
    ph.textContent = [PH_EMOJI[person.profile]].filter(Boolean).concat(['👤'])[0];
    var src = mediaUrl(server, person.photo);
    ({
      true: function() {
        img.src = src;
        ph.style.display = 'none';
        img.addEventListener('error', function() { img.style.display = 'none'; ph.style.display = 'flex'; });
      },
      false: function() { img.style.display = 'none'; }
    })[String(!!src)]();
    photo.appendChild(img);
    photo.appendChild(ph);
    return photo;
  }

  function buildCard(person, container) {
    var card = document.createElement('button');
    card.className = 'cmp-card';
    card.setAttribute('data-id', person.id);
    [isLocked(person)].filter(Boolean).forEach(function() {
      var lock = document.createElement('div');
      lock.className = 'cmp-lock';
      lock.textContent = '🔒';
      card.appendChild(lock);
    });
    card.appendChild(photoNode(person));
    var name = document.createElement('div');
    name.className = 'cmp-name';
    name.textContent = person.name;
    card.appendChild(name);
    card.addEventListener('click', function() { onCardTap(person); });
    container.appendChild(card);
  }

  function buildKeypad() {
    var ACTIONS = { back: onBack, ok: onOk };
    KEYS.forEach(function(k) {
      var b = document.createElement('button');
      b.className = 'cmp-key';
      b.setAttribute('data-key', k);
      b.textContent = [KEY_LABEL[k]].filter(Boolean).concat([k])[0];
      b.addEventListener('click', [ACTIONS[k]].filter(Boolean).concat([function() { onDigit(k); }])[0]);
      keypadWrap.querySelector('.cmp-keypad').appendChild(b);
    });
  }

  function renderPicker() {
    els.actionsEl.innerHTML = '';
    els.actionsEl.style.display = '';
    els.actionsEl.style.flexDirection = '';
    var cards = document.createElement('div');
    cards.className = 'cmp-cards';
    config.persons.forEach(function(p) { buildCard(p, cards); });
    els.actionsEl.appendChild(cards);
    keypadWrap = document.createElement('div');
    keypadWrap.className = 'cmp-keypad-wrap';
    keypadTitle = document.createElement('div');
    keypadTitle.className = 'cmp-keypad-title';
    keypadWrap.appendChild(keypadTitle);
    dotsEl = document.createElement('div');
    dotsEl.className = 'cmp-dots';
    [0, 1, 2, 3].forEach(function() { dotsEl.appendChild(document.createElement('span')); });
    keypadWrap.appendChild(dotsEl);
    var grid = document.createElement('div');
    grid.className = 'cmp-keypad';
    keypadWrap.appendChild(grid);
    els.actionsEl.appendChild(keypadWrap);
    buildKeypad();
  }

  function onContext(payload) {
    var page = screenPage(payload.context_id);
    ({
      true: function() { window.location.href = page + '.html'; },
      false: function() {
        onProfile = true;
        els.ctxLabel.textContent = 'Profile';
        els.ctxTitle.textContent = "Who's watching?";
        renderPicker();
      }
    })[page !== 'profile']();
  }

  // Screen chooser (FEAT-026 TASK-158): the live device list arrives over the WS.
  // A sole screen auto-targets in companion-ws; with several, tapping a screen
  // button targets it. Hidden when there is nothing to choose between (≤1).
  function buildScreenBtn(d) {
    var b = document.createElement('button');
    b.className = 'screen-btn';
    b.setAttribute('data-id', d.device_id);
    var sw = document.createElement('span');
    sw.className = 'screen-swatch';
    sw.style.backgroundColor = screenColour(d);
    b.appendChild(sw);
    var label = document.createElement('span');
    label.className = 'screen-btn-label';
    label.textContent = screenLabel(d);
    b.appendChild(label);
    b.addEventListener('click', function() { getApi().target(d.device_id); });
    els.screenBar.appendChild(b);
  }

  function buildScreenList(devices) {
    var label = document.createElement('div');
    label.className = 'screen-bar-label';
    label.textContent = 'Drive screen';
    els.screenBar.appendChild(label);
    devices.forEach(buildScreenBtn);
  }

  function onDevices(devices) {
    els.screenBar.innerHTML = '';
    ({ true: function() { buildScreenList(devices); }, false: noop })[devices.length > 1]();
  }

  api = connect(wsUrl(host), onContext, function(status) { els.connStatus.textContent = status; }, noop, onDevices);
  // Config may land after the picker first renders (default config) — re-render
  // so real photos/labels appear. Skips a rebuild when not on the profile view.
  loadConfig(server).then(parseConfig).then(function(cfg) {
    config = cfg;
    [onProfile].filter(Boolean).forEach(renderPicker);
  }).catch(noop);
}
