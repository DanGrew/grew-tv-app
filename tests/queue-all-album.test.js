const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, VIDEOS, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// TASK-362 — "Queue all album". The album header's "＋ Add all to playlist" sheet
// gains a TOP option, "☰ Queue all album": one POST (queue-source) puts every track
// on the album at the FRONT of Play Next, in album order, so the queue can never
// half-populate. It fills the one sheet in the app that had no queue option — the
// per-track ＋ sheet keeps its "☰ Play Next" (one track) unchanged. Both surfaces
// ship it: the TV album page and the companion album detail (mirror invariant).

function msg(type, payload) { return JSON.stringify({ type, payload }); }

// ============================ TV (app) ======================================
test.describe('TV album detail', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await installPlaybackBackend(page);
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS) })
    }));
    await page.goto('/app/homeview/profile.html');
  });

  // Wait for the rows before interacting: the header buttons are wired during the
  // async album load, so a click on #btn-add-all before that is a silent no-op and
  // the sheet never opens (BUG-019).
  async function openAlbum(page) {
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
    await page.locator('.sidebar-tab[data-tab="music"]').click();
    await page.locator('.film-tile[data-id="ootb"]').click();
    await expect(page).toHaveURL(/album-detail\.html/);
    await expect(page.locator('.detail-row')).toHaveCount(3);
  }

  async function queueAllAlbum(page) {
    await page.locator('#btn-add-all').click();
    await expect(page.locator('#add-sheet')).toBeVisible();
    await page.locator('#add-sheet-list .add-queue').click();
  }

  // Story 1
  test('the Add all sheet\'s top option is ☰ Queue all album, above the playlist cards', async ({ page }) => {
    await openAlbum(page);
    await page.locator('#btn-add-all').click();
    await expect(page.locator('#add-sheet')).toBeVisible();
    await expect(page.locator('#add-sheet-list > *').first()).toHaveClass(/add-queue/);
    await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Queue all album');
    await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ Road Trip', '♪ Empty Mix']);
  });

  // Story 2
  test('Queue all album POSTs ONE queue-source for the album, toasts the count, and closes', async ({ page }) => {
    await openAlbum(page);
    const posts = [];
    page.on('request', req => {
      [req].filter(r => r.url().includes('/api/playback/queue-source')).forEach(r => posts.push(r));
    });
    const queued = page.waitForRequest(req =>
      req.url().includes('/api/playback/queue-source') && req.method() === 'POST');
    await queueAllAlbum(page);
    const req = await queued;
    expect(req.url()).toContain('person=kids');
    expect(JSON.parse(req.postData())).toEqual({ source_type: 'album', source_id: 'ootb' });
    await expect(page.locator('#add-status')).toHaveText('Queued 3 tracks to Play Next');
    await expect(page.locator('#add-sheet')).toBeHidden();
    expect(posts).toHaveLength(1);          // one POST, never one per track
  });

  // Stories 3 + 5: queue the album with nothing playing, leave the album, and start
  // the queue from browse — it begins on album track 1 and the rest follow in order.
  test('the queued album starts at track 1 from browse and the Queue view lists the rest in album order', async ({ page }) => {
    await openAlbum(page);
    await queueAllAlbum(page);
    await expect(page.locator('#add-status')).toBeVisible();
    await page.keyboard.press('Escape');                  // back to browse
    await expect(page).toHaveURL(/browse\.html/);
    await expect(page.locator('#btn-play-queue-music')).toHaveText('🎵 (3)');
    await page.locator('#btn-play-queue-music').click();
    await expect(page).toHaveURL(/audio\.html\?.*playQueue=1/);
    await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');   // album track 1
    await page.keyboard.press('ArrowDown');               // summon the transport
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
    // The playing head is hidden from PLAY NEXT (it is playing, not pending); the
    // remaining two sit behind it in album order.
    await expect(page.locator('.q-row.queued .q-name')).toContainText(['Mr. Blue Sky', 'Sweet Talkin Woman']);
  });

  // Story 4
  test('a queued album jumps AHEAD of tracks already in Play Next', async ({ page }) => {
    await openAlbum(page);
    // Queue one track first, from the per-track sheet.
    await page.locator('.detail-row[data-id="ootb-03"] .detail-add').click();
    await expect(page.locator('#add-sheet')).toBeVisible();
    await page.locator('#add-sheet-list .add-queue').click();
    await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
    await queueAllAlbum(page);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/browse\.html/);
    await expect(page.locator('#btn-play-queue-music')).toHaveText('🎵 (4)');
    await page.locator('#btn-play-queue-music').click();
    await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');   // the album won
    await page.keyboard.press('ArrowDown');
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
    // The album's remaining tracks come first; the earlier pick trails them.
    await expect(page.locator('.q-row.queued .q-name')).toContainText(
      ['Mr. Blue Sky', 'Sweet Talkin Woman', 'Sweet Talkin Woman']);
  });

  // Story 6 — the per-track sheet is untouched.
  test('the per-track ＋ sheet still reads ☰ Play Next and still queues one track', async ({ page }) => {
    await openAlbum(page);
    await page.locator('.detail-row[data-id="ootb-02"] .detail-add').click();
    await expect(page.locator('#add-sheet')).toBeVisible();
    await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Play Next');
    const queued = page.waitForRequest(req =>
      req.url().includes('/api/playback/queue-track') && req.method() === 'POST');
    await page.locator('#add-sheet-list .add-queue').click();
    expect(JSON.parse((await queued).postData())).toEqual({ track_id: 'ootb-02' });
    await expect(page.locator('#add-status')).toHaveText('Queued to Play Next');
  });

  test('a failed queue-all says so and leaves the album screen up', async ({ page }) => {
    await openAlbum(page);
    await page.route('**/api/playback/queue-source**', route => route.abort());
    await queueAllAlbum(page);
    await expect(page.locator('#add-status')).toHaveText('Could not queue album.');
    await expect(page).toHaveURL(/album-detail\.html/);
  });
});

