const { test, expect } = require('@playwright/test');

// FEAT-026: the companion person picker is the activation gate for the screen it
// drives. Picking a person locks that person to the targeted screen and gates on
// the backend verdict — and crucially the take-over prompt for a person already
// live elsewhere must surface HERE on the companion (the device the user is
// holding), not only on the TV. Regression for "the take-over button only
// appeared on the app, not the companion": the companion never handled the
// person_busy verdict, so the prompt fired on the TV the user wasn't looking at.
// The app/TV is mocked over the WS so the verdict is scripted.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

const ROSTER = {
  defaultPin: '1234',
  persons: [
    { id: 'oliver', name: 'Oliver', profile: 'kids',   photo: null, emoji: '🦖' },
    { id: 'mom',    name: 'Mom',    profile: 'adults', photo: null, pin: '4321' }
  ]
};

function configRoute(page) {
  return page.route('**/media/config.json', function(route) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROSTER) });
  });
}

// Mock app/TV. Auto-targets the sole screen, replays a `profile` context so the
// picker renders, and scripts the verdict: a fresh pick is person_busy (the
// person is live on another screen) unless it carries takeover:true, which acks
// person_active. Records every message the companion emits for wire assertions.
function mockApp(page, sent) {
  return page.routeWebSocket(/:8766/, function(ws) {
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      sent.push(m);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') ws.send(msg('snapshot', { version: 1, context_id: 'profile' }));
      if (m.type === 'activate_person') {
        const ok = { type: 'person_active', payload: { person_id: m.payload.person_id, device_id: m.payload.device_id } };
        const busy = { type: 'person_busy', payload: { person_id: m.payload.person_id, device_id: 'devB', label: 'Bedroom' } };
        ws.send(JSON.stringify(m.payload.takeover ? ok : busy));
      }
    });
  });
}

let sent;

test.beforeEach(async ({ page }) => {
  sent = [];
  await configRoute(page);
  await mockApp(page, sent);
  await page.goto('/companion/profile.html');
  await expect(page.locator('.cmp-card[data-id="oliver"]')).toBeVisible();
});

// Mirror of the app two-row grouping: kids cards on one row, adults on another.
test('groups the cards into a kids row and an adults row', async ({ page }) => {
  await expect(page.locator('.cmp-cards')).toHaveCount(2);
  await expect(page.locator('.cmp-cards').first().locator('.cmp-card[data-id="oliver"]')).toBeVisible();
  await expect(page.locator('.cmp-cards').last().locator('.cmp-card[data-id="mom"]')).toBeVisible();
});

// Mirror invariant: the companion renders the same per-person config.json emoji
// as the TV card (FEAT-033 TASK-192).
test('renders the per-person config.json emoji on the companion placeholder', async ({ page }) => {
  await expect(page.locator('.cmp-card[data-id="oliver"] .cmp-photo-ph')).toHaveText('🦖');
  await expect(page.locator('.cmp-card[data-id="mom"] .cmp-photo-ph')).toHaveText('🧑');
});

test('picking a person activates it on the targeted screen FIRST (gated), not a bare setProfile', async ({ page }) => {
  await page.locator('.cmp-card[data-id="oliver"]').click();
  await expect.poll(() => sent.filter(function(m) { return m.type === 'activate_person'; }).length).toBeGreaterThan(0);
  const act = sent.find(function(m) { return m.type === 'activate_person'; });
  expect(act.payload.device_id).toBe('tv');
  expect(act.payload.person_id).toBe('oliver');
  expect(act.payload.takeover).toBe(false);
});

test('a person live on another screen raises the take-over prompt ON THE COMPANION', async ({ page }) => {
  await page.locator('.cmp-card[data-id="oliver"]').click();
  await expect(page.locator('#takeover-overlay')).toHaveClass(/active/);
  await expect(page.locator('#takeover-msg')).toContainText('Bedroom');
});

test('confirming the take-over resends activate_person with takeover:true', async ({ page }) => {
  await page.locator('.cmp-card[data-id="oliver"]').click();
  await expect(page.locator('#takeover-overlay')).toHaveClass(/active/);
  await page.locator('#takeover-confirm').click();
  await expect.poll(() => sent.filter(function(m) { return m.type === 'activate_person' && m.payload.takeover === true; }).length).toBeGreaterThan(0);
  await expect(page.locator('#takeover-overlay')).not.toHaveClass(/active/);
});

test('cancelling the take-over hides the prompt and stays on the picker', async ({ page }) => {
  await page.locator('.cmp-card[data-id="oliver"]').click();
  await expect(page.locator('#takeover-overlay')).toHaveClass(/active/);
  await page.locator('#takeover-cancel').click();
  await expect(page.locator('#takeover-overlay')).not.toHaveClass(/active/);
  await expect(page.locator('.cmp-card[data-id="oliver"]')).toBeVisible();
});
