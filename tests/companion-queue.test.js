const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend } = require('./fixtures/api.js');

// FEAT-031 (TASK-189) → FEAT-497 (TASK-504) — the companion MUSIC Queue page.
// It used to be music's own page (companion/queue.html over
// ui/screens/companion-queue.js, four sections off the old /api/playback
// snapshot). TASK-504 moved it to companion/music-queue.html on THE shared
// shell (ui/screens/companion-queue-shell.js + core/queue-shell-view.js) that
// films (TASK-517) and home movies (TASK-516) already run on.
//
// This suite is deliberately the twin of tests/companion-film-queue-page.test.js:
// the phone renders the SAME `queue_playback` snapshot the TV gets (per-person
// relay, filtered to media_type 'music') and DRIVES the queue by POSTing to
// /api/queue/music for the active person.

async function setup(page, seedActions) {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music');
  backend.seed('play-source', { source_type: 'album', source_id: 'ootb' });
  (seedActions || [{ action: 'queue-item', body: { item_id: 'dancing-queen' } }])
    .forEach(function(s) { backend.seed(s.action, s.body); });
  await page.goto('/companion/music-queue.html');
  await expect(page.locator('.qs-ph-title')).toHaveText('Turn to Stone');   // settle signal
  return backend;
}

function expectPersonOnPost(page, fragment) {
  return page.waitForRequest(req =>
    req.url().includes('/api/queue/music/' + fragment) && req.method() === 'POST'
    && req.url().includes('person=kids'));
}

function activeRows(page) { return page.locator('.ph-qtab-panel.active .ph-qrow'); }

test('mirrors the hero + sections from the server snapshot', async ({ page }) => {
  await setup(page);
  await expect(activeRows(page)).toHaveCount(1);
  await expect(activeRows(page).locator('.nm')).toContainText('Dancing Queen');
});

// Music's source id is opaque AND spans three kinds, so the page fetches the
// album/playlist/artist title — the one thing it does that the home-movie page
// doesn't, and it must pick the right lookup per source_type.
test('the hero names the album behind the track, fetched by source id', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.qs-ph-sub')).toHaveText('Out of the Blue');
});

test('tapping a row plays it now (play-item) for the active person', async ({ page }) => {
  await setup(page);
  const played = expectPersonOnPost(page, 'play-item');
  await activeRows(page).locator('.ph-qname[data-act="select"]').first().click();
  expect(JSON.parse((await played).postData())).toEqual({ item_id: 'dancing-queen' });
  await expect(page.locator('.qs-ph-title')).toHaveText('Dancing Queen');
});

test('removing the queued row POSTs remove-queue-entry and repaints without it', async ({ page }) => {
  await setup(page);
  const removed = expectPersonOnPost(page, 'remove-queue-entry');
  await activeRows(page).locator('.ph-ract.x').first().click();
  expect(JSON.parse((await removed).postData())).toHaveProperty('entry_id');
  await expect(page.locator('.ph-qtab-panel[data-tab="queue"] .ph-qrow')).toHaveCount(0);
});

test('toggling shuffle POSTs the action and reflects the snapshot', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.qs-tbtn[data-action="toggle-shuffle"]')).not.toHaveClass(/on/);
  await page.locator('.qs-tbtn[data-action="toggle-shuffle"]').click();
  await expect(page.locator('.qs-tbtn[data-action="toggle-shuffle"]')).toHaveClass(/on/);
});

test('toggling repeat POSTs the action and reflects the snapshot', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.qs-tbtn[data-action="toggle-repeat"]')).toHaveClass(/on/);
  await page.locator('.qs-tbtn[data-action="toggle-repeat"]').click();
  await expect(page.locator('.qs-tbtn[data-action="toggle-repeat"]')).not.toHaveClass(/on/);
});

test('the crumb reads "‹ Now Playing › Queue", not a bare back button', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-crumb #btn-back')).toHaveText('‹ Now Playing');
  await expect(page.locator('.ph-crumb .ph-crumb-current')).toHaveText('Queue');
});

// Music's row sub-line is the ARTIST where a film's is a duration — the one
// place the shared row builder is told the media differs (MUSIC.rowSub).
test('every row is a title over a muted artist line, like the TV', async ({ page }) => {
  await setup(page);
  const row = activeRows(page).locator('.ph-qname').first();
  await expect(row.locator('.qs-name')).toHaveText('Dancing Queen');
  await expect(row.locator('.qs-sub')).toHaveText('ABBA');
});

