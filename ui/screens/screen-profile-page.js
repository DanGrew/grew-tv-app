// Profile screen (TASK-120, FEAT-017): photo cards + Adults PIN gate. Photos and
// the gate PIN come from the media-manager's config.json (loaded once, defaults
// when absent — see core/profile-config.js). Kids is always open; a locked
// profile opens a d-pad keypad and only enters on the right code. All view-model
// logic (parsing, PIN state, keypad navigation) lives in core/ and is unit
// tested; this file is the DOM + d-pad wiring only.

import { setProfile, navTo } from '../../core/state.js';
import { initPage, dispatchKey } from '../../core/screen-registry.js';
import { connectApp } from '../../core/app-ws.js';
import { loadConfig, mediaUrl } from '../../core/app-api.js';
import {
  defaultConfig, parseConfig, pinMatches,
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

  var config = defaultConfig();
  var mode = 'cards';
  var pinEntry = '';
  var pinForId = null;
  var keyIndex = 0;

  function noop() {}

  function finish(id) {
    setProfile(id);
    navTo('browse.html');
  }

  function selectProfile(profile) {
    pinForId = profile.id;
    ({ true: function() { openPin(profile); }, false: function() { finish(profile.id); } })[profile.locked]();
  }

  function focusFirstCard() {
    [config.profiles[0]].filter(Boolean).forEach(function(p) { document.getElementById('btn-' + p.id).focus(); });
  }

  function moveCard(delta) {
    var ids = config.profiles.map(function(p) { return 'btn-' + p.id; });
    var cur = [ids.indexOf(document.activeElement.id)].filter(function(i) { return i >= 0; }).concat([0])[0];
    var next = Math.max(0, Math.min(ids.length - 1, cur + delta));
    document.getElementById(ids[next]).focus();
  }

  function photoNode(profile) {
    var photo = document.createElement('div');
    photo.className = 'profile-photo ' + profile.id;
    var img = document.createElement('img');
    img.className = 'profile-photo-img';
    img.alt = '';
    var ph = document.createElement('div');
    ph.className = 'profile-photo-ph';
    ph.textContent = [PH_EMOJI[profile.id]].filter(Boolean).concat(['👤'])[0];
    var src = mediaUrl(SERVER, profile.photo);
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

  function buildCard(profile) {
    var card = document.createElement('div');
    card.className = 'profile-card';
    card.id = 'btn-' + profile.id;
    card.tabIndex = 0;
    [profile.locked].filter(Boolean).forEach(function() {
      var lock = document.createElement('div');
      lock.className = 'lock-badge';
      lock.textContent = '🔒';
      card.appendChild(lock);
    });
    card.appendChild(photoNode(profile));
    var name = document.createElement('div');
    name.className = 'profile-name';
    name.textContent = profile.label;
    card.appendChild(name);
    card.addEventListener('click', function() { selectProfile(profile); });
    cardsEl.appendChild(card);
  }

  function applyConfig(cfg) {
    config = cfg;
    cardsEl.innerHTML = '';
    config.profiles.forEach(buildCard);
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

  function openPin(profile) {
    mode = 'pin';
    pinEntry = '';
    pinTitle.textContent = 'Enter code — ' + profile.label;
    panel.classList.add('active');
    renderDots();
    focusKey(0);
  }

  function closePin() {
    mode = 'cards';
    panel.classList.remove('active');
    [document.getElementById('btn-' + pinForId)].filter(Boolean).forEach(function(c) { c.focus(); });
  }

  function shake() {
    panel.classList.add('shake');
    setTimeout(function() { panel.classList.remove('shake'); }, 400);
  }

  function unlock() { finish(pinForId); }

  function reject() {
    shake();
    pinEntry = '';
    renderDots();
  }

  function submit() {
    ({ true: unlock, false: reject })[pinMatches(config, pinEntry)]();
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
    }
  };

  function dispatch(key) {
    [KEYMAP[mode][key]].filter(Boolean).forEach(function(fn) { fn(); });
  }

  buildKeypad();
  applyConfig(config);

  var wsApp = connectApp('ws://localhost:8766', function(intent, params) {
    var INTENTS = {
      setProfile: function() { [params].filter(Boolean).map(function(p) { return p.profile; }).filter(Boolean).forEach(finish); },
      kids: function() { finish('kids'); },
      adults: function() { finish('adults'); }
    };
    [INTENTS[intent]].filter(Boolean).forEach(function(fn) { fn(); });
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
