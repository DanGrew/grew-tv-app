const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// FEAT-031 (TASK-188) → FEAT-497 (TASK-504) — the MUSIC Queue View overlay off
// the audio player. It used to be music's own screen (ui/screens/screen-queue.js
// over core/queue-view.js, four sections of `.q-row`s off the old
// /api/playback snapshot). TASK-504 cut music onto the TASK-498 unified queue
// engine and onto THE shared shell (core/queue-shell-view.js `.qs-*` markup,
// ui/screens/screen-queue-shell.js) that films (TASK-517) and home movies
// (TASK-516) already run on — one renderer, told it is music by `config.media`.
//
// This suite was written as the twin of the film suite that lived in
// tests/video-queue-view.test.js (removed with the legacy Queue in TASK-525):
// the same assertions in the same order against /api/queue/music instead of
// /api/queue/film, because "music behaves like the other media types" is the
// whole of this cutover and a divergence here is the thing worth catching.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
});

// Enter the audio player on the ootb album at ootb-01 ("Turn to Stone"), with
// one durable Queue entry behind it. ootb holds ootb-01/-02/-03.
async function openPlayer(page) {
  const backend = await installQueuePlaybackBackend(page, 'music');
  backend.seed('play-source', { source_type: 'album', source_id: 'ootb' });
  backend.seed('queue-item', { item_id: 'dancing-queen' });
  await page.goto('/app/homeview/audio.html?album=ootb&track=ootb-01&from=detail-album');
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  return backend;
}

async function openQueue(page) {
  await page.keyboard.press('ArrowDown');           // summon the transport (auto-hides)
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
}

test('Queue button opens the overlay with the durable Queue', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.qs-panel.active .qs-row')).toHaveCount(1);
  await expect(page.locator('.qs-panel.active .qs-name')).toHaveText('Dancing Queen');
});

test('the hero names the track playing and the album it came from', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.qs-hero-title')).toHaveText('Turn to Stone');
  await expect(page.locator('#queue-crumb-back')).toBeVisible();
  await expect(page.locator('.qs-tbtn[aria-label="Play / pause"]')).toBeVisible();
});

test('Next lists the album tracks after the current one as play-to-jump rows', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.locator('.qs-tab[data-tab="next"]').click();
  await expect(page.locator('.qs-panel.active .qs-select[data-item="ootb-02"]')).toBeVisible();
});

test('removing a queued entry POSTs remove-queue-entry and the overlay repaints', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const removed = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/remove-queue-entry') && req.method() === 'POST');
  await page.locator('.qs-panel.active .qs-row .qs-act.danger').click();
  expect(JSON.parse((await removed).postData())).toHaveProperty('entry_id');
  await expect(page.locator('.qs-panel[data-tab="queue"] .qs-row')).toHaveCount(0);
});

test('a source row plays-to-jump via play-item', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.locator('.qs-tab[data-tab="next"]').click();
  const jumped = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/play-item') && req.method() === 'POST');
  await page.locator('.qs-panel.active .qs-select[data-item="ootb-02"]').click();
  expect(JSON.parse((await jumped).postData())).toEqual({ item_id: 'ootb-02' });
});

// FEAT-497 story 5 — every row plays via play-item on tap; a QUEUED row is no
// exception. The entry stays in the Queue, it just plays now.
test('tapping a queued row plays it now via play-item — the entry is NOT removed from the queue', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const played = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/play-item') && req.method() === 'POST');
  await page.locator('.qs-panel.active .qs-row .qs-select').click();
  expect(JSON.parse((await played).postData())).toEqual({ item_id: 'dancing-queen' });
  await expect(page.locator('.qs-panel.active .qs-row')).toHaveCount(1);   // still queued
});

test('reorder: the down arrow on a queued entry POSTs move-queue-entry', async ({ page }) => {
  const backend = await installQueuePlaybackBackend(page, 'music');
  backend.seed('play-source', { source_type: 'album', source_id: 'ootb' });
  backend.seed('queue-item', { item_id: 'dancing-queen' });
  backend.seed('queue-item', { item_id: 'ootb-03' });
  await page.goto('/app/homeview/audio.html?album=ootb&track=ootb-01&from=detail-album');
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  await openQueue(page);
  await expect(page.locator('.qs-panel.active .qs-row')).toHaveCount(2);
  const moved = page.waitForRequest(req => req.url().includes('/api/queue/music/move-queue-entry'));
  await page.locator('.qs-panel.active .qs-row').first().locator('.qs-act:not([disabled])').first().click();
  expect(JSON.parse((await moved).postData())).toHaveProperty('direction', 'down');
});

