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

export function initPage(config) {
  ['onEnter', 'keys'].filter(function(k) { return !config[k]; }).forEach(function(k) {
    throw new Error('initPage: missing ' + k);
  });
  registerScreen('page', config);
  activateScreen('page');
}
