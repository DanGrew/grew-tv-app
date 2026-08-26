const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// FEAT-040 (TASK-248) + TASK-253 — queueing a track. The old standalone
// "＋ Queue" per-row button folded into the single "＋" add sheet: each
// available row has one ＋ that opens the sheet whose TOP option queues.
// TASK-504: that press now POSTs queue-item to the UNIFIED engine
// (/api/queue/music) and APPENDS to the end of the Queue — it no longer jumps
// ahead as Play Next — and the toast reads "Added to Queue", the same wording
// films and home movies show. The queue is durable (TASK-246), so a queued
// track survives opening another album. Opening the sheet never hijacks the
// row's play handler.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'music');
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

// Open the ＋ sheet for a row and tap its top queue option.
async function queueTrack(page, id) {
  await page.locator('.detail-row[data-id="' + id + '"] .detail-add').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await page.locator('#add-sheet-list .add-queue').click();
}

test('the sheet\'s queue action POSTs queue-item to the unified engine, confirms with a toast, and closes', async ({ page }) => {
  await openAlbum(page);
  const queued = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/queue-item') && req.method() === 'POST');
  await queueTrack(page, 'ootb-02');
  const req = await queued;
  expect(JSON.parse(req.postData())).toEqual({ item_id: 'ootb-02' });
  await expect(page.locator('#add-status')).toHaveText('Added to Queue');
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
// fires play-queue, so the TV starts the queue head without opening a track
// first (the audio twin of the video page's ?playQueue). TASK-504 — on the
// unified engine now, which is also where the ＋ presses above landed.
test('audio.html?playQueue starts the music queue head (play-queue, no track opened first)', async ({ page }) => {
  await openAlbum(page);
  await queueTrack(page, 'ootb-01');
  await queueTrack(page, 'ootb-02');
  const posted = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/play-queue') && req.method() === 'POST');
  await page.goto('/app/homeview/audio.html?playQueue=1&from=browse');
  const req = await posted;
  expect(req.url()).toContain('person=kids');
  await expect(page.locator('#screen-audio')).toBeVisible();
  // The head is the FIRST track queued — an append leaves it there, where the
  // old engine's own queue-track put the most recent press at the front.
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
});

// TASK-501 story 1 — Continue Music from browse. Entering with ?continueType
// fires the engine's own advance (`next`), which pops the queue's front and
// plays it. The audio twin of the video page's continue entries.
test('audio.html?continueType=music advances the music engine and plays the queued track', async ({ page }) => {
  await openAlbum(page);
  await queueTrack(page, 'ootb-02');
  const posted = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/next') && req.method() === 'POST');
  await page.goto('/app/homeview/audio.html?continueType=music&from=browse');
  const req = await posted;
  expect(req.url()).toContain('person=kids');
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
});

// TASK-501 story 2 — nothing queued, but a source mid-play: Continue carries on
// with the SOURCE, one track further. Nothing here reproduces that fallback —
// the same `next` action leaves the engine to choose.
test('audio.html?continueType=music advances the source when the queue is empty', async ({ page }) => {
  await openAlbum(page);
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  await page.goto('/app/homeview/audio.html?continueType=music&from=browse');
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
});
