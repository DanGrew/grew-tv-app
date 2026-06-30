// FEAT-039 (TASK-238) shared Queue View tab shell. The music (core/queue-view.js)
// and video (core/video-queue-view.js) queues have SEPARATE models — they read
// different snapshot shapes — but the SAME layout: a persistent Now Playing header
// above three tabs, in play order —
//   Queue      — the tracks you queued (override).
//   Next       — the rest of the current source (album / series).
//   Coming Up  — what plays after the source (repeat wrap / next permutation).
// This PURE module builds the tab chrome for both surfaces (TV overlay + companion
// phone). Each queue module supplies the header HTML and, per tab, the body HTML
// (its own row markup) + an `empty` flag, so the shell opens on the first tab that
// actually has something to show (you queued nothing -> it lands on Next, not on an
// empty Queue tab). No queue math here — only the tab wrapper.

// The default-open tab: the first non-empty one in play order, else the first tab
// (so an all-empty queue still has a stable active tab/panel).
function activeKey(panels) {
  var withRows = panels.filter(function (p) { return !p.empty; });
  return (withRows[0] || panels[0]).tab;
}

function activeClass(tab, active) {
  return tab === active ? ' active' : '';
}

function tabButton(p, active, tabCls) {
  return '<button type="button" class="' + tabCls + activeClass(p.tab, active) + '" data-act="tab" data-tab="' + p.tab + '" role="tab">' + p.label + '</button>';
}

function panelDiv(p, active, panelCls) {
  return '<div class="' + panelCls + activeClass(p.tab, active) + '" data-tab="' + p.tab + '" role="tabpanel">' + p.html + '</div>';
}

function shell(headerHtml, panels, barCls, tabCls, panelCls) {
  var active = activeKey(panels);
  var bar = '<div class="' + barCls + '" role="tablist">' + panels.map(function (p) { return tabButton(p, active, tabCls); }).join('') + '</div>';
  var body = panels.map(function (p) { return panelDiv(p, active, panelCls); }).join('');
  return headerHtml + bar + body;
}

// TV overlay shell (.qtab-bar / .qtab / .qtab-panel).
export function tabShellHtml(headerHtml, panels) {
  return shell(headerHtml, panels, 'qtab-bar', 'qtab', 'qtab-panel');
}

// Companion phone shell (.ph-qtab-bar / .ph-qtab / .ph-qtab-panel).
export function phTabShellHtml(headerHtml, panels) {
  return shell(headerHtml, panels, 'ph-qtab-bar', 'ph-qtab', 'ph-qtab-panel');
}
