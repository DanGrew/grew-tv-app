const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend } = require('./fixtures/api.js');

// TASK-517 (FEAT-497) — the companion FILM Queue page, moved onto THE shared
// shell (ui/screens/companion-queue-shell.js + core/queue-shell-view.js) that
// home movies already ran on. Its own copy went with it, so the two phone
// pages are now one renderer told which media type it is: same crumb, same
// rows, same transport rule, differing only where the media genuinely does —
// the noun in the empty-Queue line, and how the hero's source line resolves
// (a film's series/boxset id is opaque, so the page passes `loadSeriesTitle`;
// home movies derive their own from the snapshot).
//
// The phone renders the SAME `queue_playback` snapshot the TV gets (per-person
// relay, filtered to media_type 'film') and DRIVES the queue by POSTing to
// /api/queue/film for the active person.

async function setup(page, seedActions) {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('play-source', { source_type: 'series', source_id: 'bluey', item_id: 'bluey-s1e01' });
  (seedActions || [{ action: 'queue-item', body: { item_id: 'bluey-s1e03' } }])
    .forEach(function(s) { backend.seed(s.action, s.body); });
  await page.goto('/companion/film-queue.html');
  await expect(page.locator('.qs-ph-title')).toHaveText('Daddy Putdown');   // settle signal
  return backend;
}

function expectPersonOnPost(page, fragment) {
  return page.waitForRequest(req =>
    req.url().includes('/api/queue/film/' + fragment) && req.method() === 'POST'
    && req.url().includes('person=kids'));
}

function activeRows(page) { return page.locator('.ph-qtab-panel.active .ph-qrow'); }

test('mirrors the hero + sections from the server snapshot', async ({ page }) => {
  await setup(page);
  await expect(activeRows(page)).toHaveCount(1);
  await expect(activeRows(page).locator('.nm')).toContainText('Hammerbarn');
});

// A film's source id is opaque, so the page fetches the collection's title —
// the one thing it does that the home-movie page doesn't.
test('the hero names the series behind the film, fetched by source id', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.qs-ph-sub')).toHaveText('Bluey');
});

test('tapping a row plays it now (play-item) for the active person', async ({ page }) => {
  await setup(page);
  const played = expectPersonOnPost(page, 'play-item');
  await activeRows(page).locator('.ph-qname[data-act="select"]').first().click();
  expect(JSON.parse((await played).postData())).toEqual({ item_id: 'bluey-s1e03' });
  await expect(page.locator('.qs-ph-title')).toHaveText('Hammerbarn');
});

test('removing the queued row POSTs remove-queue-entry and repaints without it', async ({ page }) => {
  await setup(page);
  const removed = expectPersonOnPost(page, 'remove-queue-entry');
  // Entry ids mint globally across the override queue AND both permutations
  // (mirrors queue_engine.py's cross-list _max_seq) — play-source's three
  // episodes claim e1-e6 before this queue-item mints e7.
  await activeRows(page).locator('.ph-ract.x').first().click();
  expect(JSON.parse((await removed).postData())).toEqual({ entry_id: 'e7' });
  await expect(page.locator('.ph-qtab-panel[data-tab="queue"] .ph-qrow')).toHaveCount(0);
});

test('toggling shuffle POSTs the action and reflects the snapshot', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.qs-tbtn[data-action="toggle-shuffle"]')).not.toHaveClass(/on/);
  await page.locator('.qs-tbtn[data-action="toggle-shuffle"]').click();
  await expect(page.locator('.qs-tbtn[data-action="toggle-shuffle"]')).toHaveClass(/on/);
});

// Story 4 — the phone reads as docs/QUEUE-UX-SHELL.md specifies. The retired
// film copy had none of this: a bare back button with no leaf, title-only
// rows, and Coming Up rows that looked editable but simply had no buttons.
test('the crumb reads "‹ Now Playing › Queue", not a bare back button', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-crumb #btn-back')).toHaveText('‹ Now Playing');
  await expect(page.locator('.ph-crumb .ph-crumb-current')).toHaveText('Queue');
});

test('every row is a title over a muted sub line, like the TV', async ({ page }) => {
  await setup(page);
  const row = activeRows(page).locator('.ph-qname').first();
  await expect(row.locator('.qs-name')).toHaveText('Hammerbarn');
  await expect(row.locator('.qs-sub')).toHaveText('7:20');
});

test('Coming Up rows carry the read-only class the phone can dim', async ({ page }) => {
  await setup(page);
  const panel = page.locator('.ph-qtab-panel[data-tab="coming-up"]');
  await expect(panel.locator('.ph-qrow').first()).toHaveClass(/ph-readonly/);
  expect(await panel.locator('.acts').count()).toBe(0);
});

// Story 5 — the same screen as the home-movie Queue, down to the wording,
// with only the media noun changing.
test('the empty Queue line names films, in the shared wording', async ({ page }) => {
  await setup(page, []);
  await expect(page.locator('.ph-qtab-panel[data-tab="queue"] .ph-qempty'))
    .toHaveText('Nothing queued — add titles with ＋');
});

// Story 2 — a standalone film has no source: everything but ⏯ dims, and
// nothing disappears.
test('a standalone film dims ⏮/Shuffle/Repeat rather than hiding them', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('play-standalone', { item_id: 'finding-nemo-main' });
  await page.goto('/companion/film-queue.html');
  await expect(page.locator('.qs-ph-title')).toHaveText('Finding Nemo');
  const previous = page.locator('.qs-tbtn[aria-label="Previous"]');
  const shuffle = page.locator('.qs-tbtn[aria-label="Shuffle"]');
  await expect(previous).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(shuffle).toBeVisible();
  await expect(shuffle).toBeDisabled();
  await expect(page.locator('.qs-tbtn[aria-label="Repeat"]')).toBeDisabled();
  await expect(page.locator('.qs-ph-sub')).toHaveText('');   // no source to name
});

// Story 1 on the phone — a film queued behind a standalone one revives ⏭,
// which gated on the source alone (BUG-510/512).
test('a queued film revives ⏭ on a standalone film', async ({ page }) => {
  await installApi(page);
  const backend = await installQueuePlaybackBackend(page, 'film');
  backend.seed('play-standalone', { item_id: 'finding-nemo-main' });
  await page.goto('/companion/film-queue.html');
  await expect(page.locator('.qs-tbtn[aria-label="Next"]')).toBeDisabled();
  backend.seed('queue-item', { item_id: 'bluey-s1e03' });
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
