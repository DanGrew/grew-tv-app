const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// BUG-034 — a chosen volume must survive a fresh page load. Player gain lives on
// the media element's `.volume`; it holds across an in-page src swap but a full
// page nav builds a brand-new <video>/<audio> that defaults to 1.0. core/
// volume-store persists the level; each player re-applies readVolume() on
// construction. Regression: nudge the volume down (companion vol_down intent),
// RELOAD, assert the fresh element re-applies the stored level — not 1.0.
// RED on old code (no store → reload back to full).

const VOL_KEY = 'grew-tv.volume';

// Deliver ONE vol_down intent on the first WS connection only. A reload opens a
// fresh connection, so the `fired` latch keeps the reloaded player from being
// nudged again — the reload must observe ONLY the remembered level.
function fireVolDownOnce(page) {
  let fired = false;
  return page.routeWebSocket(/:8766/, (ws) => {
    ws.onMessage(() => {
      if (fired) return;
      fired = true;
      ws.send(JSON.stringify({ type: 'intent', payload: { intent: 'vol_down' } }));
    });
  });
}

test('video volume persists across a fresh page load (BUG-034)', async ({ page }) => {
  await installApi(page);
  await fireVolDownOnce(page);

  await page.goto('/app/homeview/video.html?video=toy-story-main');
  await expect(page.locator('#screen-video')).toBeVisible();
  // The vol_down intent lowers the element below full and persists it.
  await expect.poll(() => page.locator('#video').evaluate(v => v.volume)).toBeLessThan(1);
  const stored = Number(await page.evaluate(k => localStorage.getItem(k), VOL_KEY));
  expect(stored).toBeLessThan(1);

  await page.reload();
  await expect(page.locator('#screen-video')).toBeVisible();
  // Fresh <video> element re-applies the stored level (old code: back to 1.0).
  await expect.poll(() => page.locator('#video').evaluate(v => v.volume)).toBeCloseTo(stored, 5);
});

test('audio volume persists across a fresh page load (BUG-034)', async ({ page }) => {
  await installApi(page);
  await fireVolDownOnce(page);

  await page.goto('/app/homeview/audio.html?track=ootb-02&from=browse');
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect.poll(() => page.locator('#audio').evaluate(a => a.volume)).toBeLessThan(1);
  const stored = Number(await page.evaluate(k => localStorage.getItem(k), VOL_KEY));
  expect(stored).toBeLessThan(1);

  await page.reload();
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect.poll(() => page.locator('#audio').evaluate(a => a.volume)).toBeCloseTo(stored, 5);
});
