const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend, installQueuePlaybackBackend } = require('./fixtures/api.js');

// FEAT-040 (TASK-250) / FEAT-497 (TASK-503) — the film Queue View overlay. It
// hangs off the persistent video player (the <video> stays mounted) and draws
// the server `queue_playback` snapshot: the hero (art/title/source subtitle +
// icon-only transport) over Queue/Next/Coming-Up tabs (core/film-queue-view.js
// `.qs-*` classes) — TASK-503's cutover of series/single/boxset onto the
// TASK-498 unified queue engine, the same shell TASK-499 shipped for home
// movies. Row controls fire /api/queue/film actions; the overlay repaints
// from the next snapshot the backend pushes. `?playQueue` mode is untouched —
// it stays on the OLD /api/video-playback engine (no equivalent "pop the
// queue and play" action on the new one, screen-video-page.js's own
// MODE_ENGINE comment), so those two tests keep installVideoPlaybackBackend.

async function openPlayer(page) {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('play-source', { source_type: 'series', source_id: 'bluey', item_id: 'bluey-s1e01' });
  backend.seed('queue-item', { item_id: 'bluey-s1e03' });   // a durable Queue entry (entry_id e1)
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  // up-next prefers the queue front -> Hammerbarn (the page's last async signal).
  await expect(page.locator('#video-upnext')).toHaveText('Up next: Hammerbarn');
  return backend;
}

async function openQueue(page) {
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
}

test('?playQueue entry starts the queue head (play-queue) and plays it', async ({ page }) => {
  // FEAT-040 Play Queue: enter the player with no video, just the queue.
  // Stays on the OLD engine — the browse "Play Queue" tile's own entry point.
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('queue-video', { video_id: 'bluey-s1e02' });
  vb.seed('queue-video', { video_id: 'bluey-s1e03' });
  const played = page.waitForRequest(req =>
    req.url().includes('/api/video-playback/play-queue') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?playQueue=1&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await played;
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);   // front plays
});

test('re-entering ?playQueue resumes the SAME head — going in/out does not consume it', async ({ page }) => {
  // Owner bug: hitting back then Play Queue again skipped to the next item.
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('queue-video', { video_id: 'bluey-s1e02' });
  vb.seed('queue-video', { video_id: 'bluey-s1e03' });
  await page.goto('/app/homeview/video.html?playQueue=1&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);
  await page.goto('about:blank');                                   // leave the player
  await page.goto('/app/homeview/video.html?playQueue=1&from=browse');   // re-enter
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/);   // same head, NOT e03
});

test('Queue button opens the overlay with the durable Queue', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.qs-panel.active .qs-row')).toHaveCount(1);
  await expect(page.locator('.qs-panel.active .qs-name')).toHaveText('Hammerbarn');
});

test('Next lists the source items after the current one as play-to-jump rows', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.locator('.qs-tab[data-tab="next"]').click();
  // bluey-s1e02 also appears in the (inactive) Coming Up panel under default
  // repeat — scope to the active panel so the locator stays a single match.
  await expect(page.locator('.qs-panel.active .qs-select[data-item="bluey-s1e02"]')).toBeVisible();
});

// The fixture's play-source (like the real engine) mints permutation entry
// ids sequentially FIRST (e1..e3 current, e4..e6 next, for bluey's 3
// episodes) — the queue-item seeded straight after starts at e7, not e1.
test('removing a queued entry POSTs remove-queue-entry and the overlay repaints', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const removed = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/remove-queue-entry') && req.method() === 'POST');
  await page.locator('.qs-panel.active .qs-row .qs-act.danger').click();
  expect(JSON.parse((await removed).postData())).toEqual({ entry_id: 'e7' });
  // The removed item (bluey-s1e03) is STILL a Next row (queueing never
  // touches current_permutation) — the shell's own "opens on first
  // non-empty tab" default then repaints onto Next, so assert the now-empty
  // Queue panel directly rather than `.active` (which just followed it).
  await expect(page.locator('.qs-panel[data-tab="queue"] .qs-row')).toHaveCount(0);
});

test('a source row plays-to-jump via play-item', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.locator('.qs-tab[data-tab="next"]').click();
  const jumped = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/play-item') && req.method() === 'POST');
  await page.locator('.qs-panel.active .qs-select[data-item="bluey-s1e02"]').click();
  expect(JSON.parse((await jumped).postData())).toEqual({ item_id: 'bluey-s1e02' });
});

