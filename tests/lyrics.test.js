const { test, expect } = require('@playwright/test');
const { installApi, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// FEAT-018 (TASK-131) — always-on ambient lyrics on the audio player. A track
// with an .lrc shows a rolling 3-line window (current ±1) that advances with
// playback; a track without one falls back to the big-cover art view. The
// transport overlay auto-hides and is summoned by any d-pad key. The .lrc body
// is served here (the shared /media/** fixture returns empty, so other audio
// tests stay lyrics-off).

const LRC = [
  '[00:00.00]',
  '[00:06.00]Sun is shinin in the sky',
  '[00:10.00]There aint a cloud in sight',
  '[00:14.00]Its stopped rainin'
].join('\n');

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
  // Registered after installApi's generic /media/** so it wins (last match first).
  await page.route('**/media/ootb-02.lrc', route => route.fulfill({
    status: 200, contentType: 'text/plain', body: LRC
  }));
  await page.goto('/app/homeview/profile.html');
});

async function openTrack(page, albumId, trackId) {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="albums"]').click();
  await page.locator('.film-tile[data-id="' + albumId + '"]').click();
  await page.locator('.detail-row[data-id="' + trackId + '"]').click();
  await expect(page.locator('#screen-audio')).toBeVisible();
}

async function openSingle(page, id) {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="albums"]').click();
  await page.locator('.film-tile[data-id="' + id + '"]').click();
  await expect(page.locator('#screen-audio')).toBeVisible();
}

test('a track with an .lrc shows the rolling current ±1 window, advancing with playback', async ({ page }) => {
  await openTrack(page, 'ootb', 'ootb-02');
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
  // Lyrics loaded -> the ambient lyric mode is on.
  await expect(page.locator('body')).toHaveClass(/lyrics-on/);
  await expect(page.locator('#amb-lyrics')).toBeVisible();
  // Drive playback position to 7s and fire timeupdate: line index 1 is current.
  await page.evaluate(() => {
    const a = document.getElementById('audio');
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => 7 });
    a.dispatchEvent(new Event('timeupdate'));
  });
  await expect(page.locator('#amb-prev')).toHaveText('♪');
  await expect(page.locator('#amb-cur')).toHaveText('Sun is shinin in the sky');
  await expect(page.locator('#amb-next')).toHaveText('There aint a cloud in sight');
  // Advance past the next cue -> the window rolls forward by one line.
  await page.evaluate(() => {
    const a = document.getElementById('audio');
    Object.defineProperty(a, 'currentTime', { configurable: true, get: () => 12 });
    a.dispatchEvent(new Event('timeupdate'));
  });
  await expect(page.locator('#amb-cur')).toHaveText('There aint a cloud in sight');
  await expect(page.locator('#amb-next')).toHaveText('Its stopped rainin');
});

test('a track with no .lrc falls back to the big-cover art view, no lyric pane', async ({ page }) => {
  await openSingle(page, 'dancing-queen');
  await expect(page.locator('#audio-title')).toHaveText('Dancing Queen');
  await expect(page.locator('body')).not.toHaveClass(/lyrics-on/);
  await expect(page.locator('#audio-art')).toBeVisible();
  await expect(page.locator('#amb-lyrics')).toBeHidden();
});

test('the transport auto-hides after idle and any d-pad key summons it back', async ({ page }) => {
  await openTrack(page, 'ootb', 'ootb-02');
  await expect(page.locator('#controls')).not.toHaveClass(/controls-hidden/);
  // Idle longer than the hide window -> the transport overlay hides.
  await expect(page.locator('#controls')).toHaveClass(/controls-hidden/, { timeout: 8000 });
  // A d-pad key summons it back.
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#controls')).not.toHaveClass(/controls-hidden/);
});
