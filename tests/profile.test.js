const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.goto('/app/homeview/profile.html');
  await expect(page.locator('#screen-profile')).toBeVisible();
});

test('shows photo cards for Kids and Adults with names', async ({ page }) => {
  await expect(page.locator('.profile-card')).toHaveCount(2);
  await expect(page.locator('#btn-kids .profile-name')).toHaveText('Kids');
  await expect(page.locator('#btn-adults .profile-name')).toHaveText('Adults');
});

test('shows this screen colour identity swatch + label on load (TASK-178/197)', async ({ page }) => {
  await expect(page.locator('#device-badge')).toBeVisible();
  // Swatch is painted from the device_id-derived colour (a real rgb, not blank).
  const bg = await page.locator('#device-swatch').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  // Falls back to the generic 'Screen · {short-id}' label when none is set.
  await expect(page.locator('#device-name')).toContainText('Screen');
});

test('only the Adults card has a lock badge', async ({ page }) => {
  await expect(page.locator('#btn-adults .lock-badge')).toBeVisible();
  await expect(page.locator('#btn-kids .lock-badge')).toHaveCount(0);
});

test('missing photo falls back to an emoji placeholder', async ({ page }) => {
  await expect(page.locator('#btn-kids .profile-photo-ph')).toBeVisible();
  await expect(page.locator('#btn-kids .profile-photo-img')).toBeHidden();
});

test('renders the per-person config.json emoji on the placeholder (FEAT-033)', async ({ page }) => {
  // kids has emoji '🦖' in config; adults has none -> class default.
  await expect(page.locator('#btn-kids .profile-photo-ph')).toHaveText('🦖');
  await expect(page.locator('#btn-adults .profile-photo-ph')).toHaveText('🧑');
});

test('Kids opens straight to browse with no PIN prompt', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('Adults click reveals the PIN keypad, focused on the first key', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/active/);
  await expect(page.locator('.key')).toHaveCount(12);
  await expect(page.locator('.key[data-key="1"]')).toBeFocused();
});

test('wrong PIN shakes, clears the dots, and stays on the profile screen', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await page.locator('.key[data-key="9"]').click();
  await page.locator('.key[data-key="9"]').click();
  await page.locator('.key[data-key="9"]').click();
  await page.locator('.key[data-key="9"]').click();
  await expect(page.locator('#screen-profile')).toBeVisible();
  await expect(page.locator('#pin-panel')).toHaveClass(/active/);
  await expect(page.locator('.pin-dots span.on')).toHaveCount(0);
});

test('backspace key (⌫) removes the last entered digit', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await page.locator('.key[data-key="1"]').click();
  await page.locator('.key[data-key="2"]').click();
  await expect(page.locator('.pin-dots span.on')).toHaveCount(2);
  await page.locator('.key[data-key="back"]').click();
  await expect(page.locator('.pin-dots span.on')).toHaveCount(1);
});

test('keypad is d-pad navigable', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await expect(page.locator('.key[data-key="1"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.key[data-key="2"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.key[data-key="5"]')).toBeFocused();
});

test('Enter on a focused key enters its digit', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await expect(page.locator('.key[data-key="1"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pin-dots span.on')).toHaveCount(1);
});

test('correct PIN entered by d-pad unlocks Adults', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await page.locator('.key[data-key="1"]').click();
  await page.locator('.key[data-key="2"]').click();
  await page.locator('.key[data-key="3"]').click();
  await page.locator('.key[data-key="4"]').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('Escape closes the keypad and returns focus to the Adults card', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pin-panel')).not.toHaveClass(/active/);
  await expect(page.locator('#btn-adults')).toBeFocused();
});

// Two-row picker: kids row on top, adults row below. Left/Right walk a row;
// Up/Down change rows. Default fixture has one kid + one adult, one per row.
test('cards are grouped into a kids row and an adults row', async ({ page }) => {
  await expect(page.locator('.profile-row')).toHaveCount(2);
  await expect(page.locator('.profile-row').first().locator('.profile-card')).toHaveCount(1);
  await expect(page.locator('.profile-row').first().locator('#btn-kids')).toBeVisible();
  await expect(page.locator('.profile-row').last().locator('#btn-adults')).toBeVisible();
});

test('d-pad Up/Down move focus between the kids and adults rows', async ({ page }) => {
  await expect(page.locator('#btn-kids')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-adults')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#btn-kids')).toBeFocused();
});

test('d-pad Left/Right walk within a row of several persons', async ({ page }) => {
  await page.route('**/media/config.json', function(route) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      defaultPin: '1234',
      persons: [
        { id: 'oliver', name: 'Oliver', profile: 'kids', photo: null },
        { id: 'millie', name: 'Millie', profile: 'kids', photo: null },
        { id: 'mom', name: 'Mom', profile: 'adults', photo: null }
      ]
    }) });
  });
  await page.reload();
  await expect(page.locator('#btn-oliver')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-millie')).toBeFocused();
  // Down jumps to the adults row (single card)
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#btn-mom')).toBeFocused();
});

// ── FEAT-026 TASK-156: the generalized person model (N persons, ids distinct
// from the display name + content class, per-person PIN, active-person state).
function configRoute(page, config) {
  return page.route('**/media/config.json', function(route) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
  });
}

const ROSTER = {
  defaultPin: '1234',
  persons: [
    { id: 'oliver', name: 'Oliver', profile: 'kids',   photo: null },
    { id: 'millie', name: 'Millie', profile: 'kids',   photo: null },
    { id: 'mom',    name: 'Mom',    profile: 'adults', photo: null, pin: '4321' }
  ]
};

