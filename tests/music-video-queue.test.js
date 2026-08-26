const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, MUSIC_VIDEO_CARDS } = require('./fixtures/api.js');

// FEAT-497 (TASK-505) — the music-video Queue View overlay, the LAST of the
// four media types to move. It hangs off the persistent video player (the
// <video> stays mounted) and draws the server `queue_playback` snapshot: the
// hero (art/title/source subtitle + icon-only transport) over Queue/Next/
// Coming-Up tabs, all through THE shared shell (core/queue-shell-view.js's
// `.qs-*` markup, ui/screens/screen-queue-shell.js). Row controls fire
// /api/queue/music-video actions; the overlay repaints from the next snapshot
// the backend pushes.
//
// Written as a deliberate TWIN of the film suite that lived in
// tests/video-queue-view.test.js (removed with the legacy Queue in TASK-525),
// the way TASK-504 twinned music's own Queue suites: the two media types share
// one screen and one engine, so a divergence between them should show up here
// as a failure rather than as a difference nobody notices.

async function openPlayer(page) {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  backend.seed('play-source', { source_type: 'mv-artist', source_id: 'QOTSA' });
  backend.seed('queue-item', { item_id: 'mv-03' });   // a durable Queue entry
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  // up-next prefers the queue front -> Starlight (the page's last async signal).
  await expect(page.locator('#video-upnext')).toHaveText('Up next: Starlight');
  return backend;
}

async function openQueue(page) {
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
}

test('Queue button opens the overlay with the durable Queue', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.qs-panel.active .qs-row')).toHaveCount(1);
  await expect(page.locator('.qs-panel.active .qs-name')).toHaveText('Starlight');
});

test('Next lists the source videos after the current one as play-to-jump rows', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.locator('.qs-tab[data-tab="next"]').click();
  // mv-02 also appears in the (inactive) Coming Up panel under default repeat —
  // scope to the active panel so the locator stays a single match.
  await expect(page.locator('.qs-panel.active .qs-select[data-item="mv-02"]')).toBeVisible();
});

test('a source row plays-to-jump via play-item', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.locator('.qs-tab[data-tab="next"]').click();
  const jumped = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/play-item') && req.method() === 'POST');
  await page.locator('.qs-panel.active .qs-select[data-item="mv-02"]').click();
  expect(JSON.parse((await jumped).postData())).toEqual({ item_id: 'mv-02' });
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
});

// Story 7 / FEAT-497's shared "Rows" rule — every row plays via play-item on
// tap, a QUEUED row included (unlike the retired music-video-queue-view.js,
// where a tapped row left the entry queued to play a second time). The entry
// stays in the Queue, it just plays now, and nothing is reordered or emptied.
test('tapping a queued row plays it now via play-item — the Queue is not reordered or emptied', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const played = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/play-item') && req.method() === 'POST');
  await page.locator('.qs-panel.active .qs-row .qs-select').click();
  expect(JSON.parse((await played).postData())).toEqual({ item_id: 'mv-03' });
  await expect(page.locator('.qs-panel.active .qs-row')).toHaveCount(1);   // still queued
});

test('removing a queued entry POSTs remove-queue-entry and the overlay repaints', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  const removed = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/remove-queue-entry') && req.method() === 'POST');
  await page.locator('.qs-panel.active .qs-row .qs-act.danger').click();
  await removed;
  await expect(page.locator('.qs-panel[data-tab="queue"] .qs-row')).toHaveCount(0);
});

test('reorder: the down arrow on a queued entry POSTs move-queue-entry', async ({ page }) => {
  // two queued entries so an edge arrow is enabled
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  backend.seed('play-source', { source_type: 'mv-artist', source_id: 'QOTSA' });
  backend.seed('queue-item', { item_id: 'mv-03' });
  backend.seed('queue-item', { item_id: 'mv-02' });   // append, not front-insert
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await openQueue(page);
  await expect(page.locator('.qs-panel.active .qs-row')).toHaveCount(2);
  const moved = page.waitForRequest(req => req.url().includes('/api/queue/music-video/move-queue-entry'));
  // first queued row's down arrow (↑ is disabled at the top, so [0] is ↓)
  await page.locator('.qs-panel.active .qs-row').first().locator('.qs-act:not([disabled])').first().click();
  expect(JSON.parse((await moved).postData()).direction).toBe('down');
});

