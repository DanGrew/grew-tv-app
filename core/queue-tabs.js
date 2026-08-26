// FEAT-039 (TASK-238) shared Queue View tab shell. core/queue-shell-view.js —
// THE Queue model, every media type on it since TASK-505 — renders both
// surfaces through here: a Now Playing header above three tabs, in play
// order —
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

// Companion phone shell (.ph-qtab-bar / .ph-qtab / .ph-qtab-panel).
export function phTabShellHtml(headerHtml, panels) {
  return shell(headerHtml, panels, 'ph-qtab-bar', 'ph-qtab', 'ph-qtab-panel');
}

// FEAT-497 (docs/QUEUE-UX-SHELL.md) TV Queue UX shell tab bar (.qs-tabbar /
// .qs-tab / .qs-panel) — full-width equal tabs, mirroring the companion's own
// .ph-qtab flex:1 behaviour instead of the older TV .qtab's padding-only,
// non-stretched style. It was added as a NEW class set rather than restyling
// .qtab/.qtab-bar/.qtab-panel in place, so the not-yet-cut-over media types
// kept their look; TASK-525 removed the last of those (`tabShellHtml`, the TV
// .qtab shell), leaving this the only TV tab bar.
export function qsTabShellHtml(headerHtml, panels) {
  return shell(headerHtml, panels, 'qs-tabbar', 'qs-tab', 'qs-panel');
}
