const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-367: the disconnected "background mode" companion. No WebSocket at all —
// every button is one fire-and-forget fetch() POST to TASK-366's
// /api/quick-intent/{action}, reading the device target the full companion
// already persisted (grew-tv-companion-target in localStorage). These tests
// stub that endpoint directly (page.route) rather than the WS fixtures the
// live/connected companion pages use — there is no connection here to fake.

function spyQuickIntent(page) {
  const posts = [];
  page.route('**/api/quick-intent/*', (route) => {
    posts.push({
      action: route.request().url().split('/api/quick-intent/')[1].split('?')[0],
      body: JSON.parse(route.request().postData() || '{}')
    });
    route.fulfill({ status: 204, body: '' });
  });
  return posts;
}

test.describe('a TV already targeted', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('grew-tv-companion-target', 'tv-1');
    });
  });

  test('shows Play/Pause, Next and Previous immediately, no connecting state', async ({ page }) => {
    await page.goto('/companion/quick-pause.html');
    await expect(page.locator('#qp-controls')).toBeVisible();
    await expect(page.locator('#qp-toggle')).toBeVisible();
    await expect(page.locator('#qp-next')).toBeVisible();
    await expect(page.locator('#qp-prev')).toBeVisible();
    await expect(page.locator('#qp-message')).toBeHidden();
    await expect(page.locator('body')).not.toContainText('connecting');
  });

  test('Play/Pause POSTs toggle for the targeted device', async ({ page }) => {
    const posts = spyQuickIntent(page);
    await page.goto('/companion/quick-pause.html');
    await page.locator('#qp-toggle').click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].action).toBe('toggle');
    expect(posts[0].body).toEqual({ device_id: 'tv-1' });
  });

  test('Next and Previous POST their action for the targeted device', async ({ page }) => {
    const posts = spyQuickIntent(page);
    await page.goto('/companion/quick-pause.html');
    await page.locator('#qp-next').click();
    await page.locator('#qp-prev').click();
    await expect.poll(() => posts.length).toBe(2);
    expect(posts.map((p) => p.action)).toEqual(['next', 'previous']);
    expect(posts[1].body).toEqual({ device_id: 'tv-1' });
  });

  test('Reconnect takes you to the full companion', async ({ page }) => {
    await page.goto('/companion/quick-pause.html');
    await page.locator('#qp-reconnect').click();
    await expect(page).toHaveURL(/audio\.html/);
  });
});

test('no TV ever targeted on this phone shows a message, not dead buttons', async ({ page }) => {
  await page.goto('/companion/quick-pause.html');
  await expect(page.locator('#qp-message')).toBeVisible();
  await expect(page.locator('#qp-controls')).toBeHidden();
});

test('the full companion audio player links out to Quick Pause', async ({ page }) => {
  await installApi(page);
  await page.addInitScript(() => {
    localStorage.setItem('grew-tv-companion-target', 'tv-1');
  });
  await page.goto('/companion/audio.html');
  await page.locator('#c-quickpause').click();
  await expect(page).toHaveURL(/quick-pause\.html/);
});
