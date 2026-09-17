const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-568 — Night Mode on the TV player. One control, three levels, live over
// whatever is playing: the file on disk is never touched and no endpoint is
// called, so everything asserted here is the pill's own label, the audio path,
// and the intent rail the phone drives it over.
//
// The compression itself is not assertable from Playwright — there is no
// readable signal for "the bangs came down", and the numbers are the trial's to
// tune anyway (see the spec). What IS assertable, and what would actually
// break, is the cycle, the label, the per-page-load reset, that Off leaves the
// audio path alone, and that the volume still works underneath a level.
//
// Controls auto-hide 3s after the last input and a blur can disarm a focused
// control (BUG-019), so the tests that click the pill kick the timer with a
// d-pad key first, as tests/player-reset.test.js does.

const FILM = 'toy-story-main';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'film');
  await page.goto('/app/homeview/profile.html');
});

async function openFilm(page) {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  // The real post-load settle signal: the src landing proves playVideo ran.
  await expect(page.locator('#video')).toHaveAttribute('src', /toy-story-main\.mp4/);
  await page.locator('#screen-video').click();
  await page.keyboard.press('ArrowDown');
}

test('the player shows a Night Mode control, reading Off', async ({ page }) => {
  await openFilm(page);
  await expect(page.locator('#btn-night')).toBeVisible();
  await expect(page.locator('#btn-night')).toHaveText('Night: Off');
});

test('pressing it cycles Off -> Soft -> Strong -> Off', async ({ page }) => {
  await openFilm(page);
  const night = page.locator('#btn-night');
  await night.click();
  await expect(night).toHaveText('Night: Soft');
  await night.click();
  await expect(night).toHaveText('Night: Strong');
  await night.click();
  await expect(night).toHaveText('Night: Off');
});

test('starting another film in the same sitting comes back at Off', async ({ page }) => {
  await openFilm(page);
  await page.locator('#btn-night').click();
  await expect(page.locator('#btn-night')).toHaveText('Night: Soft');
  // Leaving the player is a page navigation and selecting a film is a fresh page
  // load, which is exactly why the level resets — the owner's call for the
  // trial: one level for the whole TV, held only for the current player page.
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(`.film-tile[data-id="${FILM}"]`).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-night')).toHaveText('Night: Off');
});

test('Off never touches the audio path — no AudioContext until the first press', async ({ page }) => {
  await page.addInitScript(() => {
    window.__ctxCount = 0;
    const Real = window.AudioContext;
    window.AudioContext = function() { window.__ctxCount += 1; return new Real(); };
  });
  await openFilm(page);
  expect(await page.evaluate(() => window.__ctxCount)).toBe(0);
  await page.locator('#btn-night').click();
  await expect(page.locator('#btn-night')).toHaveText('Night: Soft');
  expect(await page.evaluate(() => window.__ctxCount)).toBe(1);
  // Cycling back to Off is a BYPASS, not a teardown and not a second context:
  // wiring an element into Web Audio is one-way for its life, which is why Off
  // routes around the compressor rather than unplugging the graph.
  await page.locator('#btn-night').click();
  await page.locator('#btn-night').click();
  await expect(page.locator('#btn-night')).toHaveText('Night: Off');
  expect(await page.evaluate(() => window.__ctxCount)).toBe(1);
});

// TASK-600 — ☰ (the handset's Context button, `c`) is a shortcut to the pill: the
// same cycle a click gives, from the couch, with no d-pad walk. It lives in the
// player's playing-state key table, so every overlay that owns the keys — Jump,
// the Queue, the ＋ Playlist sheet — swallows it rather than letting it reach
// through and change the sound behind.
test('☰ brings the controls up and cycles Off -> Soft -> Strong -> Off', async ({ page }) => {
  await openFilm(page);
  await page.evaluate(() => document.getElementById('controls').classList.add('hidden'));
  const night = page.locator('#btn-night');
  await page.keyboard.press('c');
  await expect(page.locator('#controls')).toBeVisible();
  await expect(night).toHaveText('Night: Soft');
  await page.keyboard.press('c');
  await expect(night).toHaveText('Night: Strong');
  await page.keyboard.press('c');
  await expect(night).toHaveText('Night: Off');
});

