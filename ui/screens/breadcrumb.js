import { breadcrumbHtml } from '../../core/breadcrumb.js';
import { navTo } from '../../core/state.js';

var NAV_KEYS = { Enter: true, ' ': true };

function navigateTo(el) {
  navTo(el.getAttribute('data-page'), JSON.parse(el.getAttribute('data-params')));
}

function bindCrumb(el) {
  el.addEventListener('click', function() { navigateTo(el); });
  el.addEventListener('keydown', function(e) {
    [NAV_KEYS[e.key]].filter(Boolean).forEach(function() { e.preventDefault(); navigateTo(el); });
  });
}

// Render the crumb trail into containerId and wire each clickable crumb to its
// nav target. Arrow d-pad movement stays with the owning screen (crumbs are
// stops in its focus list); crumbs handle only Enter/Space + click themselves.
export function mountBreadcrumb(containerId, crumbs) {
  var el = document.getElementById(containerId);
  el.innerHTML = breadcrumbHtml(crumbs);
  Array.prototype.slice.call(el.querySelectorAll('.crumb-link')).forEach(bindCrumb);
}
