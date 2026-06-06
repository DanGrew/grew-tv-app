export function screenPage(contextId) {
  return contextId;
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

// Companion Home search (TASK-117): case-insensitive title substring match.
// v1 is title-only by design (small library); tag/format search is parked.
export function filterByTitle(cards, query) {
  var q = (query || '').trim().toLowerCase();
  return [q].filter(Boolean).map(function() {
    return (cards || []).filter(function(c) {
      return (c.title || '').toLowerCase().indexOf(q) > -1;
    });
  }).concat([cards || []])[0];
}

export function getContentBasePath(manifestCache) {
  return [manifestCache].filter(Boolean)
    .map(function(m) { return m.contentBase; })
    .filter(Boolean)
    .concat([''])[0]
    .replace(/^https?:\/\/[^/]+/, '');
}
