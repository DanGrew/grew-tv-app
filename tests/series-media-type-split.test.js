const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, BOXSET_CARDS } = require('./fixtures/api.js');

// TASK-542 (FEAT-541) — TV series is its own media type, and this is the pair of
// journeys that separates it from films end to end.
//
// A TV series and a film boxset reach detail.html, and the player after it,
// through the SAME `?series=` param — detail.html/loadSeries have always served
// both identically. That was harmless while both played as films. Now it
// decides which Queue an item enters, so `collectionType` rides beside the id
// (TASK-503 skipped threading it as "purely cosmetic"; it isn't any more).
//
// Story 1: an episode ＋'d and a film ＋'d land in different Queues, and neither
//          list shows the other's item.
// Story 3: a film inside a BOXSET lands in the Films Queue — a boxset is films,
//          not a series.

async function installBoth(page) {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(BOXSET_CARDS) })
  }));
  return {
    film: await installQueuePlaybackBackend(page, 'film'),
    series: await installQueuePlaybackBackend(page, 'series')
  };
}

test.describe('which Queue a ＋ press fills', () => {
  test('an episode goes to the TV Series Queue and a boxset film to the Films Queue', async ({ page }) => {
    await installBoth(page);

    // ＋ an EPISODE off the TV series' own detail list.
    const episodeQueued = page.waitForRequest(req =>
      req.url().includes('/api/queue/series/queue-item') && req.method() === 'POST');
    await page.goto('/app/homeview/detail.html?series=bluey&profile=kids');
    await expect(page.locator('.detail-row')).toHaveCount(3);
    await page.locator('.detail-row[data-id="bluey-s1e02"] .detail-queue').click();
    expect(JSON.parse((await episodeQueued).postData())).toEqual({ item_id: 'bluey-s1e02' });

    // ＋ a FILM off the boxset's detail list — the same list markup, the same
    // control, a different Queue, decided by the item's own itemType.
    const filmQueued = page.waitForRequest(req =>
      req.url().includes('/api/queue/film/queue-item') && req.method() === 'POST');
    await page.goto('/app/homeview/detail.html?series=toy-box&profile=kids');
    await expect(page.locator('.detail-row')).toHaveCount(2);
    await page.locator('.detail-row[data-id="finding-nemo-main"] .detail-queue').click();
    expect(JSON.parse((await filmQueued).postData())).toEqual({ item_id: 'finding-nemo-main' });
  });

  test('neither Queue shows the other\'s item', async ({ page }) => {
    const backends = await installBoth(page);
    backends.series.seed('queue-item', { item_id: 'bluey-s1e02' });
    backends.film.seed('queue-item', { item_id: 'finding-nemo-main' });

    const series = backends.series.snapshot();
    const film = backends.film.snapshot();
    expect(series.queue.map(e => e.item_id)).toEqual(['bluey-s1e02']);
    expect(film.queue.map(e => e.item_id)).toEqual(['finding-nemo-main']);
  });
});

test.describe('which engine a collection opens', () => {
  test('a TV series plays on the series engine, naming a series source', async ({ page }) => {
    await installBoth(page);
    const played = page.waitForRequest(req =>
      req.url().includes('/api/queue/series/play-source') && req.method() === 'POST');
    await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&collectionType=series&from=detail');
    expect(JSON.parse((await played).postData())).toEqual({ source_type: 'series', source_id: 'bluey' });
  });

  // Story 3 at the player: a boxset stays films. Getting this branch wrong is
  // where it shows — the app would open a boxset under media_type 'series' and
  // file its films in the TV Series Queue.
  test('a boxset plays on the film engine, naming a boxset source', async ({ page }) => {
    await installBoth(page);
    const played = page.waitForRequest(req =>
      req.url().includes('/api/queue/film/play-source') && req.method() === 'POST');
    await page.goto('/app/homeview/video.html?video=toy-story-main&series=toy-box&collectionType=boxset&from=detail');
    expect(JSON.parse((await played).postData())).toEqual({ source_type: 'boxset', source_id: 'toy-box' });
  });

  // The detail page is what stamps the type onto the nav, off the collection it
  // already holds. Without that, a boxset opened from its own detail page would
  // fall through to the unstamped default and read as a TV series.
  test('the boxset detail page stamps its own type onto the player nav', async ({ page }) => {
    await installBoth(page);
    await page.goto('/app/homeview/detail.html?series=toy-box&profile=kids');
    await expect(page.locator('.detail-row')).toHaveCount(2);
    await page.locator('.detail-row[data-id="toy-story-main"]').click();
    await expect(page).toHaveURL(/collectionType=boxset/);
  });

  test('the series detail page stamps series', async ({ page }) => {
    await installBoth(page);
    await page.goto('/app/homeview/detail.html?series=bluey&profile=kids');
    await expect(page.locator('.detail-row')).toHaveCount(3);
    await page.locator('.detail-row[data-id="bluey-s1e01"]').click();
    await expect(page).toHaveURL(/collectionType=series/);
  });
});
