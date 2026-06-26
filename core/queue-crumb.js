// Pure markup for the Queue View overlay breadcrumb (FEAT-031 / TASK-216).
//
// The Queue View is an overlay hung off the audio player, NOT a navigation
// target: its parent crumb must not navigate — it CLOSES the overlay back to the
// still-playing player (the <audio> stays mounted and keeps playing, no page
// nav). So this is a small dedicated helper rather than the nav-oriented
// core/breadcrumb.js (whose clickable crumbs carry data-page/data-params for a
// real navigation). It reuses the same .breadcrumb/.crumb-link/.crumb-current/
// .crumb-sep classes for a consistent look; the back crumb carries a stable id
// (queue-crumb-back) that ui/screens/screen-queue.js wires to close(), and
// "Queue" is the inert current leaf.

var BACK_ID = 'queue-crumb-back';
var BACK_LABEL = '‹ Now Playing';
var LEAF_LABEL = 'Queue';
var SEP = '<span class="crumb-sep" aria-hidden="true">›</span>';

export function queueCrumbHtml() {
  return '<nav class="breadcrumb" aria-label="Breadcrumb">' +
    '<button type="button" class="crumb crumb-link" id="' + BACK_ID + '">' + BACK_LABEL + '</button>' +
    SEP +
    '<span class="crumb crumb-current">' + LEAF_LABEL + '</span>' +
    '</nav>';
}
