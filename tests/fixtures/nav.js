const { expect } = require('@playwright/test');

// TASK-329 — shared post-nav settle signals.
//
// The repo's recurring parallel-load flake (BUG-019 family) is a test-side
// settle-signal gap: we assert or interact before the screen has finished
// settling. The single worst offender was the profile pick, which nearly every
// suite opens with. `#btn-kids` is painted twice — once from the placeholder
// `defaultConfig()`, then again when config.json lands and `applyConfig` wipes
// #profile-cards and rebuilds every card. Clicking in that window races the
// rebuild against a detached node.
//
// `pickPerson` waits for the picker's own settle marker (screen-profile-page.js
// stamps data-config="settled" once the fetched config is applied or has failed —
// no further rebuild is coming) before clicking. Use it instead of a bare
// `page.locator('#btn-<id>').click()` so no suite regresses into the race.
async function profileSettled(page) {
  await expect(page.locator('#profile-cards')).toHaveAttribute('data-config', 'settled');
}

async function pickPerson(page, id) {
  await profileSettled(page);
  await page.locator('#btn-' + id).click();
}

// The common "pick a person and land on browse" open. Returns once browse is up,
// so the caller can go straight to a tab/tile.
async function enterBrowse(page, id) {
  await pickPerson(page, id);
  await expect(page.locator('#screen-browse')).toBeVisible();
}

// TASK-597 — the d-pad path from a starting control: focus it, press `key` `presses`
// times, and name where focus sat after each press (its id, `row:<data-id>` for a
// detail row, else its class). Lets a suite pin a screen's stop order in one assertion.
async function dpadPath(page, startSelector, key, presses) {
  await page.locator(startSelector).focus();
  const path = [];
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press(key);
    path.push(await page.evaluate(function() {
      const el = document.activeElement;
      const row = el.classList.contains('detail-row') ? 'row:' + el.getAttribute('data-id') : el.className;
      return el.id || row;
    }));
  }
  return path;
}

module.exports = { profileSettled, pickPerson, enterBrowse, dpadPath };
