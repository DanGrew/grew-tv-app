const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend, installQueuePlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// FEAT-526/TASK-601 — ☰ Context on the couch remote sends `c`. On a browsing
// screen it presses the ＋ belonging to whatever is focused: a tile's ＋ badge
// (not a d-pad stop, so otherwise unreachable from the couch) or a row's ＋ /
// ＋ Queue. It presses the drawn control, so everything the control already does
// — which Queue it fills, the toast, the sheet and its focus return — comes with
// it. A press that should do nothing is proved by a second press that does, and
// asserting only the second one landed.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('grew-tv-person', 'kids'));
});

// Every queue-item POST, as `<media type>:<item id>`, in the order they arrive.
async function recordQueued(page) {
  const queued = [];
  await page.route('**/api/queue/*/queue-item**', function(route) {
    const mediaType = route.request().url().split('/api/queue/')[1].split('/')[0];
    queued.push(mediaType + ':' + JSON.parse(route.request().postData()).item_id);
    return route.fulfill({ status: 204, body: '' });
  });
  return queued;
}

async function pressContextOn(page, locator) {
  await locator.focus();
  await page.keyboard.press('c');
}

async function openFilms(page) {
  await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await expect(page.locator('.film-tile[data-id="finding-nemo-main"]')).toBeVisible();
}

test.describe('tiles', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await installVideoPlaybackBackend(page);
  });

  // Story 1
  test('Context on a focused film tile on Browse queues it and shows the toast, without playing it', async ({ page }) => {
    const queued = await recordQueued(page);
    await openFilms(page);
    const posted = page.waitForRequest(req => req.url().includes('/api/queue/film/queue-item') && req.method() === 'POST');
    await pressContextOn(page, page.locator('.film-tile[data-id="finding-nemo-main"]'));
    expect((await posted).url()).toContain('person=kids');
    await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
    await expect(page).toHaveURL(/browse\.html/);
    await expect(page.locator('.film-tile[data-id="finding-nemo-main"]')).toBeFocused();
    expect(queued).toEqual(['film:finding-nemo-main']);
  });

  // Story 1, on a rail grid
  test('Context on a focused film tile on a rail grid queues it', async ({ page }) => {
    const queued = await recordQueued(page);
    await page.goto('/app/homeview/rail-grid.html?section=films&rail=genre:animation&profile=kids&person=kids');
    await expect(page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue')).toBeVisible();
    await pressContextOn(page, page.locator('.film-tile[data-id="finding-nemo-main"]'));
    await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
    expect(queued).toEqual(['film:finding-nemo-main']);
  });

  // Story 7
  test('Context on a music video shelved on the Films rail queues it to Music Videos, as its ＋ does', async ({ page }) => {
    const queued = await recordQueued(page);
    await page.route('**/api/browse**', function(route) {
      const stray = { kind: 'video', id: 'mv-99', title: 'Stray Video', poster: 'mv-01.jpg', duration: 200, section: 'films', itemType: 'music-video', artist: 'QOTSA' };
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat([stray]) })
      });
    });
    await openFilms(page);
    await pressContextOn(page, page.locator('.film-tile[data-id="mv-99"]'));
    await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
    expect(queued).toEqual(['music-video:mv-99']);
  });

  // Story 5
  test('Context on a series tile, which has no ＋, does nothing', async ({ page }) => {
    const queued = await recordQueued(page);
    await page.goto('/app/homeview/browse.html?profile=kids&person=kids');
    await page.locator('.sidebar-tab[data-tab="series"]').click();
    await expect(page.locator('.film-tile[data-id="bluey"]')).toBeVisible();
    await pressContextOn(page, page.locator('.film-tile[data-id="bluey"]'));
    await expect(page.locator('.film-tile[data-id="bluey"]')).toBeFocused();
    await expect(page).toHaveURL(/browse\.html/);
    await page.locator('.sidebar-tab[data-tab="films"]').click();
    await pressContextOn(page, page.locator('.film-tile[data-id="finding-nemo-main"]'));
    await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
    expect(queued).toEqual(['film:finding-nemo-main']);
  });

  // Story 5
  test('Context on a tab does nothing', async ({ page }) => {
    const queued = await recordQueued(page);
    await openFilms(page);
    await pressContextOn(page, page.locator('.sidebar-tab[data-tab="films"]'));
    await pressContextOn(page, page.locator('.film-tile[data-id="finding-nemo-main"]'));
    await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
    expect(queued).toEqual(['film:finding-nemo-main']);
  });

  // Risk — a ＋ that is not drawn is never pressed.
  test('Context never presses a ＋ that is not drawn', async ({ page }) => {
    const queued = await recordQueued(page);
    await openFilms(page);
    await page.locator('.film-tile[data-id="finding-nemo-main"] .tile-queue').evaluate(el => { el.style.display = 'none'; });
    await pressContextOn(page, page.locator('.film-tile[data-id="finding-nemo-main"]'));
    await pressContextOn(page, page.locator('.film-tile[data-id="toy-story-main"]').first());
    await expect(page.locator('#queue-status')).toHaveText('Added to Queue');
    expect(queued).toEqual(['film:toy-story-main']);
  });
});

