// Person picker (FEAT-026 TASK-156, generalizing TASK-120's Kids/Adults cards):
// N person cards + an adult PIN gate. Persons, photos and the gate PIN come from
// the media-manager's config.json (loaded once, generic placeholders when absent
// — see core/profile-config.js). Selecting a person sets the active person (the
// watch-progress key, TASK-155) and its content class drives the kids/adults
// browse filter. A kid person opens straight to browse; an adult person opens a
// d-pad keypad and only enters on its effective PIN. All view-model logic
// (parsing, PIN state, keypad navigation) lives in core/ and is unit tested; this
// file is the DOM + d-pad wiring only.

import { setProfile, setPerson, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { connectApp } from '../../core/app-ws.js';
import { loadConfig, mediaUrl } from '../../core/app-api.js';
import {
  defaultConfig, parseConfig, isLocked, pinMatches, personById, personByProfile,
  pushDigit, popDigit, isPinComplete, dotFill, keypadNav
} from '../../core/profile-config.js';

// Backend = page origin, not a hardcoded host (BUG-009 — see screen-video-page).
var SERVER = window.location.origin;
var KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
var KEYPAD_COLS = 3;
var KEY_LABEL = { back: '⌫', ok: '✓' };
var PH_EMOJI = { kids: '🧒', adults: '🧑' };

export function initProfilePage() {
  var cardsEl = document.getElementById('profile-cards');
  var panel = document.getElementById('pin-panel');
  var pinTitle = document.getElementById('pin-title');
  var keypadEl = document.getElementById('keypad');
  var dotEls = Array.prototype.slice.call(document.getElementById('pin-dots').children);
  var takeoverPanel = document.getElementById('takeover-panel');
  var takeoverMsg = document.getElementById('takeover-msg');
  var confirmBtns = [document.getElementById('takeover-confirm'),
                     document.getElementById('takeover-cancel')];

  var config = defaultConfig();
  var mode = 'cards';
  var pinEntry = '';
  var pinForPerson = null;
  var keyIndex = 0;
  var confirmIndex = 0;
  var pendingPerson = null;
  var graceTimer = null;
  // Offline grace: if no verdict lands (no companion server connected, e.g. a
  // standalone TV), proceed anyway — with no live peer there is no conflict to
  // gate on. A real person_busy from a localhost server always beats this.
  var GRACE_MS = 600;

  function noop() {}

  function proceed() { clearTimeout(graceTimer); navTo('browse.html'); }

  // Activation-gated (FEAT-026 TASK-158): record the pick, then ask the backend
  // to lock this person to THIS device. The server verdict drives navigation —
  // person_active proceeds, person_busy raises the take-over prompt below.
  function finish(person) {
    setPerson(person.id);
    setProfile(person.profile);
    pendingPerson = person;
    graceTimer = setTimeout(proceed, GRACE_MS);
    wsApp.activatePerson(person.id, false);
  }

  function focusConfirm(i) {
    confirmIndex = Math.max(0, Math.min(confirmBtns.length - 1, i));
    takeoverPanel.querySelectorAll('.takeover-btn')[confirmIndex].focus();
  }

  function openTakeover(label) {
    clearTimeout(graceTimer);
    mode = 'confirm';
    takeoverMsg.textContent = 'Watching on ' + label + ' — take over?';
    takeoverPanel.classList.add('active');
    focusConfirm(0);
  }

  function doTakeover() {
    takeoverPanel.classList.remove('active');
    graceTimer = setTimeout(proceed, GRACE_MS);
    wsApp.activatePerson(pendingPerson.id, true);
  }

  function cancelTakeover() {
    takeoverPanel.classList.remove('active');
    mode = 'cards';
    pendingPerson = null;
    focusFirstCard();
  }

  function selectPerson(person) {
    pinForPerson = person;
    ({ true: function() { openPin(person); }, false: function() { finish(person); } })[isLocked(person)]();
  }

  function focusFirstCard() {
    [config.persons[0]].filter(Boolean).forEach(function(p) { document.getElementById('btn-' + p.id).focus(); });
  }

  function moveCard(delta) {
    var ids = config.persons.map(function(p) { return 'btn-' + p.id; });
    var cur = [ids.indexOf(document.activeElement.id)].filter(function(i) { return i >= 0; }).concat([0])[0];
    var next = Math.max(0, Math.min(ids.length - 1, cur + delta));
    document.getElementById(ids[next]).focus();
  }

  function photoNode(person) {
    var photo = document.createElement('div');
    photo.className = 'profile-photo ' + person.profile;
    var img = document.createElement('img');
    img.className = 'profile-photo-img';
    img.alt = '';
    var ph = document.createElement('div');
    ph.className = 'profile-photo-ph';
    ph.textContent = [PH_EMOJI[person.profile]].filter(Boolean).concat(['👤'])[0];
    var src = mediaUrl(SERVER, person.photo);
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

  function buildCard(person) {
    var card = document.createElement('div');
    card.className = 'profile-card';
    card.id = 'btn-' + person.id;
    card.tabIndex = 0;
    [isLocked(person)].filter(Boolean).forEach(function() {
      var lock = document.createElement('div');
      lock.className = 'lock-badge';
      lock.textContent = '🔒';
      card.appendChild(lock);
    });
    card.appendChild(photoNode(person));
    var name = document.createElement('div');
    name.className = 'profile-name';
    name.textContent = person.name;
    card.appendChild(name);
    card.addEventListener('click', function() { selectPerson(person); });
    cardsEl.appendChild(card);
  }

  function applyConfig(cfg) {
    config = cfg;
    cardsEl.innerHTML = '';
    config.persons.forEach(buildCard);
    // Don't yank focus out of the keypad if the real config lands mid-entry.
    ({ true: focusFirstCard, false: noop })[mode === 'cards']();
  }

  function renderDots() {
    var fills = dotFill(pinEntry);
    dotEls.forEach(function(el, i) { el.className = ({ true: 'on', false: '' })[fills[i]]; });
  }

  function focusKey(i) {
    keyIndex = Math.max(0, Math.min(KEYS.length - 1, i));
    keypadEl.querySelectorAll('.key')[keyIndex].focus();
  }

  function openPin(person) {
    mode = 'pin';
    pinEntry = '';
    pinTitle.textContent = 'Enter code — ' + person.name;
    panel.classList.add('active');
    renderDots();
    focusKey(0);
  }

  function closePin() {
    mode = 'cards';
    panel.classList.remove('active');
    [document.getElementById('btn-' + pinForPerson.id)].filter(Boolean).forEach(function(c) { c.focus(); });
  }

  function shake() {
    panel.classList.add('shake');
    setTimeout(function() { panel.classList.remove('shake'); }, 400);
  }

  function unlock() { finish(pinForPerson); }

  function reject() {
    shake();
    pinEntry = '';
    renderDots();
  }

  function submit() {
    ({ true: unlock, false: reject })[pinMatches(config, pinForPerson, pinEntry)]();
  }

  function onDigit(d) {
    pinEntry = pushDigit(pinEntry, d);
    renderDots();
    ({ true: submit, false: noop })[isPinComplete(pinEntry)]();
  }

  function onBack() {
    pinEntry = popDigit(pinEntry);
    renderDots();
  }

  function onOk() {
    ({ true: submit, false: noop })[isPinComplete(pinEntry)]();
  }

  function buildKeypad() {
    var ACTIONS = { back: onBack, ok: onOk };
    KEYS.forEach(function(k) {
      var b = document.createElement('div');
      b.className = 'key';
      b.tabIndex = 0;
      b.setAttribute('data-key', k);
      b.textContent = [KEY_LABEL[k]].filter(Boolean).concat([k])[0];
      b.addEventListener('click', [ACTIONS[k]].filter(Boolean).concat([function() { onDigit(k); }])[0]);
      keypadEl.appendChild(b);
    });
  }

  function keypadGo(key) { focusKey(keypadNav(keyIndex, key, KEYPAD_COLS, KEYS.length)); }
  function activate() { document.activeElement.click(); }

  var KEYMAP = {
    cards: {
      ArrowLeft: function() { moveCard(-1); },
      ArrowRight: function() { moveCard(1); },
      Enter: activate,
      ' ': activate
    },
    pin: {
      ArrowLeft: function() { keypadGo('ArrowLeft'); },
      ArrowRight: function() { keypadGo('ArrowRight'); },
      ArrowUp: function() { keypadGo('ArrowUp'); },
      ArrowDown: function() { keypadGo('ArrowDown'); },
      Enter: activate,
      ' ': activate,
      Backspace: onBack,
      Escape: closePin
    },
    confirm: {
      ArrowLeft: function() { focusConfirm(0); },
      ArrowRight: function() { focusConfirm(1); },
      Enter: activate,
      ' ': activate,
      Escape: cancelTakeover
    }
  };

  function dispatch(key) {
    [KEYMAP[mode][key]].filter(Boolean).forEach(function(fn) { fn(); });
  }

  buildKeypad();
  applyConfig(config);
  confirmBtns[0].addEventListener('click', doTakeover);
  confirmBtns[1].addEventListener('click', cancelTakeover);

  // person_active / person_busy gate finish() — only act on a user-initiated pick
  // (pendingPerson set); the on-connect lock re-assert (pendingPerson null) is a
  // no-op here so a stale localStorage person can't skip the picker.
  var wsApp = connectApp('ws://localhost:8766', function(intent, params) {
    var INTENTS = {
      setProfile: function() { [params].filter(Boolean).map(function(p) { return personById(config, p.profile); }).filter(Boolean).forEach(finish); },
      kids: function() { [personByProfile(config, 'kids')].filter(Boolean).forEach(finish); },
      adults: function() { [personByProfile(config, 'adults')].filter(Boolean).forEach(finish); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
  }, {
    skipAutoActivate: true,
    onPersonActive: function() { [pendingPerson].filter(Boolean).forEach(proceed); },
    onPersonBusy: function(payload) { [pendingPerson].filter(Boolean).forEach(function() { openTakeover([payload.label].filter(Boolean).concat(['another screen'])[0]); }); }
  });
  wsApp.sendContext({ context_id: 'profile' });

  document.addEventListener('keydown', dispatchKey);
  initPage({
    onEnter: focusFirstCard,
    keys: {
      ArrowLeft: function(e) { e.preventDefault(); dispatch('ArrowLeft'); },
      ArrowRight: function(e) { e.preventDefault(); dispatch('ArrowRight'); },
      ArrowUp: function(e) { e.preventDefault(); dispatch('ArrowUp'); },
      ArrowDown: function(e) { e.preventDefault(); dispatch('ArrowDown'); },
      Enter: function(e) { e.preventDefault(); dispatch('Enter'); },
      ' ': function(e) { e.preventDefault(); dispatch(' '); },
      Backspace: function(e) { e.preventDefault(); dispatch('Backspace'); },
      Escape: function(e) { e.preventDefault(); dispatch('Escape'); }
    },
    remote: {}
  });

  loadConfig(SERVER).then(parseConfig).then(applyConfig).catch(noop);
}
