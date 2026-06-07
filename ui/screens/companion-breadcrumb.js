import { breadcrumbHtml } from '../../core/breadcrumb.js';

// Companion breadcrumb mount (FEAT-021 / TASK-141). Mirrors the app's
// ui/screens/breadcrumb.js — same pure trail from core/breadcrumb.js — but the
// companion is the PRIMARY remote, so a clickable crumb does not navigate the
// companion itself. It sends the matching nav intent to the app over the
// WebSocket; the app teleports the TV and echoes its new context back, which the
// owning companion screen already follows (onContext -> page change). One Back
// path, driven from one place.
var NAV_KEYS = { Enter: true, ' ': true };

// A clickable crumb carries its target in data-page / data-params (JSON), built
// by core/breadcrumb.js. Read them straight back into the nav intent.
function crumbTarget(el) {
  return { page: el.getAttribute('data-page'), params: JSON.parse(el.getAttribute('data-params')) };
}

function fire(el, onNavigate) {
  var t = crumbTarget(el);
  onNavigate(t.page, t.params);
}

function bindCrumb(el, onNavigate) {
  el.addEventListener('click', function() { fire(el, onNavigate); });
  el.addEventListener('keydown', function(e) {
    [NAV_KEYS[e.key]].filter(Boolean).forEach(function() { e.preventDefault(); fire(el, onNavigate); });
  });
}

// Render the crumb trail into containerId and wire each clickable ancestor to
// onNavigate(page, params) — the companion screen passes a sender that emits the
// `navigate` intent. The current crumb is inert.
export function mountCompanionBreadcrumb(containerId, crumbs, onNavigate) {
  var el = document.getElementById(containerId);
  el.innerHTML = breadcrumbHtml(crumbs);
  Array.prototype.slice.call(el.querySelectorAll('.crumb-link')).forEach(function(c) { bindCrumb(c, onNavigate); });
}
