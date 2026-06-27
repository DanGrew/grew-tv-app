const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-036 (TASK-209) — the companion create-playlist page, the PRACTICAL create
// path (a phone keyboard, so a plain text input replaces the TV's on-screen
// keyboard). It POSTs /api/playlists/create (the installApi fixture mints the slug
// id and 400s a blank name) and returns to the companion playlists list (browse).
// The active profile rides a ?profile= query param so the kids/adults picker
// preselects it. No WebSocket: create is a state write reflected via the catalog,
// not a TV-teleport — so this page needs only the HTTP fixture (a quiet WS stub
// keeps the post-create browse.html load off any real :8766 server).

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.routeWebSocket(/:8766/, function(ws) { ws.onMessage(function() {}); });
  await page.goto('/companion/playlist-create.html?profile=adults');
});

test('preselects the profile from the query param', async ({ page }) => {
  await expect(page.locator('#btn-profile-adults')).toHaveClass(/selected/);
  await expect(page.locator('#btn-profile-kids')).not.toHaveClass(/selected/);
});

test('the profile picker is switchable (the tag is chosen before create)', async ({ page }) => {
  await page.locator('#btn-profile-kids').click();
  await expect(page.locator('#btn-profile-kids')).toHaveClass(/selected/);
  await expect(page.locator('#btn-profile-adults')).not.toHaveClass(/selected/);
});

test('typing a name then Create returns to the playlists list', async ({ page }) => {
  await page.locator('#pl-name').fill('Road Trip');
  await page.locator('#btn-create').click();
  await expect(page).toHaveURL(/companion\/browse\.html$/);
});

test('Create with a blank name shows an error and stays on the create page', async ({ page }) => {
  await page.locator('#btn-create').click();
  await expect(page.locator('#error-msg')).toBeVisible();
  await expect(page).toHaveURL(/companion\/playlist-create\.html/);
});

test('Cancel returns to the playlists list without creating', async ({ page }) => {
  await page.locator('#pl-name').fill('Discarded');
  await page.locator('#btn-cancel').click();
  await expect(page).toHaveURL(/companion\/browse\.html$/);
});

// FEAT-036 (TASK-210) — rename mode (?rename=<id>&name=<current>): prefilled input,
// NO profile picker (profile is immutable), Save action. POSTs /api/playlists/rename
// then returns to the playlists list.

test('rename mode prefills the name, hides the profile picker and labels the action Save', async ({ page }) => {
  await page.goto('/companion/playlist-create.html?rename=pl-roadtrip&name=Road%20Trip');
  await expect(page.locator('#create-title')).toHaveText('Rename Playlist');
  await expect(page.locator('#pl-name')).toHaveValue('Road Trip');
  await expect(page.locator('#profile-row')).toBeHidden();
  await expect(page.locator('#btn-create')).toHaveText(/Save/);
});

test('rename: editing the name then Save returns to the playlists list', async ({ page }) => {
  await page.goto('/companion/playlist-create.html?rename=pl-roadtrip&name=Road%20Trip');
  await page.locator('#pl-name').fill('Road Trip 2');
  await page.locator('#btn-create').click();
  await expect(page).toHaveURL(/companion\/browse\.html$/);
});

test('rename with a blank name shows an error and stays on the page', async ({ page }) => {
  await page.goto('/companion/playlist-create.html?rename=pl-roadtrip&name=Road%20Trip');
  await page.locator('#pl-name').fill('   ');
  await page.locator('#btn-create').click();
  await expect(page.locator('#error-msg')).toBeVisible();
  await expect(page).toHaveURL(/companion\/playlist-create\.html/);
});
