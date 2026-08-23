const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend } = require('./fixtures/api.js');

// TASK-499 (FEAT-497) — the companion Home Movies Queue View mirror, the
// first cutover onto the TASK-498 unified queue engine + new Queue UX shell.
// The phone renders the SAME server `queue_playback` snapshot the TV gets
// (per-person relay, filtered to media_type 'home-movie') into the hero +
// Queue/Next/Coming-Up tabs, and DRIVES the queue by POSTing queue actions to
// /api/queue/home-movie for the active person.

async function setup(page, seedActions) {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'home-movie');
  backend.seed('play-source', { source_type: 'home-movies-by-person', source_id: 'millie' });
  (seedActions || [{ action: 'queue-item', body: { item_id: 'beach-day' } }])
    .forEach(function(s) { backend.seed(s.action, s.body); });
  await page.goto('/companion/home-movies-queue.html');
  await expect(page.locator('.qs-ph-title')).toHaveText('Millie Walk');   // settle signal
  return backend;
}

// Every action must carry the active person.
function expectPersonOnPost(page, fragment) {
  return page.waitForRequest(req =>
    req.url().includes('/api/queue/home-movie/' + fragment) && req.method() === 'POST'
    && req.url().includes('person=kids'));
}

// The Queue/Next/Coming-Up panels all sit in the DOM at once (CSS hides the
// inactive ones), so a row locator must scope to the active panel — the
// Queue tab opens active whenever it has rows (queue-tabs.js).
function activeRows(page) { return page.locator('.ph-qtab-panel.active .ph-qrow'); }

test('mirrors the hero + sections from the server snapshot', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.qs-ph-sub')).toHaveText('Millie');
  await expect(activeRows(page)).toHaveCount(1);
  await expect(activeRows(page).locator('.nm')).toContainText('Beach Day');
});

test('tapping a row plays it now (play-item) for the active person', async ({ page }) => {
  await setup(page);
  const played = expectPersonOnPost(page, 'play-item');
  await activeRows(page).locator('.ph-qname[data-act="select"]').first().click();
  expect(JSON.parse((await played).postData())).toEqual({ item_id: 'beach-day' });
  await expect(page.locator('.qs-ph-title')).toHaveText('Beach Day');
});

test('removing the queued row POSTs remove-queue-entry and repaints without it', async ({ page }) => {
  await setup(page);
  const removed = expectPersonOnPost(page, 'remove-queue-entry');
  // Entry ids mint globally across the override queue AND both permutations
  // (mirrors queue_engine.py's own cross-list _max_seq) — play-source's two
  // items claim e1-e4 (current + next permutation) before this queue-item
  // mints e5.
  await activeRows(page).locator('.ph-ract.x').first().click();
  expect(JSON.parse((await removed).postData())).toEqual({ entry_id: 'e5' });
  // The Queue tab itself (not ".active" — removing its only row can hand the
  // default-open tab to Next, which still has rows from the source).
  await expect(page.locator('.ph-qtab-panel[data-tab="queue"] .ph-qrow')).toHaveCount(0);
});

test('toggling shuffle POSTs the action and reflects the snapshot', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'home-movie');
  backend.seed('play-source', { source_type: 'home-movies-by-person', source_id: 'millie' });
  await page.goto('/companion/home-movies-queue.html');
  await expect(page.locator('.qs-ph-title')).toHaveText('Millie Walk');
  await expect(page.locator('.qs-tbtn[data-action="toggle-shuffle"]')).not.toHaveClass(/on/);
  await page.locator('.qs-tbtn[data-action="toggle-shuffle"]').click();
  await expect(page.locator('.qs-tbtn[data-action="toggle-shuffle"]')).toHaveClass(/on/);
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

test('Switch profile sends the navigate intent to the picker', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await page.routeWebSocket(/:8766/, ws => {
    ws.onMessage(raw => {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload);
    });
  });
  await page.goto('/companion/home-movies-queue.html');
  await page.locator('#btn-status').click();
  await page.locator('#switch-profile').click();
  await expect.poll(() => intents.filter(i => i.intent === 'navigate' && i.params.page === 'profile.html').length).toBeGreaterThan(0);
});
