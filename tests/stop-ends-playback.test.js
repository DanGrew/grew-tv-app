const { test, expect } = require('@playwright/test');
const {
  installApi,
  installQueuePlaybackBackend,
  CHANNEL_ON_AIR: ON_AIR,
  CHANNEL_DETAIL: DETAIL
} = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-599 — the couch remote's ⏹ Stop ends what is playing and goes back to
// where it was started from, exactly as Home already does on a player.
//
// Stop is an HID consumer-control code that never reaches the page as a key,
// so no test can press it. What a test CAN do is what Chrome does on the press:
// call the Media Session's registered `stop` handler. The init script records
// every handler the page registers (still passing it on to the real session),
// and `pressStop` invokes the one on file — on a timer, because the handler
// navigates and would otherwise tear down the evaluate that called it.
async function recordMediaSession(page) {
  await page.addInitScript(() => {
    window.__session = {};
    const session = navigator.mediaSession;
    const real = session.setActionHandler.bind(session);
    session.setActionHandler = function(action, handler) {
      window.__session[action] = handler;
      real(action, handler);
    };
  });
}

async function pressStop(page) {
  await page.evaluate(() => { setTimeout(() => window.__session.stop({ action: 'stop' }), 0); });
}

function stopHandler(page) {
  return page.evaluate(() => typeof window.__session.stop);
}

test.beforeEach(async ({ page }) => {
  await recordMediaSession(page);
  await installApi(page);
});

async function openFilm(page) {
  await installQueuePlaybackBackend(page, 'series');
  await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
}

async function openAlbum(page) {
  const backend = await installQueuePlaybackBackend(page, 'music');
  backend.seed('play-source', { source_type: 'album', source_id: 'ootb' });
  await page.goto('/app/homeview/audio.html?album=ootb&track=ootb-01&from=detail-album');
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
}

// Story 1 — a film stops and lands where it was started from.
test('Stop on a playing film goes back to where it was started', async ({ page }) => {
  await openFilm(page);
  await pressStop(page);
  await expect(page).toHaveURL(/detail\.html\?.*series=bluey/);
});

// Story 2 — music the same.
test('Stop on playing music goes back to where it was started', async ({ page }) => {
  await openAlbum(page);
  await pressStop(page);
  await expect(page).toHaveURL(/album-detail\.html\?.*album=ootb/);
});

// Story 3 — a channel leaves for the Channels tab it was tuned in from.
test('Stop on a channel goes back to where it was tuned in from', async ({ page }) => {
  await page.route('**/api/channels**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ channels: [ON_AIR] })
  }));
  await page.route('**/api/channels/*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(DETAIL)
  }));
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.goto('/app/homeview/video.html?channel=cartoon-club');
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e22/);
  await pressStop(page);
  await expect(page).toHaveURL(/browse\.html\?.*tab=channels/);
});

// Story 4 — the Queue open over a film does not survive the Stop.
test('Stop with the Queue open over a film ends playback and leaves', async ({ page }) => {
  await openFilm(page);
  await page.locator('#screen-video').click();
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  await pressStop(page);
  await expect(page).toHaveURL(/detail\.html\?.*series=bluey/);
});

// Story 4, over music.
test('Stop with the Queue open over music ends playback and leaves', async ({ page }) => {
  await openAlbum(page);
  await page.keyboard.press('ArrowDown');
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  await pressStop(page);
  await expect(page).toHaveURL(/album-detail\.html\?.*album=ootb/);
});

// Story 5 — paused still stops.
test('Stop on a paused film still goes back', async ({ page }) => {
  await openFilm(page);
  await page.evaluate(() => document.getElementById('video').pause());
  await expect(page.locator('#video')).toHaveJSProperty('paused', true);
  await pressStop(page);
  await expect(page).toHaveURL(/detail\.html\?.*series=bluey/);
});

// Story 6 — nothing playing, nothing to stop: browse never claims the button.
test('Stop does nothing on Browse', async ({ page }) => {
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  expect(await stopHandler(page)).toBe('undefined');
});

// Story 6 — a player lets go of Stop the moment playback stops, so the button
// is never left pointing at a player that has finished. The handler is read
// before the navigation lands, which is the one window it could outlive its page.
test('a player releases Stop when playback stops', async ({ page }) => {
  await openFilm(page);
  expect(await stopHandler(page)).toBe('function');
  const cleared = await page.evaluate(() => {
    window.__session.stop({ action: 'stop' });
    return window.__session.stop;
  });
  expect(cleared).toBeNull();
});

// Story 7 — Play/Pause stays the browser's: only `stop` is ever registered, so
// Chrome's own default Play/Pause handling is never taken over.
test('claiming Stop leaves Play/Pause to the browser', async ({ page }) => {
  await openFilm(page);
  expect(await page.evaluate(() => Object.keys(window.__session))).toEqual(['stop']);
});

test('claiming Stop on music leaves Play/Pause to the browser', async ({ page }) => {
  await openAlbum(page);
  expect(await page.evaluate(() => Object.keys(window.__session))).toEqual(['stop']);
});
