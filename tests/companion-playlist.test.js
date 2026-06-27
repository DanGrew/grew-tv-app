const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

// FEAT-036 (TASK-205) — the companion playlist context: mirrors the TV's playlist
// detail (its flat track list). The TV's screen-playlist-detail-page pushes
// context_id:'playlist'; with no twin the companion would land on the series
// detail and loadSeries(playlistId) 404s. Tracks are backend state
// (/api/playlist, installApi fixtures: pl-roadtrip = a 2-track cross-album mix in
// stored order, pl-empty = a valid empty playlist). The app side is mocked over
// the WS; the mock echoes intents back as fresh context — exactly the
// app<->companion teleport contract. Header Play/Shuffle drive the TV, not the
// companion, so the mock records the intents to assert them.

function msg(type, payload) { return JSON.stringify({ type, payload }); }

let sentIntents;

function mockApp(page, playlistId) {
  let version = 1;
  let ctx = 'playlist';
  const st = { screen: 'playlist', itemId: playlistId, profile: 'kids', person: 'kids' };
  return page.routeWebSocket(/:8766/, (ws) => {
    function pushState() { ws.send(msg('app_state', st)); }
    function pushCtx() {
      version += 1;
      ws.send(msg('context', { version: version, context_id: ctx, playlist: st.itemId }));
      pushState();
    }
    ws.onMessage(function(raw) {
      const m = JSON.parse(raw);
      if (m.type === 'intent') sentIntents.push(m.payload.intent);
      if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
      if (m.type === 'snapshot_request') pushCtx();
      // a track tap teleports the TV to the player; the app echoes its 'audio' context.
      if (m.type === 'intent' && m.payload.intent === 'play') { ctx = 'audio'; pushCtx(); }
      // a breadcrumb tap teleports the TV; the app echoes the target screen's context.
      if (m.type === 'intent' && m.payload.intent === 'navigate') { ctx = m.payload.params.page.replace('.html', ''); pushCtx(); }
      // delete drives the TV off the gone playlist (`back` -> browse); the companion
      // then navigates itself to browse, where this echoed context keeps it put.
      if (m.type === 'intent' && m.payload.intent === 'back') { ctx = 'browse'; }
    });
  });
}

test.describe('Road Trip playlist (2 tracks)', () => {
  test.beforeEach(async ({ page }) => {
    sentIntents = [];
    await installApi(page);
    await mockApp(page, 'pl-roadtrip');
    await page.goto('/companion/playlist.html');
  });

  test('renders the playlist name and label from the live context', async ({ page }) => {
    await expect(page.locator('#ctx-label')).toHaveText('Playlist');
    await expect(page.locator('#ctx-title')).toHaveText('Road Trip');
  });

  test('lists the playlist tracks in stored cross-album order (not re-sorted)', async ({ page }) => {
    await expect(page.locator('.ph-txt')).toHaveCount(2);
    const ids = await page.locator('.ph-txt').evaluateAll(els => els.map(e => e.getAttribute('data-id')));
    expect(ids).toEqual(['ootb-03', 'ootb-01']);
    await expect(page.locator('.ph-txt[data-id="ootb-03"] .nm')).toHaveText('Sweet Talkin Woman');
    await expect(page.locator('.ph-txt[data-id="ootb-01"] .nm')).toHaveText('Turn to Stone');
  });

  test('tapping a track plays it — sends the play intent and follows the TV to the player', async ({ page }) => {
    await page.locator('.ph-txt[data-id="ootb-01"]').click();
    await expect.poll(() => sentIntents).toContain('play');
    await expect(page).toHaveURL(/companion\/audio\.html$/);
  });

  test('the breadcrumb Home crumb teleports the TV back to browse', async ({ page }) => {
    await expect(page.locator('#breadcrumb .crumb-link')).toHaveCount(1);
    await page.locator('#breadcrumb .crumb-link').first().click();
    await expect(page).toHaveURL(/companion\/browse\.html$/);
  });

  test('Play header sends the play_next intent — drives the TV into the playlist player', async ({ page }) => {
    await page.locator('#btn-play').click();
    await expect.poll(() => sentIntents).toContain('play_next');
  });

  test('Shuffle header sends the shuffle intent', async ({ page }) => {
    await page.locator('#btn-shuffle').click();
    await expect.poll(() => sentIntents).toContain('shuffle');
  });

  // FEAT-036 (TASK-209) — delete-with-confirm, the companion mirror of the TV's
  // screen-playlist-detail-page delete. Confirm POSTs /api/playlists/delete (the
  // installApi fixture answers 204), drives the TV off the gone playlist (`back`),
  // and returns the companion to its playlists list.
  test('Delete confirms with the playlist name, then deletes and returns to the playlists list', async ({ page }) => {
    await expect(page.locator('#ctx-title')).toHaveText('Road Trip');
    await page.locator('#btn-delete-playlist').click();
    await expect(page.locator('#confirm-delete')).toBeVisible();
    await expect(page.locator('#confirm-delete-name')).toHaveText('Road Trip');
    await page.locator('#btn-confirm-delete').click();
    await expect.poll(() => sentIntents).toContain('back');
    await expect(page).toHaveURL(/companion\/browse\.html$/);
  });

  test('Cancel on the delete confirm keeps the playlist and closes the dialog', async ({ page }) => {
    await expect(page.locator('#ctx-title')).toHaveText('Road Trip');
    await page.locator('#btn-delete-playlist').click();
    await expect(page.locator('#confirm-delete')).toBeVisible();
    await page.locator('#btn-cancel-delete').click();
    await expect(page.locator('#confirm-delete')).toBeHidden();
    await expect(page).toHaveURL(/companion\/playlist\.html$/);
  });
});

test.describe('Empty playlist (still lists + opens)', () => {
  test.beforeEach(async ({ page }) => {
    sentIntents = [];
    await installApi(page);
    await mockApp(page, 'pl-empty');
    await page.goto('/companion/playlist.html');
  });

  test('opens to the playlist with no tracks', async ({ page }) => {
    await expect(page.locator('#ctx-title')).toHaveText('Empty Mix');
    await expect(page.locator('.ph-txt')).toHaveCount(0);
    await expect(page.locator('.no-actions')).toHaveText('No tracks');
  });
});