test('the Shuffle/Repeat hero buttons toggle and reflect the snapshot', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await expect(page.locator('.qs-tbtn[data-action="toggle-repeat"]')).toHaveClass(/on/);   // a source defaults repeat ON
  const toggled = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/toggle-repeat') && req.method() === 'POST');
  await page.locator('.qs-tbtn[data-action="toggle-repeat"]').click();
  await toggled;
  await expect(page.locator('.qs-tbtn[data-action="toggle-repeat"]')).not.toHaveClass(/on/);
});

test('Back (Escape) closes the overlay back to the still-mounted player', async ({ page }) => {
  await openPlayer(page);
  await openQueue(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#queue-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
});

test('the music-video Queue is the same screen as the film one, differing only in the media noun', async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'music-video');
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await openQueue(page);
  await expect(page.locator('.qs-panel[data-tab="queue"] .qs-empty'))
    .toHaveText('Nothing queued — add videos with ＋');
});

// ── entry: each route drives the unified engine's own source ───────────────

test('playing a music-video playlist syncs the engine\'s source + now-playing', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect.poll(() => backend.snapshot().source_type).toBe('mv-playlist');
  expect(backend.snapshot().source_id).toBe('pl-mv');
  await expect.poll(() => (backend.snapshot().now_playing || {}).item_id).toBe('mv-01');
});

// TASK-524 — this used to assert ONE play-source carrying the tapped track's
// item_id, and passed only because the fixture honoured that field.
// api/queue_playback.py never has: it reads source_type/source_id off the body
// and passes neither an item nor a follow-up to engine.play_source, which
// starts the source at current[0]. Tapping "No One Knows" mid-playlist really
// played the playlist's first video. Entry is the two-action shape now — load
// the source, then land on the tap — which is what home movies always sent.
test('a tapped playlist track starts THERE: play-source, then play-item for the tap', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  const started = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/play-source') && req.method() === 'POST');
  const landed = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/play-item') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&musicVideoTrack=mv-02&from=detail-playlist');
  await expect(page.locator('#screen-video')).toBeVisible();
  // The source POST names the source and NOTHING else — an item_id here is a
  // field the server drops.
  expect(JSON.parse((await started).postData()))
    .toEqual({ source_type: 'mv-playlist', source_id: 'pl-mv' });
  expect(JSON.parse((await landed).postData())).toEqual({ item_id: 'mv-02' });
  await expect.poll(() => (backend.snapshot().now_playing || {}).item_id).toBe('mv-02');
});

// The other half of the same rule: no tapped track means no play-item at all,
// and the playlist's own first video plays.
test('a playlist played from the top sends play-source alone', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  var items = [];
  await page.route('**/api/queue/music-video/play-item*', function(route) {
    items.push(route.request().url());
    route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect.poll(() => (backend.snapshot().now_playing || {}).item_id).toBe('mv-01');
  expect(items).toEqual([]);
});

test('playing an artist\'s music videos syncs source_type mv-artist / source_id the artist name', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', function(route) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_VIDEO_CARDS) })
    });
  });
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect.poll(() => backend.snapshot().source_type).toBe('mv-artist');
  expect(backend.snapshot().source_id).toBe('QOTSA');
});

test('Play All syncs source_type mv-all / source_id null', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  await page.goto('/app/homeview/video.html?musicVideoAll=1&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect.poll(() => backend.snapshot().source_type).toBe('mv-all');
  expect(backend.snapshot().source_id).toBe(null);
});

