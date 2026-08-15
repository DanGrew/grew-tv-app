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
  // Next (FROM SOURCE) holds the rest of the permutation (ootb-02, ootb-03).
  await page.locator('.ph-qtab[data-tab="next"]').click();   // TASK-238: source rows live under the Next tab
  await expect(page.locator('.ph-qname[data-track="ootb-02"]')).toBeVisible();
  // Coming Up (THEN): ordered + repeat off -> end-of-source marker, not rows.
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

// BUG-041 (companion mirror): the ON (`.on`) transport pill must be a solid fill,
// not the old near-transparent surface-hi tint that collapsed into the focus look.
test('BUG-041: the ON (shuffled) pill is a solid fill, distinct from an OFF pill', async ({ page }) => {
  await setup(page);
  const shuffle = page.locator('.ph-tbtn[data-action="toggle-shuffle"]');
  await expect(shuffle).not.toHaveClass(/on/);
  const offBg = await shuffle.evaluate(el => getComputedStyle(el).backgroundColor);
  await shuffle.click();
  await expect(shuffle).toHaveClass(/on/);
  const onBg = await shuffle.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(onBg).toBe('rgb(255, 255, 255)');   // solid --focus fill (fails on the old surface-hi tint)
  expect(onBg).not.toBe(offBg);
});

test('tapping a queue row POSTs play-track — now-playing advances to it', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.ph-np .nm')).toHaveText('Turn to Stone');
  await page.locator('.ph-qtab[data-tab="next"]').click();   // TASK-238: the source track lives under the Next tab
  await page.locator('.ph-qname[data-track="ootb-02"]').click();
  await expect(page.locator('.ph-np .nm')).toHaveText('Mr. Blue Sky');
});

test('back returns to the now-playing companion screen', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-back').click();
  await expect(page).toHaveURL(/companion\/audio\.html$/);
});

// TASK-415 — the popout menu's Switch profile, ported from companion-browse.js.
// The wiring only needs the WS connected (installPlaybackBackend's snapshot loop
// is unrelated), so this records raw intents over a minimal socket instead.
test('Switch profile sends the navigate intent to the picker (BUG-007)', async ({ page }) => {
  const intents = [];
  await installApi(page);
  await page.routeWebSocket(/:8766/, ws => {
    ws.onMessage(raw => {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload);
    });
  });
  await page.goto('/companion/queue.html');
  await page.locator('#btn-status').click();
  await page.locator('#switch-profile').click();
  await expect.poll(() => intents.filter(i => i.intent === 'navigate' && i.params.page === 'profile.html').length).toBeGreaterThan(0);
});

// TASK-417 — the Screen row (mountScreenBar), the one status-menu piece TASK-415
// never reached on this page. Two devices so the bar surfaces its "Pick a
// screen" picker (a lone device auto-targets silently, per companion-screen-bar
// TASK-179 coverage) — picking one re-targets exactly as it does on browse.html.
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
  await page.goto('/companion/queue.html');
  await page.locator('#btn-status').click();
  await expect(page.locator('#screen-bar .screen-btn')).toHaveCount(2);

  await page.locator('#screen-bar .screen-btn[data-id="tv-a"]').click();
  await expect.poll(() => received.filter(m => m.type === 'register_companion').length).toBeGreaterThan(0);
  const reg = received.find(m => m.type === 'register_companion');
  expect(reg.payload.device_id).toBe('tv-a');
});