// FEAT-497 story 5 — every row plays via play-item on tap; a QUEUED row is no
// exception (unlike the retired video-queue-view.js's own "play-now" =
// remove+play-video). The entry stays in the Queue, it just plays now.
test('tapping a queued row plays it now via play-item — the entry is NOT removed from the queue', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const played = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/play-item') && req.method() === 'POST');
  await page.locator('.qs-panel.active .qs-row .qs-select').click();
  expect(JSON.parse((await played).postData())).toEqual({ item_id: 'bluey-s1e03' });
  await expect(page.locator('.qs-panel.active .qs-row')).toHaveCount(1);   // still queued
});

test('reorder: the down arrow on a queued entry POSTs move-queue-entry', async ({ page }) => {
  // two queued entries so an edge arrow is enabled
  await installApi(page);
  const vb = await installQueuePlaybackBackend(page, 'film');
  vb.seed('play-source', { source_type: 'series', source_id: 'bluey', item_id: 'bluey-s1e01' });
  vb.seed('queue-item', { item_id: 'bluey-s1e02' });   // e1
  vb.seed('queue-item', { item_id: 'bluey-s1e03' });   // e2 (append)
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  await expect(page.locator('.qs-panel.active .qs-row')).toHaveCount(2);
  const moved = page.waitForRequest(req => req.url().includes('/api/queue/film/move-queue-entry'));
  // first queued row's down arrow (↑ is disabled at the top, so [0] is ↓).
  // play-source mints e1..e6 for bluey's 3-episode permutations first, so the
  // two queue-item seeds land at e7/e8.
  await page.locator('.qs-panel.active .qs-row').first().locator('.qs-act:not([disabled])').first().click();
  expect(JSON.parse((await moved).postData())).toEqual({ entry_id: 'e7', direction: 'down' });
});

test('the Shuffle/Repeat hero buttons toggle and reflect the snapshot', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.qs-tbtn[data-action="toggle-repeat"]')).toHaveClass(/on/);   // series defaults repeat ON
  const toggled = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/toggle-repeat') && req.method() === 'POST');
  await page.locator('.qs-tbtn[data-action="toggle-repeat"]').click();
  await toggled;
  await expect(page.locator('.qs-tbtn[data-action="toggle-repeat"]')).not.toHaveClass(/on/);
});

test('Back (Escape) closes the overlay back to the still-mounted player', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#queue-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
});

test('a standalone film plays THROUGH the engine (play-standalone) and keeps the Queue button', async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'film');
  const played = page.waitForRequest(req =>
    req.url().includes('/api/queue/film/play-standalone') && req.method() === 'POST');
  // fmSwapVideo (screen-video-page.js) only calls playVideo — which sets #video's src —
  // after this progress load resolves; that's the real signal playback started, not
  // just the play-standalone POST being sent. Wait on it explicitly instead of racing
  // the attribute assertion's own retry window against a slow CI runner.
  const progressLoaded = page.waitForResponse(res =>
    res.url().includes('/api/progress/finding-nemo-main') && res.request().method() === 'GET');
  await page.goto('/app/homeview/video.html?video=finding-nemo-main&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  expect(JSON.parse((await played).postData())).toEqual({ item_id: 'finding-nemo-main' });
  await progressLoaded;
  await expect(page.locator('#video')).toHaveAttribute('src', /finding-nemo-main/);
  await expect(page.locator('#btn-queue')).toBeVisible();
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  await expect(page.locator('.qs-hero-title')).toHaveText('Finding Nemo');
});

// TASK-493 row 21 (the Films-hides-Shuffle finding) / TASK-503 — a standalone
// film has NOTHING to shuffle/repeat (no source at all), so the hero renders
// them disabled-but-visible: still there, dimmed, inert on tap. Not just for
// a boxset (which always has a source) — the constraint this spec calls out
// explicitly.
test('a standalone film renders Shuffle/Repeat disabled-but-visible on the hero (nothing to shuffle)', async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'film');
  await page.goto('/app/homeview/video.html?video=finding-nemo-main&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  // data-act/data-action are omitted on a disabled hero button (core/
  // film-queue-view.js heroBtn — inert on tap, matches every other disabled
  // control in this app), so the locator keys off aria-label instead.
  const shuffle = page.locator('.qs-tbtn[aria-label="Shuffle"]');
  const repeat = page.locator('.qs-tbtn[aria-label="Repeat"]');
  await expect(shuffle).toBeVisible();
  await expect(repeat).toBeVisible();
  await expect(shuffle).toHaveClass(/is-disabled/);
  await expect(repeat).toHaveClass(/is-disabled/);
  await expect(shuffle).toBeDisabled();
  await expect(repeat).toBeDisabled();
});
