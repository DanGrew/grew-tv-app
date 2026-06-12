// Pure ancestor-chain builder for the breadcrumb trail (FEAT-021 / TASK-140).
// Single source of truth for the Back/navigation path, shared by the app
// (TASK-140) and the companion (TASK-141). No DOM: this returns a crumb model
// plus an HTML string; the ui layer mounts the markup and wires navigation.
//
// crumb: { label, page, params, current }
//   current === true -> the screen you are on; rendered as a non-clickable leaf.
//   otherwise        -> a clickable ancestor that navigates to page?params.
//
// ctx fields by screen:
//   detail    -> { seriesId, seriesTitle }
//   video     -> { seriesId, seriesTitle, videoTitle }   (seriesId absent => film)
//   rail-grid -> { sectionId, sectionTitle, railTitle }  (FEAT-028 / TASK-167)
//   artist    -> { artistName }                          (FEAT-029)

var HOME_PAGE = 'browse.html';
var DETAIL_PAGE = 'detail.html';

function link(label, page, params) {
  return { label: label, page: page, params: params, current: false };
}

function leaf(label) {
  return { label: label, page: null, params: null, current: true };
}

function home() {
  return link('Home', HOME_PAGE, {});
}

function seriesLink(ctx) {
  return link(ctx.seriesTitle, DETAIL_PAGE, { series: ctx.seriesId });
}

function browseCrumbs() {
  return [leaf('Home')];
}

function detailCrumbs(ctx) {
  return [home(), leaf(ctx.seriesTitle)];
}

function videoCrumbs(ctx) {
  if (ctx.seriesId) return [home(), seriesLink(ctx), leaf(ctx.videoTitle)];
  return [home(), leaf(ctx.videoTitle)];
}

// The section crumb returns to the browse page on that section's tab (browse
// honours ?tab=); the rail is the current (leaf) level.
function sectionLink(ctx) {
  return link(ctx.sectionTitle, HOME_PAGE, { tab: ctx.sectionId });
}

function railGridCrumbs(ctx) {
  return [home(), sectionLink(ctx), leaf(ctx.railTitle)];
}

// FEAT-029 artist drill-down: Home › Albums (the Music tab) › Artist. The Albums
// crumb returns to the browse page on the music tab (browse honours ?tab=).
function albumsLink() {
  return link('Albums', HOME_PAGE, { tab: 'music' });
}

function artistCrumbs(ctx) {
  return [home(), albumsLink(), leaf(ctx.artistName)];
}

var BUILDERS = {
  browse: browseCrumbs,
  detail: detailCrumbs,
  video: videoCrumbs,
  'rail-grid': railGridCrumbs,
  artist: artistCrumbs
};

// Build the crumb trail for a screen + context. Unknown screen -> [] so a caller
// can mount unconditionally without guarding.
export function buildCrumbs(screen, ctx) {
  var build = BUILDERS[screen];
  if (!build) return [];
  return build(ctx || {});
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Clickable crumbs carry their nav target in data-page / data-params (JSON in a
// single-quoted attribute) and a stable id so the d-pad focus cycle can address
// them. The current crumb is an inert <span>.
function crumbHtml(crumb, i) {
  if (crumb.current) {
    return '<span class="crumb crumb-current">' + escapeHtml(crumb.label) + '</span>';
  }
  return '<button type="button" class="crumb crumb-link" id="crumb-' + i + '"' +
    ' data-page="' + escapeHtml(crumb.page) + '"' +
    " data-params='" + JSON.stringify(crumb.params) + "'>" +
    escapeHtml(crumb.label) + '</button>';
}

var SEP = '<span class="crumb-sep" aria-hidden="true">›</span>';

export function breadcrumbHtml(crumbs) {
  return '<nav class="breadcrumb" aria-label="Breadcrumb">' +
    crumbs.map(crumbHtml).join(SEP) +
    '</nav>';
}