test('Coming Up rows carry the read-only class the phone can dim', async ({ page }) => {
  await setup(page);
  const panel = page.locator('.ph-qtab-panel[data-tab="coming-up"]');
  await expect(panel.locator('.ph-qrow').first()).toHaveClass(/ph-readonly/);
  expect(await panel.locator('.acts').count()).toBe(0);
});

// Story 1 — the same screen as the film Queue, down to the wording, with only
// the media noun changing.
test('the empty Queue line names tracks, in the shared wording', async ({ page }) => {
  await setup(page, []);
  await expect(page.locator('.ph-qtab-panel[data-tab="queue"] .ph-qempty'))
    .toHaveText('Nothing queued — add tracks with ＋');
});

// A lone track has no source: everything but ⏯ dims, and nothing disappears —
// music's own setQueueMode used to hide ⏮/⏭ outright instead.
test('a lone track dims ⏮/Shuffle/Repeat rather than hiding them', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music');
  backend.seed('play-standalone', { item_id: 'ootb-01' });
  await page.goto('/companion/music-queue.html');
  await expect(page.locator('.qs-ph-title')).toHaveText('Turn to Stone');
  const previous = page.locator('.qs-tbtn[aria-label="Previous"]');
  const shuffle = page.locator('.qs-tbtn[aria-label="Shuffle"]');
  await expect(previous).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(shuffle).toBeVisible();
  await expect(shuffle).toBeDisabled();
  await expect(page.locator('.qs-tbtn[aria-label="Repeat"]')).toBeDisabled();
  await expect(page.locator('.qs-ph-sub')).toHaveText('');   // no source to name
});

test('a queued track revives ⏭ on a lone track', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'music');
  backend.seed('play-standalone', { item_id: 'ootb-01' });
  await page.goto('/companion/music-queue.html');
  await expect(page.locator('.qs-tbtn[aria-label="Next"]')).toBeDisabled();
  backend.seed('queue-item', { item_id: 'dancing-queen' });
  await page.reload();
  await expect(page.locator('.qs-tbtn[aria-label="Next"]')).toBeEnabled();
});

test('back returns to the companion audio player', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-back').click();
  await expect(page).toHaveURL(/companion\/audio\.html$/);
});

// TASK-415 — the popout menu's Switch profile. The wiring only needs the WS
// connected, so this records raw intents over a minimal socket.
test('Switch profile sends the navigate intent to the picker (BUG-007)', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await page.routeWebSocket(/:8766/, ws => {
    ws.onMessage(raw => {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload);
    });
  });
  await page.goto('/companion/music-queue.html');
  await page.locator('#btn-status').click();
  await page.locator('#switch-profile').click();
  await expect.poll(() => intents.filter(i => i.intent === 'navigate' && i.params.page === 'profile.html').length).toBeGreaterThan(0);
});

// TASK-417 — the Screen row (mountScreenBar). Two devices so the bar surfaces
// its "Pick a screen" picker (a lone device auto-targets silently).
test('the Screen row lists both screens and picking one re-targets (TASK-417)', async ({ page }) => {
  const received = [];
  await installApi(page);
  await page.routeWebSocket(/:8766/, ws => {
    ws.onMessage(raw => {
      const m = JSON.parse(raw);
      received.push(m);
      if (m.type === 'list_devices') {
        ws.send(JSON.stringify({ type: 'devices', payload: { devices: [
          { device_id: 'tv-a', label: 'Living Room', active_person: null },
          { device_id: 'tv-b', label: 'Kitchen', active_person: null }
        ] } }));
      }
    });
  });
  await page.goto('/companion/music-queue.html');
  await page.locator('#btn-status').click();
  await expect(page.locator('#screen-bar .screen-btn')).toHaveCount(2);

  await page.locator('#screen-bar .screen-btn[data-id="tv-a"]').click();
  await expect.poll(() => received.filter(m => m.type === 'register_companion').length).toBeGreaterThan(0);
  const reg = received.find(m => m.type === 'register_companion');
  expect(reg.payload.device_id).toBe('tv-a');
});