test('advancing to the next music video re-syncs the engine\'s now-playing', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await page.locator('#btn-next').click();
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
  await expect.poll(() => (backend.snapshot().now_playing || {}).item_id).toBe('mv-02');
  // Reopening the Queue shows the MOVED-TO video as the hero, not the one that
  // started the playthrough.
  await openQueue(page);
  await expect(page.locator('.qs-hero-title')).toHaveText('No One Knows');
});

// ── story 4: a lone pick keeps its transport, dimmed ───────────────────────
// The twin of the standalone-film cases the removed film suite carried. A lone
// music video plays as a STANDALONE item (no source at all), which is what
// leaves ⏮/⏭/Shuffle/Repeat dimmed-but-visible instead of hidden — BUG-485's
// `item_count` gate used to remove them from the page outright.

test('a lone music video plays THROUGH the engine (play-standalone) and keeps the Queue button', async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'music-video');
  const played = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/play-standalone') && req.method() === 'POST');
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  expect(JSON.parse((await played).postData())).toEqual({ item_id: 'mv-01' });
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await openQueue(page);
  await expect(page.locator('.qs-hero-title')).toHaveText('Head Like a Haunted House');
});

test('a lone music video renders Shuffle/Repeat/⏮ dimmed-but-visible on the hero, never hidden', async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'music-video');
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#screen-video')).toBeVisible();
  await openQueue(page);
  // data-act/data-action are omitted on a disabled hero button (core/
  // queue-shell-view.js heroBtn), so the locators key off aria-label.
  for (const label of ['Shuffle', 'Repeat', 'Previous']) {
    const btn = page.locator(`.qs-tbtn[aria-label="${label}"]`);
    await expect(btn).toBeVisible();
    await expect(btn).toHaveClass(/is-disabled/);
    await expect(btn).toBeDisabled();
  }
});

// The player row's own copy of that rule lives in video-music-video.test.js.
// The twin of the film suite's BUG-510/512 case: ⏭ is live whenever anything
// is AHEAD, queue included — which the retired item_count gate could not
// express at all, since a lone pick hid the button outright.
test('a queued music video lights ⏭ on the player row AND the hero, and either plays it', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  backend.seed('queue-item', { item_id: 'mv-02' });
  await page.goto('/app/homeview/video.html?musicVideo=mv-01&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await expect(page.locator('#btn-next')).toBeVisible();
  await expect(page.locator('#btn-next')).not.toHaveClass(/is-disabled/);
  await openQueue(page);
  const heroNext = page.locator('.qs-tbtn[aria-label="Next"]');
  await expect(heroNext).not.toHaveClass(/is-disabled/);
  const advanced = page.waitForRequest(req =>
    req.url().includes('/api/queue/music-video/next') && req.method() === 'POST');
  await heroNext.click();
  await advanced;
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-02/);
});

// ── story 5: source order, not shuffled ────────────────────────────────────
// The music-video engine used to default shuffle ON whenever the client
// omitted the flag, and the client always omitted it. The unified engine reads
// the person's remembered per-source preference instead (default off), so an
// artist or playlist starts in source order.

test('an artist starts in source order, not shuffled', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music-video');
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);   // the source's own first
  await expect.poll(() => backend.snapshot().shuffle).toBe(false);
  await openQueue(page);
  await expect(page.locator('.qs-tbtn[aria-label="Shuffle"]')).not.toHaveClass(/on/);
});

// ── story 6: the source keeps its name ─────────────────────────────────────

test('the hero names the playlist being played', async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'music-video');
  await page.goto('/app/homeview/video.html?musicVideoPlaylist=pl-mv&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await openQueue(page);
  await expect(page.locator('.qs-hero-sub')).toHaveText('QOTSA Videos');
});

test('the hero names the artist being played', async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'music-video');
  await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
  await expect(page.locator('#video')).toHaveAttribute('src', /mv-01/);
  await openQueue(page);
  await expect(page.locator('.qs-hero-sub')).toHaveText('QOTSA');
});