test('renders one card per configured person, ids distinct from names', async ({ page }) => {
  await configRoute(page, ROSTER);
  await page.reload();
  await expect(page.locator('.profile-card')).toHaveCount(3);
  await expect(page.locator('#btn-oliver .profile-name')).toHaveText('Oliver');
  await expect(page.locator('#btn-millie .profile-name')).toHaveText('Millie');
  await expect(page.locator('#btn-mom .profile-name')).toHaveText('Mom');
});

test('picking a kid person needs no PIN and sets the active person', async ({ page }) => {
  await configRoute(page, ROSTER);
  await page.reload();
  await page.locator('#btn-millie').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('grew-tv-person'))).toBe('millie');
  expect(await page.evaluate(() => localStorage.getItem('grew-tv-profile'))).toBe('kids');
});

test('only adult persons carry a lock badge', async ({ page }) => {
  await configRoute(page, ROSTER);
  await page.reload();
  await expect(page.locator('#btn-mom .lock-badge')).toBeVisible();
  await expect(page.locator('#btn-oliver .lock-badge')).toHaveCount(0);
  await expect(page.locator('#btn-millie .lock-badge')).toHaveCount(0);
});

test("an adult person's own PIN gates it (default PIN is rejected)", async ({ page }) => {
  await configRoute(page, ROSTER);
  await page.reload();
  await page.locator('#btn-mom').click();
  // wrong (the default 1234) — Mom overrides it with 4321
  await '1234'.split('').reduce(function(p, d) {
    return p.then(function() { return page.locator('.key[data-key="' + d + '"]').click(); });
  }, Promise.resolve());
  await expect(page.locator('#screen-profile')).toBeVisible();
  await expect(page.locator('.pin-dots span.on')).toHaveCount(0);
  // correct — Mom's own PIN unlocks + sets the active person
  await '4321'.split('').reduce(function(p, d) {
    return p.then(function() { return page.locator('.key[data-key="' + d + '"]').click(); });
  }, Promise.resolve());
  await expect(page.locator('#screen-browse')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('grew-tv-person'))).toBe('mom');
  expect(await page.evaluate(() => localStorage.getItem('grew-tv-profile'))).toBe('adults');
});

test("the active person's content class filters browse", async ({ page }) => {
  await configRoute(page, ROSTER);
  await page.reload();
  await page.locator('#btn-oliver').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  // kids browse (Series landing) holds the kids Bluey rail, never the
  // adults-only Dark Knight — the active person's class drove /api/browse.
  await expect(page.locator('.film-tile[data-id="bluey"]')).toHaveCount(1);
  await expect(page.locator('[data-id="dark-knight-main"]')).toHaveCount(0);
});

test('absent config falls back to generic placeholder persons and still boots', async ({ page }) => {
  await page.route('**/media/config.json', function(route) {
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.reload();
  await expect(page.locator('.profile-card')).toHaveCount(2);
  await page.locator('#btn-child').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

// ── FEAT-026 TASK-158: the picker is the activation gate. Picking a person
// asks the backend to lock that person to THIS device; the server verdict
// (person_active / person_busy) drives navigation + the take-over prompt. A
// routed WebSocket stands in for the media-manager so the verdict is scripted.
function activeRoute(page) {
  return page.routeWebSocket(/8766/, function(ws) {
    ws.onMessage(function(message) {
      var msg = JSON.parse(message);
      [msg].filter(function(m) { return m.type === 'activate_person'; }).forEach(function(m) {
        ws.send(JSON.stringify({ type: 'person_active', payload: { person_id: m.payload.person_id, device_id: m.payload.device_id } }));
      });
    });
  });
}

function busyRoute(page) {
  return page.routeWebSocket(/8766/, function(ws) {
    ws.onMessage(function(message) {
      var msg = JSON.parse(message);
      [msg].filter(function(m) { return m.type === 'activate_person'; }).forEach(function(m) {
        var ok = { type: 'person_active', payload: { person_id: m.payload.person_id, device_id: m.payload.device_id } };
        var busy = { type: 'person_busy', payload: { person_id: m.payload.person_id, device_id: 'devB', label: 'Bedroom' } };
        ws.send(JSON.stringify(m.payload.takeover ? ok : busy));
      });
    });
  });
}

test('person_active from the server proceeds straight to browse', async ({ page }) => {
  await activeRoute(page);
  await configRoute(page, ROSTER);
  await page.reload();
  await page.locator('#btn-millie').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('grew-tv-person'))).toBe('millie');
});

test('a person live on another screen prompts to take over, then proceeds', async ({ page }) => {
  await busyRoute(page);
  await configRoute(page, ROSTER);
  await page.reload();
  await page.locator('#btn-oliver').click();
  await expect(page.locator('#takeover-panel')).toHaveClass(/active/);
  await expect(page.locator('#takeover-msg')).toContainText('Bedroom');
  // Confirm → resend with takeover:true → server acks person_active → browse.
  await page.locator('#takeover-confirm').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('cancelling the take-over prompt stays on the picker', async ({ page }) => {
  await busyRoute(page);
  await configRoute(page, ROSTER);
  await page.reload();
  await page.locator('#btn-oliver').click();
  await expect(page.locator('#takeover-panel')).toHaveClass(/active/);
  await page.locator('#takeover-cancel').click();
  await expect(page.locator('#takeover-panel')).not.toHaveClass(/active/);
  await expect(page.locator('#screen-profile')).toBeVisible();
  await expect(page.locator('#screen-browse')).toHaveCount(0);
});
