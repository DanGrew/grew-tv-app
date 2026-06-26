const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend } = require('./fixtures/api.js');

// FEAT-031 (TASK-189) — the companion Queue View mirror. The phone renders the
// SAME server `playback` snapshot the TV gets (per-person relay, TASK-157) into
// the four sections, and DRIVES the queue by POSTing the TASK-186 actions
// straight to /api/playback (server-authoritative — the resolved snapshot comes
// back over the relay and repaints). installPlaybackBackend is the faithful mini
// backend shared with the TV Queue View (TASK-188); we seed a playing album +
// one queued track, then assert the mirror and the edits round-trip.

async function setup(page) {
  await installApi(page);
  const pb = await installPlaybackBackend(page);
  // ordered album, repeat off -> THEN is "Source ends"; one user-queued track.
  pb.seed('play-source', { source_type: 'album', source_id: 'ootb', shuffle: false });
  pb.seed('queue-track', { track_id: 'ootb-03' });
  await page.goto('/companion/queue.html');
  return pb;
}

test('mirrors the four sections from the server snapshot', async ({ page }) => {
  await setup(page);
  // Now Playing = the source's first track (ootb-01).
  await expect(page.locator('.ph-np .nm')).toHaveText('Turn to Stone');
  // PLAY NEXT holds the user-queued track, flagged queued.
  const playNext = page.locator('.ph-qrow.queued');
  await expect(playNext).toHaveCount(1);
  await expect(playNext.locator('.nm')).toContainText('Sweet Talkin Woman');
  // FROM SOURCE holds the rest of the permutation (ootb-02, ootb-03).
  await expect(page.locator('.ph-qname[data-track="ootb-02"]')).toBeVisible();
  // THEN: ordered + repeat off -> end-of-source marker, not rows.
  await expect(page.locator('.ph-ends')).toContainText('Source ends');
});

test('removing the queued row POSTs remove-queue-entry and repaints without it', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-qrow.queued')).toHaveCount(1);
  await page.locator('.ph-qrow.queued .ph-ract.x').click();
  // server drops the override entry, broadcasts the new snapshot -> PLAY NEXT empties.
  await expect(page.locator('.ph-qrow.queued')).toHaveCount(0);
});

test('toggling repeat POSTs the action and THEN gains the next permutation', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-ends')).toContainText('Source ends');
  await page.locator('.ph-tbtn[data-action="toggle-repeat"]').click();
  // BUG-015: repeat (not shuffle) gates THEN — repeat on -> the source wraps, so
  // THEN now lists the next permutation (no "Source ends").
  await expect(page.locator('.ph-ends')).toHaveCount(0);
  await expect(page.locator('.ph-tbtn[data-action="toggle-repeat"]')).toHaveClass(/on/);
});

test('tapping a queue row POSTs play-track — now-playing advances to it', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-np .nm')).toHaveText('Turn to Stone');
  await page.locator('.ph-qname[data-track="ootb-02"]').click();
  await expect(page.locator('.ph-np .nm')).toHaveText('Mr. Blue Sky');
});

test('back returns to the now-playing companion screen', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-back').click();
  await expect(page).toHaveURL(/companion\/audio\.html$/);
});