// ========================= companion (phone) ================================
test.describe('companion album detail', () => {
  const ALBUM = {
    id: 'ootb', title: 'Out of the Blue', profile: 'kids', poster: 'ootb.jpg',
    type: null, collectionType: 'album', artist: 'ELO', seasons: [],
    items: [
      { season: null, episode: 1, video: VIDEOS['ootb-01'] },
      { season: null, episode: 2, video: VIDEOS['ootb-02'] },
      { season: null, episode: 3, video: VIDEOS['ootb-03'] }
    ]
  };

  function mockApp(page, ctx) {
    let version = 1;
    return page.routeWebSocket(/:8766/, (ws) => {
      ws.onMessage(function(raw) {
        const m = JSON.parse(raw);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') {
          version += 1;
          ws.send(msg('context', Object.assign({ version: version }, ctx.context)));
          ws.send(msg('app_state', ctx.appState));
        }
      });
    });
  }

  async function openAlbum(page) {
    await installApi(page);
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(PLAYLIST_CARDS) })
    }));
    await page.route('**/api/series/ootb', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(ALBUM)
    }));
    await page.route('**/api/playback/queue-source**', route => route.fulfill({ status: 204, body: '' }));
    await mockApp(page, {
      context: { context_id: 'detail', series_id: 'ootb' },
      appState: { screen: 'detail', itemId: 'ootb', profile: 'kids', person: 'mom' }
    });
    await page.goto('/companion/detail.html');
    await expect(page.locator('.detail-track-row').first()).toBeVisible();
  }

  // Story 7 — the same journey on the phone.
  test('Add all opens a sheet whose top option queues the whole album for the active person', async ({ page }) => {
    await openAlbum(page);
    await page.locator('#btn-add-all').click();
    await expect(page.locator('#add-sheet')).toBeVisible();
    await expect(page.locator('#add-sheet-list > *').first()).toHaveClass(/add-queue/);
    await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Queue all album');
    const queued = page.waitForRequest(req =>
      req.url().includes('/api/playback/queue-source') && req.method() === 'POST');
    await page.locator('#add-sheet-list .add-queue').click();
    const req = await queued;
    expect(req.url()).toContain('person=mom');            // keyed on the active person
    expect(JSON.parse(req.postData())).toEqual({ source_type: 'album', source_id: 'ootb' });
    await expect(page.locator('#add-status')).toHaveText('Queued 3 tracks to Play Next');
    await expect(page.locator('#add-sheet')).toBeHidden();
  });

  // Story 6 on the companion — the per-track sheet is untouched.
  test('the per-track ＋ sheet still reads ☰ Play Next', async ({ page }) => {
    await openAlbum(page);
    await page.locator('.detail-add-btn[data-add="ootb-02"]').click();
    await expect(page.locator('#add-sheet-list .add-queue')).toHaveText('☰ Play Next');
  });

  test('a TV series offers no Add all control, so no queue-all', async ({ page }) => {
    await installApi(page);
    await mockApp(page, {
      context: { context_id: 'detail', series_id: 'bluey' },
      appState: { screen: 'detail', itemId: 'bluey', profile: 'kids', person: 'mom' }
    });
    await page.goto('/companion/detail.html');
    await expect(page.locator('.tile-btn').first()).toBeVisible();
    await expect(page.locator('#btn-add-all')).toHaveCount(0);
  });
});