test('the Shuffle/Repeat hero buttons toggle and reflect the snapshot', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.qs-tbtn[data-action="toggle-repeat"]')).toHaveClass(/on/);   // album defaults repeat ON
  const toggled = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/toggle-repeat') && req.method() === 'POST');
  await page.locator('.qs-tbtn[data-action="toggle-repeat"]').click();
  await toggled;
  await expect(page.locator('.qs-tbtn[data-action="toggle-repeat"]')).not.toHaveClass(/on/);
});

test('Back (Escape) closes the overlay back to the still-playing player', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#queue-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#btn-queue')).toBeFocused();
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
});

// TASK-216, kept from the pre-cutover suite: the breadcrumb is a real control,
// not dead text — the only non-keyboard way back out of the overlay.
test('clicking the breadcrumb closes the overlay to the still-playing player', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.locator('#queue-crumb-back').click();
  await expect(page.locator('#queue-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#btn-queue')).toBeFocused();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
});

// TASK-504 — a LONE track has no source at all (play-standalone), so there is
// nothing to shuffle, repeat or step back through. The hero renders those
// disabled-but-visible, exactly as a standalone film does (TASK-493 row 21):
// music used to HIDE ⏮/⏭ for a lone track via its own setQueueMode, which is
// the divergence this cutover removes.
test('a lone track renders Shuffle/Repeat/⏮ disabled-but-visible, never hidden', async ({ page }) => {
  await installQueuePlaybackBackend(page, 'music');
  await page.goto('/app/homeview/audio.html?track=ootb-01&from=browse');
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  // the player's own transport row
  await expect(page.locator('#btn-prev')).toBeVisible();
  await expect(page.locator('#btn-prev')).toHaveClass(/is-disabled/);
  await openQueue(page);
  const shuffle = page.locator('.qs-tbtn[aria-label="Shuffle"]');
  const repeat = page.locator('.qs-tbtn[aria-label="Repeat"]');
  const previous = page.locator('.qs-tbtn[aria-label="Previous"]');
  await expect(shuffle).toBeVisible();
  await expect(repeat).toBeVisible();
  await expect(previous).toBeVisible();
  await expect(shuffle).toHaveClass(/is-disabled/);
  await expect(repeat).toHaveClass(/is-disabled/);
  await expect(previous).toHaveClass(/is-disabled/);
});

// TASK-535 — the same lone track on the TV: the page reads as itself with less
// in it, not as a broken one. Three emptinesses arrive together and each says
// its own thing, in music's own noun — the phone mirror of this is
// companion-queue.test.js.
test('a lone track explains its blank hero line and its two empty tabs', async ({ page }) => {
  await installQueuePlaybackBackend(page, 'music');
  await page.goto('/app/homeview/audio.html?track=ootb-01&from=browse');
  await expect(page.locator('#screen-audio')).toBeVisible();
  await openQueue(page);
  await expect(page.locator('.qs-hero-sub')).toHaveText('Playing on its own');
  await expect(page.locator('.qs-panel[data-tab="next"] .qs-empty'))
    .toHaveText('Nothing up next — this track is playing on its own');
  await expect(page.locator('.qs-panel[data-tab="coming-up"] .qs-ends'))
    .toContainText('No source to follow — nothing plays after this track');
});

// The music twin of TASK-517 story 1: a lone track with something queued behind
// it lights ⏭ at BOTH sites off the one transport rule, and either plays it.
test('a queued track lights ⏭ on the player row AND the Queue hero', async ({ page }) => {
  const backend = await installQueuePlaybackBackend(page, 'music');
  backend.seed('queue-item', { item_id: 'dancing-queen' });
  await page.goto('/app/homeview/audio.html?track=ootb-01&from=browse');
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  await expect(page.locator('#btn-next')).toBeVisible();
  await expect(page.locator('#btn-next')).not.toHaveClass(/is-disabled/);
  await expect(page.locator('#btn-next')).toBeEnabled();
  await openQueue(page);
  const heroNext = page.locator('.qs-tbtn[aria-label="Next"]');
  await expect(heroNext).not.toHaveClass(/is-disabled/);
  const advanced = page.waitForRequest(req =>
    req.url().includes('/api/queue/music/next') && req.method() === 'POST');
  await heroNext.click();
  await advanced;
  await expect(page.locator('#audio-title')).toHaveText('Dancing Queen');
});

// TASK-504 story 1 — one screen for every media type. The music Queue and the
// film Queue differ only where the media genuinely does: the noun in the
// empty-Queue line ("tracks", not "titles"), never in shape.
test('the music Queue is the same screen as the film Queue, differing only in the media noun', async ({ page }) => {
  await installQueuePlaybackBackend(page, 'music');
  await page.goto('/app/homeview/audio.html?track=ootb-01&from=browse');
  await expect(page.locator('#screen-audio')).toBeVisible();
  await openQueue(page);
  await expect(page.locator('.qs-panel[data-tab="queue"] .qs-empty'))
    .toHaveText('Nothing queued — add tracks with ＋');
});
