var SCREEN_TO_PAGE = { resume_prompt: 'video' };

export function screenPage(contextId) {
  return SCREEN_TO_PAGE[contextId] || contextId;
}

export function titleCase(str) {
  return str.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

var SKIP_LABEL_MAP = { '10': '10s', '30': '30s', '120': '2 min', '300': '5 min', '900': '15 min', '1800': '30 min' };

export function skipLabel(actionId) {
  var secs = actionId.split('_').pop();
  return SKIP_LABEL_MAP[secs] || secs + 's';
}

export function displayTitle(payload) {
  return [payload.display].filter(Boolean)
    .map(function(d) { return d.title; })
    .filter(Boolean)
    .concat([''])[0];
}

export function displayLabel(payload) {
  return [payload.context_id].filter(Boolean).map(titleCase).concat([''])[0];
}

export function getContentBasePath(manifestCache) {
  return [manifestCache].filter(Boolean)
    .map(function(m) { return m.contentBase; })
    .filter(Boolean)
    .concat([''])[0]
    .replace(/^https?:\/\/[^/]+/, '');
}
