import { hasHelp, helpCardHtml } from './button-help.js';

var screenRegistry = {};
var activeScreen = null;

export function registerScreen(id, config) {
  ['onEnter', 'keys'].filter(function(k) { return !config[k]; }).forEach(function(k) {
    throw new Error('registerScreen: ' + id + ' missing ' + k);
  });
  screenRegistry[id] = config;
}

export function activateScreen(id) {
  activeScreen = id;
  screenRegistry[id].onEnter();
}

export function getActiveConfig() {
  return screenRegistry[activeScreen];
}

export function dispatchKey(e) {
  [screenRegistry[activeScreen]].filter(Boolean).forEach(function(sc) {
    [sc.keys[e.key]].filter(Boolean).forEach(function(h) { h(e); });
  });
}

// TASK-633 — every TV page starts here, and the phone's pages never do (they
// have their own initPage), so this is the one place Info is wired for every TV
// screen and none of the phone's (story 7).
//
// `help` names the page's row in core/button-help.js: a surface id, or a
// function returning one for a page that carries an overlay with its own row
// (Search over Browse, the Queue over a player). It is resolved here, once, so a
// TV page naming no row — or a row that does not exist — fails at load and in a
// test rather than showing an empty card. `card` is the card component; it takes
// the keys itself, ahead of the page, because the sheets and Search stop every
// key before it reaches the page's own map.
export function initPage(config) {
  ['onEnter', 'keys', 'help', 'card'].filter(function(k) { return !config[k]; }).forEach(function(k) {
    throw new Error('initPage: missing ' + k);
  });
  var surface = typeof config.help === 'function' ? config.help : function() { return config.help; };
  if (!hasHelp(surface())) throw new Error('initPage: no help row for ' + surface());
  registerScreen('page', config);
  config.card.install(function() { return helpCardHtml(surface()); });
  activateScreen('page');
}
