const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// FEAT-040 (TASK-248) + TASK-253 — queueing a track to Play Next. The old
// standalone "＋ Queue" per-row button folded into the single "＋" add sheet: each
// available row has one ＋ that opens the sheet whose TOP option is "▶ Play Next".
// Picking it POSTs queue-track per person to /api/playback (then closes the sheet)
// and confirms with a transient toast. The override queue is durable (TASK-246), so
// a queued track survives opening another album. Opening the sheet never hijacks the
// row's play handler.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

async function openAlbum(page) {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await expect(page).toHaveURL(/album-detail\.html/);
  await expect(page.locator('.detail-row')).toHaveCount(3);
}

// Open the ＋ sheet for a row and tap its top "▶ Play Next" option.
async function playNext(page, id) {
  await page.locator('.detail-row[data-id="' + id + '"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#add-sheet-list .add-queue').click();
}

test('the sheet\'s Play Next POSTs queue-track for the track, confirms with a toast, and closes', async ({ page }) => {
  await openAlbum(page);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/playback/queue-track') && req.method() === 'POST');
  await playNext(page, 'ootb-02');
  const req = await queued;
  expect(JSON.parse(req.postData())).toEqual({ track_id: 'ootb-02' });
  await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
  await expect(page.locator('#add-sheet')).toBeHidden();
});

test('opening the ＋ sheet does not hijack the row — the track still plays', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page).toHaveURL(/audio\.html/);
});

test('the ＋ control is reachable from the row via Right (d-pad)', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-01"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.detail-row[data-id="ootb-01"] .detail-add')).toBeFocused();
});

// FEAT-040/TASK-255 — entering the audio page with ?playQueue (no album/track)
// fires the music play-queue action, so the TV starts the override-queue head
// without opening a track first (the audio twin of the video page's ?playQueue).
test('audio.html?playQueue starts the music queue head (play-queue, no track opened first)', async ({ page }) => {
  await openAlbum(page);
  await playNext(page, 'ootb-01');   // -> Play Next: ootb-01
  await playNext(page, 'ootb-02');   // -> front: ootb-02
  const posted = page.waitForRequest(req =>
    req.url().includes('/api/playback/play-queue') && req.method() === 'POST');
  await page.goto('/app/homeview/audio.html?playQueue=1&from=browse');
  const req = await posted;
  expect(req.url()).toContain('person=kids');
  await expect(page.locator('#screen-audio')).toBeVisible();
  // The queue head (most-recently queued lands at the front) is now playing.
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
});
