const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend } = require('./fixtures/api.js');

// TASK-505 (FEAT-497) — the companion MUSIC-VIDEO Queue page, the last of the
// four moved onto THE shared shell (ui/screens/companion-queue-shell.js +
// core/queue-shell-view.js). Its own copy (companion-music-video-queue.js,
// core/music-video-queue-view.js) went with it, so every phone Queue page is
// now one renderer told which media type it is: same crumb, same rows, same
// transport rule, differing only where the media genuinely does — the noun in
// the empty-Queue line, and how the hero's source line resolves (a music
// video's playlist/artist source is opaque, so the page passes
// `loadMusicVideoSourceTitle`).
//
// Written as a deliberate TWIN of tests/companion-film-queue-page.test.js, so
// a music-video/film divergence shows up here as a failure.
//
// The phone renders the SAME `queue_playback` snapshot the TV gets (per-person
// relay, filtered to media_type 'music-video') and DRIVES the queue by POSTing
// to /api/queue/music-video for the active person.

async function setup(page, seedActions) {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  backend.seed('play-source', { source_type: 'mv-artist', source_id: 'QOTSA' });
  (seedActions || [{ action: 'queue-item', body: { item_id: 'mv-03' } }])
    .forEach(function(s) { backend.seed(s.action, s.body); });
  await page.goto('/companion/music-video-queue.html');
  await expect(page.locator('.qs-ph-title')).toHaveText('Head Like a Haunted House');   // settle signal
  return backend;
}

function expectPersonOnPost(page, fragment) {
  return page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/' + fragment) && req.method() === 'POST'
    && req.url().includes('person=kids'));
}

function activeRows(page) { return page.locator('.ph-qtab-panel.active .ph-qrow'); }

test('mirrors the hero + sections from the server snapshot', async ({ page }) => {
  await setup(page);
  await expect(activeRows(page)).toHaveCount(1);
  await expect(activeRows(page).locator('.nm')).toContainText('Starlight');
});

// A music video's source id is opaque (a playlist) or IS the name (an artist),
// so the page resolves it through its own lookup — the one thing it does that
// the home-movie page doesn't.
test('the hero names the artist being played', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.qs-ph-sub')).toHaveText('QOTSA');
});

test('tapping a row plays it now (play-item) for the active person', async ({ page }) => {
  await setup(page);
  const played = expectPersonOnPost(page, 'play-item');
  await activeRows(page).locator('.ph-qname[data-act="select"]').first().click();
  expect(JSON.parse((await played).postData())).toEqual({ item_id: 'mv-03' });
  await expect(page.locator('.qs-ph-title')).toHaveText('Starlight');
});

test('removing the queued row POSTs remove-queue-entry and repaints without it', async ({ page }) => {
  await setup(page);
  const removed = expectPersonOnPost(page, 'remove-queue-entry');
  await activeRows(page).locator('.ph-ract.x').first().click();
  await removed;
  await expect(page.locator('.ph-qtab-panel[data-tab="queue"] .ph-qrow')).toHaveCount(0);
});

test('toggling shuffle POSTs the action and reflects the snapshot', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.qs-tbtn[data-action="toggle-shuffle"]')).not.toHaveClass(/on/);
  await page.locator('.qs-tbtn[data-action="toggle-shuffle"]').click();
  await expect(page.locator('.qs-tbtn[data-action="toggle-shuffle"]')).toHaveClass(/on/);
});

// The retired music-video copy had a bare back button with no leaf.
test('the crumb reads "‹ Now Playing › Queue", not a bare back button', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-crumb #btn-back')).toHaveText('‹ Now Playing');
  await expect(page.locator('.ph-crumb .ph-crumb-current')).toHaveText('Queue');
});

// A music video's muted second line is its ARTIST, where a film shows a
// runtime — the one row difference the shared config carries as data.
test('every row is a title over its artist, like the TV', async ({ page }) => {
  await setup(page);
  const row = activeRows(page).locator('.ph-qname').first();
  await expect(row.locator('.qs-name')).toHaveText('Starlight');
  await expect(row.locator('.qs-sub')).toHaveText('Muse');
});

test('Coming Up rows carry the read-only class the phone can dim', async ({ page }) => {
  await setup(page);
  const panel = page.locator('.ph-qtab-panel[data-tab="coming-up"]');
  await expect(panel.locator('.ph-qrow').first()).toHaveClass(/ph-readonly/);
  expect(await panel.locator('.acts').count()).toBe(0);
});

test('the empty Queue line names videos, in the shared wording', async ({ page }) => {
  await setup(page, []);
  await expect(page.locator('.ph-qtab-panel[data-tab="queue"] .ph-qempty'))
    .toHaveText('Nothing queued — add videos with ＋');
});

// Story 4 on the phone — a lone pick has no source: everything but ⏯ dims,
// and nothing disappears. The retired copy hid the pair outright.
test('a lone music video dims ⏮/Shuffle/Repeat rather than hiding them', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  backend.seed('play-standalone', { item_id: 'mv-01' });
  await page.goto('/companion/music-video-queue.html');
  await expect(page.locator('.qs-ph-title')).toHaveText('Head Like a Haunted House');
  const previous = page.locator('.qs-tbtn[aria-label="Previous"]');
  const shuffle = page.locator('.qs-tbtn[aria-label="Shuffle"]');
  await expect(previous).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(shuffle).toBeVisible();
  await expect(shuffle).toBeDisabled();
  await expect(page.locator('.qs-tbtn[aria-label="Repeat"]')).toBeDisabled();
  // TASK-535 — the hero says so rather than leaving the line blank.
  await expect(page.locator('.qs-ph-sub')).toHaveText('Playing on its own');
});

// TASK-535 — and the two empty tabs each say why, in the music-video noun.
test('a lone music video says why Next and Coming Up are empty', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  backend.seed('play-standalone', { item_id: 'mv-01' });
  await page.goto('/companion/music-video-queue.html');
  await expect(page.locator('.ph-qtab-panel[data-tab="next"] .ph-qempty'))
    .toHaveText('Nothing up next — this video is playing on its own');
  await expect(page.locator('.ph-qtab-panel[data-tab="coming-up"] .ph-ends'))
    .toContainText('No source to follow — nothing plays after this video');
});

test('a queued music video revives ⏭ on a lone pick', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  backend.seed('play-standalone', { item_id: 'mv-01' });
  await page.goto('/companion/music-video-queue.html');
  await expect(page.locator('.qs-tbtn[aria-label="Next"]')).toBeDisabled();
  backend.seed('queue-item', { item_id: 'mv-03' });
  await page.reload();
  await expect(page.locator('.qs-tbtn[aria-label="Next"]')).toBeEnabled();
});

test('back returns to the companion video player', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-back').click();
  await expect(page).toHaveURL(/companion\/video\.html$/);
});

test('the Screen row is mounted from the start', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-status').click();
  await expect(page.locator('#screen-bar')).not.toBeEmpty();
  await expect(page.locator('#screen-bar')).toContainText('TV');
});
