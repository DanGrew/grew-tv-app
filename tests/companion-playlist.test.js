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

// TASK-276: music has no mid-song resume, so a companion playlist track never
// shows a resume-percent badge, even with a saved position. Red on the old code,
// which rendered the .pct badge for a mid-watch track.
test('TASK-276: a part-played playlist track shows no resume badge', async ({ page }) => {
  await installApi(page);
  await page.route('**/api/continue-watching**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', content: [{ item_id: 'ootb-01', position_secs: 100, duration_secs: 227, last_watched: 1000 }] })
  }));
  await mockApp(page, 'pl-roadtrip');
  await page.goto('/companion/playlist.html');
  await expect(page.locator('.ph-txt[data-id="ootb-01"]')).toBeVisible();
  await expect(page.locator('.ph-txt[data-id="ootb-01"] .pct')).toHaveCount(0);
});

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

  // BUG-021: a playlist reached THROUGH a rail (trail top = the browse.html rail
  // entry) showed only the static Home > playlist — the rail crumb was dropped and
  // there was no rail crumb to retrace. It must show the rail and retrace to it.
  test('BUG-021: a playlist reached via the Playlists rail shows the rail crumb and retraces to it', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([
        { page: 'browse.html', params: { tab: 'music', rail: 'playlists' }, label: 'Playlists' }
      ]));
    });
    await page.goto('/companion/playlist.html');
    await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Playlists']);
    const railCrumb = page.locator('#breadcrumb .crumb-link', { hasText: 'Playlists' });
    await expect(railCrumb).toHaveAttribute('data-params', /"rail":"playlists"/);
    await railCrumb.click();
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

  // FEAT-036 (TASK-210) — Rename opens the companion name screen in rename mode,
  // carrying the live playlist id + current name in the query string.
  test('Rename navigates to the name screen in rename mode with the current name', async ({ page }) => {
    await expect(page.locator('#ctx-title')).toHaveText('Road Trip');
    await page.locator('#btn-rename-playlist').click();
    await expect(page).toHaveURL(/companion\/playlist-create\.html\?rename=pl-roadtrip&name=Road%20Trip/);
  });

  // FEAT-036 (TASK-211) — per-track reorder (↑ ↓) + remove (✕), the companion
  // mirror of the TV playlist detail's row controls. Each POSTs BY POSITION (the
  // installApi fixture mutates the playlist clone) then reloads the list.
  function rowOf(page, id) {
    return page.locator('.ph-row', { has: page.locator('.ph-txt[data-id="' + id + '"]') });
  }

  test('reorder/remove controls are edge-gated: first track has no ↑, last no ↓, both have ✕', async ({ page }) => {
    await expect(page.locator('.ph-txt')).toHaveCount(2);
    await expect(rowOf(page, 'ootb-03').locator('.ph-edit.up')).toHaveCount(0);   // first
    await expect(rowOf(page, 'ootb-03').locator('.ph-edit.down')).toHaveCount(1);
    await expect(rowOf(page, 'ootb-01').locator('.ph-edit.down')).toHaveCount(0); // last
    await expect(rowOf(page, 'ootb-01').locator('.ph-edit.up')).toHaveCount(1);
    await expect(rowOf(page, 'ootb-03').locator('.ph-edit.x')).toHaveCount(1);
    await expect(rowOf(page, 'ootb-01').locator('.ph-edit.x')).toHaveCount(1);
  });

  test('moving the first track down reorders the list', async ({ page }) => {
    await expect(page.locator('.ph-txt')).toHaveCount(2);
    await rowOf(page, 'ootb-03').locator('.ph-edit.down').click();
    await expect.poll(async () =>
      page.locator('.ph-txt').evaluateAll(els => els.map(e => e.getAttribute('data-id')))
    ).toEqual(['ootb-01', 'ootb-03']);
  });

  test('removing a track drops it from the list', async ({ page }) => {
    await expect(page.locator('.ph-txt')).toHaveCount(2);
    await rowOf(page, 'ootb-01').locator('.ph-edit.x').click();
    await expect(page.locator('.ph-txt')).toHaveCount(1);
    await expect(page.locator('.ph-txt').first()).toHaveAttribute('data-id', 'ootb-03');
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

// FEAT-038 (DSYNC-2c): opening a playlist while Browsing. The TV is elsewhere
// (context 'browse'), so the page must self-load from ?id via /api/playlist —
// NOT /api/series (the loadSeries(playlistId) 404 the user hit). Editing stays
// live; transport greys; Back is a local hop.
test.describe('desync mode (Browse) — playlist self-load + edit', () => {
  function mockElsewhere(page) {
    let version = 1;
    return page.routeWebSocket(/:8766/, (ws) => {
      function push() {
        version += 1;
        ws.send(msg('context', { version: version, context_id: 'browse' }));
        ws.send(msg('app_state', { screen: 'home', profile: 'kids', person: 'kids' }));
      }
      ws.onMessage(function(raw) {
        const m = JSON.parse(raw);
        if (m.type === 'intent') sentIntents.push(m.payload.intent);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') push();
      });
    });
  }
  test.beforeEach(async ({ page }) => {
    sentIntents = [];
    await installApi(page);
    await mockElsewhere(page);
    await page.addInitScript(() => { sessionStorage.setItem('grew-tv:companion-mode', 'desynced'); });
  });

  test('self-loads from ?id via /api/playlist (no TV echo, no /api/series 404)', async ({ page }) => {
    await page.goto('/companion/playlist.html?id=pl-roadtrip');
    await expect(page.locator('#ctx-title')).toHaveText('Road Trip');
    await expect(page.locator('.ph-txt')).toHaveCount(2);
    await expect(page.locator('body')).toHaveClass(/browsing/);
  });

  test('editing stays live while browsing — remove POSTs and repaints', async ({ page }) => {
    await page.goto('/companion/playlist.html?id=pl-roadtrip');
    await expect(page.locator('.ph-txt')).toHaveCount(2);
    await page.locator('.ph-row', { has: page.locator('.ph-txt[data-id="ootb-01"]') }).locator('.ph-edit.x').click();
    await expect(page.locator('.ph-txt')).toHaveCount(1);
  });

  test('TASK-243: no Back button — the breadcrumb Home is the local hop to browse', async ({ page }) => {
    await page.goto('/companion/playlist.html?id=pl-roadtrip');
    await expect(page.locator('.ph-txt').first()).toBeVisible();
    await expect(page.locator('#btn-back')).toHaveCount(0);
    await page.locator('#breadcrumb .crumb-link').first().click();
    await page.waitForURL('**/companion/browse.html');
    expect(sentIntents.filter((i) => i === 'back')).toHaveLength(0);
  });
});
