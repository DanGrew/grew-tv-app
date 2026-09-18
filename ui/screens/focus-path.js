// TASK-598 — a screen's ▲▼ path is the stops it draws, in the order it draws them.
// `selector` names what counts as a stop on that screen; querySelectorAll returns
// matches in document order whatever order the selector lists them in, so focus
// order is on-screen order with no second list to keep in step with the markup.
//
// A stop drops out when it can't be landed on or can't act: hidden (`.hidden`),
// dimmed (`disabled`), or taken out of the tab order (`tabIndex` -1, e.g. an
// unavailable detail row). A deliberate exception opts OUT on the markup itself —
// `data-focus-skip` on the control, or on a region that holds controls with their
// own navigation (a dialog) — never by being left off a list somewhere else.
export function focusPath(root, selector) {
  return Array.prototype.slice.call(root.querySelectorAll(selector))
    .filter(function(el) { return !el.closest('[data-focus-skip]'); })
    .filter(function(el) { return !el.classList.contains('hidden'); })
    .filter(function(el) { return !el.disabled; })
    .filter(function(el) { return el.tabIndex >= 0; });
}