test.describe('track rows', () => {
  test.beforeEach(async ({ page }) => {
    await installApi(page);
    await installQueuePlaybackBackend(page, 'music');
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS) })
    }));
    await page.goto('/app/homeview/profile.html');
  });

  async function openFromMusic(page, tileId, url) {
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
    await page.locator('.sidebar-tab[data-tab="music"]').click();
    await page.locator('.film-tile[data-id="' + tileId + '"]').click();
    await expect(page).toHaveURL(url);
    await expect(page.locator('.detail-row').first()).toBeVisible();
  }

  // Stories 2 and 6
  for (const where of [
    { name: 'album', tile: 'ootb', url: /album-detail\.html/, row: 'ootb-02' },
    { name: 'artist', tile: 'artist:ELO', url: /artist\.html/, row: 'ootb-01' },
    { name: 'playlist', tile: 'pl-roadtrip', url: /playlist-detail\.html/, row: 'ootb-01' }
  ]) {
    test('Context on a focused track row on the ' + where.name + ' page opens its add sheet, and Home returns to the row', async ({ page }) => {
      await openFromMusic(page, where.tile, where.url);
      const row = page.locator('.detail-row[data-id="' + where.row + '"]');
      await pressContextOn(page, row);
      await expect(page.locator('#add-sheet')).toBeVisible();
      await expect(page.locator('#add-sheet-list .add-queue')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('#add-sheet')).toBeHidden();
      await expect(row).toBeFocused();
      await expect(page).toHaveURL(where.url);
    });
  }

  // Story 2 — the sheet is the track's own: its queue option queues that track.
  test('the sheet Context opens queues the track it was opened for', async ({ page }) => {
    await openFromMusic(page, 'ootb', /album-detail\.html/);
    await pressContextOn(page, page.locator('.detail-row[data-id="ootb-02"]'));
    await expect(page.locator('#add-sheet-list .add-queue')).toBeFocused();   // the sheet has loaded and taken focus
    const posted = page.waitForRequest(req => req.url().includes('/api/queue/music/queue-item') && req.method() === 'POST');
    await page.keyboard.press('Enter');
    expect(JSON.parse((await posted).postData())).toEqual({ item_id: 'ootb-02' });
    await expect(page.locator('#add-status')).toHaveText('Added to Queue');
  });

  // Story 4
  test('Context on a playlist row\'s ✕ still opens the add sheet for that row, and removes nothing', async ({ page }) => {
    let removed = false;
    await page.route('**/api/playlists/remove-track**', function(route) { removed = true; return route.fulfill({ status: 204, body: '' }); });
    await openFromMusic(page, 'pl-roadtrip', /playlist-detail\.html/);
    await pressContextOn(page, page.locator('.detail-row[data-id="ootb-01"] .detail-remove'));
    await expect(page.locator('#add-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.detail-row[data-id="ootb-01"]')).toBeFocused();
    expect(removed).toBe(false);
  });

  // Story 5
  test('Context on a crumb does nothing', async ({ page }) => {
    await openFromMusic(page, 'ootb', /album-detail\.html/);
    await pressContextOn(page, page.locator('#breadcrumb .crumb-link').first());
    await expect(page.locator('#add-sheet')).toBeHidden();
    await expect(page).toHaveURL(/album-detail\.html/);
    await expect(page.locator('#breadcrumb .crumb-link').first()).toBeFocused();
    await pressContextOn(page, page.locator('.detail-row[data-id="ootb-02"]'));
    await expect(page.locator('#add-sheet')).toBeVisible();
  });

  // The sheet owns its keys: Context inside it opens nothing further.
  test('Context while the add sheet is open leaves the sheet as it is', async ({ page }) => {
    await openFromMusic(page, 'ootb', /album-detail\.html/);
    await pressContextOn(page, page.locator('.detail-row[data-id="ootb-02"]'));
    await expect(page.locator('#add-sheet-list .add-queue')).toBeFocused();
    await page.keyboard.press('c');
    await expect(page.locator('#add-sheet-list .add-queue')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.detail-row[data-id="ootb-02"]')).toBeFocused();
  });
});

// Story 3
test('Context on a focused episode row on a series page queues it to TV Series', async ({ page }) => {
  await installApi(page);
  const queued = await recordQueued(page);
  await page.goto('/app/homeview/detail.html?series=bluey&profile=kids');
  await expect(page.locator('.detail-row')).toHaveCount(3);
  await pressContextOn(page, page.locator('.detail-row[data-id="bluey-s1e02"]'));
  await expect.poll(() => queued).toEqual(['series:bluey-s1e02']);
  await expect(page).toHaveURL(/detail\.html/);
});

// Story 5 — a home-movie clip: the list is not one of Context's screens.
test('Context on a home-movie clip row does nothing', async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'home-movie');
  const queued = await recordQueued(page);
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="home-movies"]').click();
  await page.locator('.film-tile[data-id="play-all:All"]').click();
  await expect(page).toHaveURL(/home-movies-list\.html/);
  await pressContextOn(page, page.locator('.detail-row[data-id="beach-day"]'));
  await page.locator('.detail-row[data-id="beach-day"] .detail-queue').click();
  await expect.poll(() => queued.length).toBe(1);
  expect(queued).toEqual(['home-movie:beach-day']);
});
