const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');

// FEAT-040 (TASK-250/queue-fixes) — the companion Video Queue View mirror. The
// phone renders the SAME server `video_playback` snapshot the TV gets (per-person
// relay) into NOW PLAYING / PLAY NEXT / FROM SERIES, and DRIVES the queue by
// POSTing video-playback actions to /api/video-playback for the active person.
// Regression guard for the queue-fixes bug: onAppState threw (a stray
// syncBar.updateStatus) and never captured `person`, so every POST went to
// person= and the server no-op'd it — move/next/remove silently did nothing.

async function setup(page) {
  await installApi(page);
  const vb = await installVideoPlaybackBackend(page);
  vb.seed('play-source', { source_type: 'series', source_id: 'bluey', item_id: 'bluey-s1e01' });
  vb.seed('queue-video', { video_id: 'bluey-s1e03' });   // e1
  vb.seed('queue-video', { video_id: 'bluey-s1e02' });   // e2 (append — plays after e1)
  await page.goto('/companion/video-queue.html');
  await expect(page.locator('.ph-np .nm')).toHaveText('Daddy Putdown');   // settle signal
  return vb;
}

// Every action must carry the active person (regression: it used to be empty).
function expectPersonOnPost(page, fragment) {
  return page.waitForRequest(req =>
    req.url().includes('/api/video-playback/' + fragment) && req.method() === 'POST'
    && req.url().includes('person=kids'));
}

test('mirrors the sections from the server snapshot (append order)', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-qrow.queued')).toHaveCount(2);
  // append: first-queued (e1, Hammerbarn) is the front of Play Next.
  await expect(page.locator('.ph-qrow.queued .nm').first()).toContainText('Hammerbarn');
  await expect(page.locator('.ph-qname[data-act="select"][data-item="bluey-s1e02"]')).toBeVisible();
});

test('next carries the active person (regression: person was empty) and advances', async ({ page }) => {
  await setup(page);
  const nextReq = expectPersonOnPost(page, 'next');
  await page.locator('.ph-tbtn[data-action="next"]').click();
  await nextReq;   // fails if person= empty
  await expect(page.locator('.ph-np .nm')).toHaveText('Hammerbarn');   // queue front pops
});

test('reorder: a queued entry down-arrow POSTs move-queue-entry for the person', async ({ page }) => {
  await setup(page);
  const moved = expectPersonOnPost(page, 'move-queue-entry');
  await page.locator('.ph-qrow.queued').first().locator('.ph-ract:not([disabled])').first().click();
  expect(JSON.parse((await moved).postData())).toEqual({ entry_id: 'e1', direction: 'down' });
});

test('removing the queued row POSTs remove-queue-entry and repaints without it', async ({ page }) => {
  await setup(page);
  const removed = expectPersonOnPost(page, 'remove-queue-entry');
  await page.locator('.ph-qrow.queued .ph-ract.x').first().click();
  expect(JSON.parse((await removed).postData())).toEqual({ entry_id: 'e1' });
  await expect(page.locator('.ph-qrow.queued')).toHaveCount(1);
});

test('tapping a queued row plays it now (play-video) + drops it from the queue', async ({ page }) => {
  await setup(page);
  const played = expectPersonOnPost(page, 'play-video');
  await page.locator('.ph-qrow.queued .ph-qname[data-act="play-now"]').first().click();
  expect(JSON.parse((await played).postData())).toEqual({ video_id: 'bluey-s1e03' });
  await expect(page.locator('.ph-np .nm')).toHaveText('Hammerbarn');
});

test('tapping a source row POSTs play-item — now-playing advances to it', async ({ page }) => {
  await setup(page);
  await page.locator('.ph-qname[data-act="select"][data-item="bluey-s1e02"]').click();
  await expect(page.locator('.ph-np .nm')).toHaveText('The Weekend');
});

test('toggling repeat POSTs the action and reflects the snapshot', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-tbtn[data-action="toggle-repeat"]')).toHaveClass(/on/);
  await page.locator('.ph-tbtn[data-action="toggle-repeat"]').click();
  await expect(page.locator('.ph-tbtn[data-action="toggle-repeat"]')).not.toHaveClass(/on/);
});

test('back returns to the companion video player', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-back').click();
  await expect(page).toHaveURL(/companion\/video\.html$/);
});
