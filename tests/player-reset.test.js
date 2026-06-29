const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, installVideoPlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// TASK-142: a single Reset control in the player clears this item's backend
// progress for the active person, then exits. Covers films/episodes (video
// player) and tracks (audio player) — everything direct-play goes through a
// player, so one button per player covers it all. Two-press confirm (arm ->
// "Reset?" -> fire) guards a mis-tap; the reset DELETEs and navigates away.
//
// A film is engine-driven now (FEAT-040/TASK-251: play-video -> video_playback
// snapshot -> playVideo sets the <video> src AND currentVideo, the record Reset
// DELETEs). So the video tests install the VIDEO playback backend; without it the
// film never loads, currentVideo stays null, and Reset exits WITHOUT a DELETE
// (the failure this suite hit). Its WS route is registered after the beforeEach
// ones, so it wins for these tests (Playwright matches most-recent-first).

const FILM = 'toy-story-main';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

async function enterKids(page) {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
}

// Capture the method hitting /api/progress and answer 200 zero-state. Returns a
// getter so the test can assert the DELETE fired (and not before).
async function captureProgress(page) {
  const calls = [];
  await page.route('**/api/progress/**', route => {
    calls.push(route.request().method());
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ item_id: 'x', position_secs: 0, duration_secs: null, completed: false, last_watched: null })
    });
  });
  return () => calls;
}

test('video player shows a Reset control', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-reset')).toBeVisible();
});

test('video Reset needs two presses, DELETEs progress, then exits the player', async ({ page }) => {
  await installVideoPlaybackBackend(page);
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  // #screen-video is in the static HTML, so toBeVisible passes before the film
  // loads. Wait for the <video> src to land: that proves the play-video snapshot
  // ran playVideo, which sets currentVideo — the record Reset DELETEs (without it
  // Reset exits with nothing to delete). It also means init's onEnter focus has
  // already happened, so it can't blur-disarm the Reset later (BUG-019: await the
  // real post-load settle signal, not a static element).
  await expect(page.locator('#video')).toHaveAttribute('src', /toy-story-main\.mp4/);
  const methods = await captureProgress(page);
  // Keep the controls up before arming (they auto-hide 3s after the last input). A
  // d-pad key re-kicks that timer right before we arm (an armed Reset also
  // suppresses the hide), so the auto-hide can't blur-disarm it mid-test.
  await page.locator('#screen-video').click();
  await page.keyboard.press('ArrowDown');
  const reset = page.locator('#btn-reset');
  await reset.click();
  await expect(reset).toHaveText('Reset?');
  expect(methods()).not.toContain('DELETE');
  // The second press fires the DELETE then immediately navigates away
  // (resetAndExit doesn't await resetProgress before stopPlayback's nav). The nav
  // can abort the in-flight request before our route records its method, so wait
  // for the request EVENT (fires when fetch is issued, ahead of the nav).
  const deleteFired = page.waitForRequest(r => r.url().includes('/api/progress/') && r.method() === 'DELETE');
  await reset.click();
  await deleteFired;
  // Reset exits the player back to where it came from.
  await expect(page.locator('#screen-video')).not.toBeVisible();
});

test('blurring an armed video Reset disarms it', async ({ page }) => {
  await installVideoPlaybackBackend(page);
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  // Wait for the film to load (src set) so init has fully settled — otherwise
  // init's onEnter play-pause focus could pre-empt the explicit disarm we test
  // below; we want OUR focus(play-pause) to be the blur that disarms it (BUG-019).
  await expect(page.locator('#video')).toHaveAttribute('src', /toy-story-main\.mp4/);
  // Re-kick the 3s controls auto-hide before arming so it can't blur-disarm the
  // Reset under us — we want the BLUR from focusing play-pause to be the only
  // thing that disarms it (BUG-019).
  await page.locator('#screen-video').click();
  await page.keyboard.press('ArrowDown');
  const reset = page.locator('#btn-reset');
  await reset.click();
  await expect(reset).toHaveText('Reset?');
  await page.locator('#btn-play-pause').focus();
  await expect(reset).toHaveText('Reset');
});

test('audio player shows a Reset control', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-02"]').click();
  await expect(page.locator('#screen-audio')).toBeVisible();
  // TASK-187: entry is now two async `playback` actions — wait for the track to
  // land so a late snapshot can't repaint over the assert.
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
  await expect(page.locator('#btn-reset')).toBeVisible();
});

test('audio Reset needs two presses, DELETEs progress, then exits the player', async ({ page }) => {
  await enterKids(page);
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator('.detail-row[data-id="ootb-02"]').click();
  await expect(page.locator('#screen-audio')).toBeVisible();
  // TASK-187: entry is now two async `playback` actions. Wait for the track to
  // land (so a late snapshot can't repaint mid-interaction), then summon the
  // transport — a d-pad key resets the auto-hide timer so the armed Reset button
  // isn't blurred, and silently disarmed, by the controls hiding under us.
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
  await page.keyboard.press('ArrowDown');
  const methods = await captureProgress(page);
  const reset = page.locator('#btn-reset');
  await reset.click();
  await expect(reset).toHaveText('Reset?');
  expect(methods()).not.toContain('DELETE');
  // Wait for the DELETE request event — reset exits immediately, so the nav can
  // abort the in-flight request before our route records the method (as in video).
  const deleteFired = page.waitForRequest(r => r.url().includes('/api/progress/') && r.method() === 'DELETE');
  await reset.click();
  await deleteFired;
  await expect(page.locator('#screen-audio')).not.toBeVisible();
});