test('☰ leaves focus where it was rather than jumping to the pill', async ({ page }) => {
  await openFilm(page);
  await page.evaluate(() => document.getElementById('btn-play-pause').focus());
  await page.keyboard.press('c');
  await expect(page.locator('#btn-night')).toHaveText('Night: Soft');
  await expect(page.locator('#btn-play-pause')).toBeFocused();
});

test('☰ does nothing behind the open Jump grid', async ({ page }) => {
  await openFilm(page);
  await page.locator('#btn-jump').click();
  await expect(page.locator('.jump-popup')).toBeVisible();
  await page.keyboard.press('c');
  await expect(page.locator('.jump-popup')).toBeVisible();
  await expect(page.locator('#btn-night')).toHaveText('Night: Off');
});

test('☰ does nothing behind the open Queue', async ({ page }) => {
  await openFilm(page);
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  await page.keyboard.press('c');
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  await expect(page.locator('#btn-night')).toHaveText('Night: Off');
});

// Night Mode is the video player's alone — the music player has no pill and no
// compressor, so ☰ is not claimed there and a press changes nothing on screen.
test('☰ on the music player does nothing', async ({ page }) => {
  await page.goto('/app/homeview/audio.html?track=ootb-02&from=browse');
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#btn-night')).toHaveCount(0);
  const focusedBefore = await page.evaluate(() => document.activeElement.id);
  await page.keyboard.press('c');
  expect(await page.evaluate(() => document.activeElement.id)).toBe(focusedBefore);
  await expect(page).toHaveURL(/audio\.html\?track=ootb-02/);
});

// The phone reads its Night label off the app_state snapshot the player emits on
// every change (TASK-568), so a ☰ press has to reach the phone the way a pill
// click does — captured here as what the TV actually sent.
test('a ☰ press tells the phone the new level', async ({ page }) => {
  const sent = [];
  await page.routeWebSocket(/:8766/, (ws) => {
    ws.onMessage((raw) => { sent.push(JSON.parse(raw)); });
  });
  await page.goto('/app/homeview/video.html?video=' + FILM);
  await expect(page.locator('#screen-video')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('c');
  await expect(page.locator('#btn-night')).toHaveText('Night: Soft');
  await expect.poll(() => sent.filter(m => m.type === 'app_state').map(m => m.payload.nightMode)).toContain('soft');
});

// The phone half of the same control. This test registers its own WS route,
// which replaces the queue hub's (Playwright matches most-recent-first) —
// deliberately: it drives the intent rail and needs no engine, and the pill is
// wired at player setup rather than when a film's src lands. Same shape as
// tests/volume-persist.test.js: deliver on the FIRST client message only, in
// order, so a reconnect can't fire them twice.
function deliverIntentsOnce(page, intents) {
  let fired = false;
  return page.routeWebSocket(/:8766/, (ws) => {
    ws.onMessage(() => {
      if (fired) return;
      fired = true;
      intents.forEach(i => ws.send(JSON.stringify({ type: 'intent', payload: { intent: i } })));
    });
  });
}

test('the phone\'s press changes the level, and the volume still works under it', async ({ page }) => {
  // The companion's Night Mode press arrives as the `nightMode` intent, the same
  // rail captions and volume already ride (story 2); the vol_down behind it is
  // story 4 — the level stays put and the volume moves as it always has, since
  // element gain still applies ahead of the Web Audio graph.
  await deliverIntentsOnce(page, ['nightMode', 'vol_down']);
  await page.goto('/app/homeview/video.html?video=' + FILM);
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-night')).toHaveText('Night: Soft');
  await expect.poll(() => page.locator('#video').evaluate(v => v.volume)).toBeLessThan(1);
  await expect(page.locator('#btn-night')).toHaveText('Night: Soft');
});
