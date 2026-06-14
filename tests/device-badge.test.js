const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// TASK-197 (FEAT-026 device plane): the persistent device-colour badge mounts on
// EVERY TV screen via the shared ui/screens/device-badge.js, mirroring the
// companion's mountScreenBar — so a screen's own identity colour stays visible
// beyond the profile picker (TASK-178 painted it on profile.html only). Each page
// must show the badge with its swatch painted from deviceColour(ensureDevice()) —
// a real colour, never blank — and the device label (no API mock: the device id
// comes from ensureDevice() localStorage, the colour is derived). index.html (the
// redirect shell) and error.html are out of scope, matching the companion.
const PAGES = [
  ['profile',      '/app/homeview/profile.html'],
  ['browse',       '/app/homeview/browse.html'],
  ['detail',       '/app/homeview/detail.html?series=bluey'],
  ['album-detail', '/app/homeview/album-detail.html?album=ootb'],
  ['artist',       '/app/homeview/artist.html?artist=ELO'],
  ['rail-grid',    '/app/homeview/rail-grid.html?section=films&rail=genre:animation'],
  ['video',        '/app/homeview/video.html?video=toy-story-main'],
  ['audio',        '/app/homeview/audio.html?track=ootb-01']
];

test.beforeEach(async ({ page }) => {
  await installApi(page);
});

PAGES.forEach(function (entry) {
  test('persistent device badge with a painted swatch on ' + entry[0], async ({ page }) => {
    await page.goto(entry[1]);
    await expect(page.locator('#device-badge')).toBeVisible();
    // Swatch background is the device_id-derived colour — a real rgb, not blank.
    const bg = await page.locator('#device-swatch').evaluate(function (el) {
      return getComputedStyle(el).backgroundColor;
    });
    expect(bg).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    // Generic 'Screen · {short-id}' label stands in when none is set.
    await expect(page.locator('#device-name')).toContainText('Screen');
  });
});
