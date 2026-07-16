const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-213: app-side logging is strictly fire-and-forget. It must NEVER block or
// surface — playback works even when the /log sink 404s or is unreachable — and
// the global error reporter must actually deliver a browser error to /log.

const FILM = 'toy-story-main';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
  // The sink is down: every client log post 404s. The app must not care.
  await page.route('**/log', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.goto('/app/homeview/profile.html');
});

async function enterKids(page) {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
}

test('video playback works and never navigates to error when /log 404s', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
  // Player opens and stays — a failing log post must not block or crash playback.
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.locator('#screen-video').click();
  await expect(page.locator('#btn-play-pause')).toBeVisible();
  expect(page.url()).not.toContain('error.html');
});

test('a browser error is delivered to /log by the global error reporter', async ({ page }) => {
  // Capture every /log body (still answering 404 — the sink is "down").
  const posts = [];
  await page.route('**/log', route => {
    posts.push(JSON.parse(route.request().postData() || '{}'));
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await enterKids(page);   // mountDeviceBadge() ran on boot -> installErrorReporter(window)
  // Wait until the reporter is actually wired before triggering (module boot is async).
  await expect.poll(() => page.evaluate(() => !!window.__grewErrInstalled)).toBeTruthy();
  // A throw in a timer callback is an uncaught error -> window.onerror.
  await page.evaluate(() => { setTimeout(() => { throw new Error('e2e-boom'); }, 0); });
  await expect.poll(() => posts.find(b => b.code === 'js_error')).toBeTruthy();
  const err = posts.find(b => b.code === 'js_error');
  expect(err.level).toBe('error');
  expect(err.message).toContain('e2e-boom');
  // The page is unharmed — the (404) post was swallowed.
  await expect(page.locator('#screen-browse')).toBeVisible();
});
