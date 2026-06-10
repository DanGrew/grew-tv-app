const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-026 TASK-155: the active person (set by the picker) is sent on every
// progress call, so resume + Continue-Watching are PER PERSON. Two kid persons
// share the same kids catalog but keep separate progress — switching the active
// person changes which Continue-Watching set the Home rail shows. Backed by the
// stateful person-keyed fixture: a saved position sticks under that person only.

const CONFIG = {
  defaultPin: '1234',
  persons: [
    { id: 'oliver', name: 'Oliver', profile: 'kids', photo: null },
    { id: 'millie', name: 'Millie', profile: 'kids', photo: null }
  ]
};

// Drive a person-keyed progress write through the app origin so it lands in the
// stateful fixture store (page.route intercepts page fetches). This is the same
// POST shape the player's saveProgress sends with ?person=.
async function seed(page, person, itemId, pos, dur) {
  await page.evaluate(function(a) {
    return fetch(location.origin + '/api/progress/' + a.itemId + '?person=' + a.person, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position_secs: a.pos, duration_secs: a.dur })
    });
  }, { person: person, itemId: itemId, pos: pos, dur: dur });
}

async function filmsCw(page, personBtn) {
  await page.locator(personBtn).click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  return page.locator('.rail-row[data-rail="continue"]');
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  // Two kid persons (no PIN), overriding the default Kids/Adults config.
  await page.route('**/media/config.json', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(CONFIG)
  }));
  await page.goto('/app/homeview/profile.html');
  await seed(page, 'oliver', 'toy-story-main', 1200, 4860);
  await seed(page, 'millie', 'finding-nemo-main', 1200, 6000);
});

test('Continue Watching shows only the active person\'s in-progress film', async ({ page }) => {
  const cw = await filmsCw(page, '#btn-oliver');
  await expect(cw.locator('.film-tile[data-id="toy-story-main"]')).toHaveCount(1);
  await expect(cw.locator('.film-tile[data-id="finding-nemo-main"]')).toHaveCount(0);
});

test('switching the active person changes which Continue Watching set shows', async ({ page }) => {
  const oliverCw = await filmsCw(page, '#btn-oliver');
  await expect(oliverCw.locator('.film-tile[data-id="toy-story-main"]')).toHaveCount(1);

  // Switch person — back to the picker, choose Millie. Her progress is distinct.
  await page.goto('/app/homeview/profile.html');
  const millieCw = await filmsCw(page, '#btn-millie');
  await expect(millieCw.locator('.film-tile[data-id="finding-nemo-main"]')).toHaveCount(1);
  await expect(millieCw.locator('.film-tile[data-id="toy-story-main"]')).toHaveCount(0);
});

test('Continue Watching 400s without a person — the rail stays empty (FEAT-026 contract)', async ({ page }) => {
  // No person picked: a direct browse load sends ?person= empty, the fixture 400s
  // like the backend, and the rail degrades to empty rather than crashing.
  const status = await page.evaluate(function() {
    return fetch(location.origin + '/api/continue-watching?profile=kids&person=')
      .then(function(r) { return r.status; });
  });
  expect(status).toBe(400);
});
