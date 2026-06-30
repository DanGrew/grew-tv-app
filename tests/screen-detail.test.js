const { test, expect } = require('@playwright/test');
const { installApi, installVideoPlaybackBackend } = require('./fixtures/api.js');

// Host-agnostic: the app derives its backend from the page origin (BUG-009).
const BROWSE_URL = '**/api/browse**';

// Home rails (TASK-117): tiles are addressed by data-id, not grid position.
const SERIES_TILE = '.film-tile[data-id="bluey"]';
const VIDEO_TILE = '.film-tile[data-id="toy-story-main"]';

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installVideoPlaybackBackend(page);
  await page.goto('/app/homeview/profile.html');
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

async function openDetail(page) {
  await page.locator(SERIES_TILE).click();
  await expect(page.locator('#screen-detail')).toBeVisible();
  await expect(page.locator('.detail-row').first()).toBeVisible();
}

test('series tile opens detail screen, not video', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('#screen-video')).not.toBeVisible();
  await expect(page.locator('#detail-title')).toContainText('Bluey');
});

test('detail onEnter focuses the Play next action', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('#btn-play-next')).toBeFocused();
});

test('detail renders all series items as rows', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('.detail-row')).toHaveCount(3);
});

test('detail meta line shows the type label and clip count (TASK-136)', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('#detail-meta')).toHaveText('Cartoons · 3 clips');
});

test('Play next button names the next episode (TASK-136)', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('#btn-play-next')).toContainText('Play next — "Daddy Putdown" (1)');
});

test('the play-next row carries a NEXT tag (TASK-136)', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('.detail-row[data-id="bluey-s1e01"] .detail-tag')).toHaveText('NEXT');
});

test('detail header shows the series poster art (TASK-121)', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('#detail-header-poster')).toHaveAttribute('src', /bluey\.jpg$/);
});

test('detail groups episodes under a season header', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('.detail-season')).toHaveCount(1);
  await expect(page.locator('.detail-season').first()).toContainText('Season 1');
});

test('ArrowDown moves focus to next detail row', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.detail-row').nth(1)).toBeFocused();
});

test('ArrowUp moves focus to previous detail row', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').nth(1).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.detail-row').first()).toBeFocused();
});

test('ArrowUp from first row moves focus to Play next', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#btn-play-next')).toBeFocused();
});

test('Escape from detail returns to browse', async ({ page }) => {
  await openDetail(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await expect(page.locator('#screen-detail')).not.toBeVisible();
});

test('Backspace from detail returns to browse', async ({ page }) => {
  await openDetail(page);
  await page.keyboard.press('Backspace');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('TASK-243: no Back button — breadcrumb Home returns to browse', async ({ page }) => {
  await openDetail(page);
  await expect(page.locator('#btn-back-detail')).toHaveCount(0);
  await page.locator('#breadcrumb .crumb-link').first().click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('browse source tile is re-focused on back from detail', async ({ page }) => {
  const seriesTile = page.locator(SERIES_TILE);
  await seriesTile.focus();
  await seriesTile.click();
  await expect(page.locator('#screen-detail')).toBeVisible();
  await expect(page.locator('.detail-row').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(seriesTile).toBeFocused();
});

test('Enter on detail row plays video', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
});

test('Escape from video after detail returns to detail', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-detail')).toBeVisible();
});

test('series video shows Up next countdown then advances on end', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/);
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#upnext-overlay')).toBeVisible();
  await expect(page.locator('#upnext-text')).toContainText('The Weekend');
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e02/, { timeout: 8000 });
});

test('last episode end loops back to the first (BUG-005)', async ({ page }) => {
  await openDetail(page);
  await page.locator('.detail-row').nth(2).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e03/);
  // BUG-005 decision: at the end of the series Next/auto-advance wrap to the
  // first episode (no stop, no return-to-detail). The Up next countdown shows
  // the first episode, then it plays.
  await page.evaluate(() => document.getElementById('video').dispatchEvent(new Event('ended')));
  await expect(page.locator('#upnext-overlay')).toBeVisible();
  await expect(page.locator('#upnext-text')).toContainText('Daddy Putdown');
  await expect(page.locator('#video')).toHaveAttribute('src', /bluey-s1e01/, { timeout: 8000 });
});

test.describe('season selector (TASK-123)', () => {
  // The multi-season fixture is reached by direct nav (it is on no browse rail),
  // keeping it clear of the rail-count suites. The profile pick in beforeEach has
  // already set the kids profile/person in localStorage for this origin.
  // 1x1 PNG so the season/series posters actually decode — the default /media/**
  // fixture serves an empty body, which fires <img> onerror and would walk the
  // poster fallback chain past the season art we want to assert.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

  async function openSeasons(page) {
    await page.route('**/media/ib*.jpg', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await page.goto('/app/homeview/detail.html?series=inbetweeners');
    await expect(page.locator('#screen-detail')).toBeVisible();
    await expect(page.locator('.season-chip').first()).toBeVisible();
  }

  test('renders a chip per declared season', async ({ page }) => {
    await openSeasons(page);
    await expect(page.locator('.season-chip')).toHaveCount(2);
    await expect(page.locator('.season-chip')).toHaveText(['Season 1', 'Season 2']);
  });

  test('default chip is the Play-next season, filtered with no inline dividers', async ({ page }) => {
    await openSeasons(page);
    await expect(page.locator('.season-chip[data-season="1"]')).toHaveClass(/active/);
    await expect(page.locator('.detail-row')).toHaveCount(2);
    await expect(page.locator('.detail-row[data-id="ib-s1e1"]')).toBeVisible();
    await expect(page.locator('.detail-season')).toHaveCount(0);
    await expect(page.locator('#detail-header-poster')).toHaveAttribute('src', /ib-s1\.jpg$/);
  });

  test('selecting a season filters the list and swaps the header poster', async ({ page }) => {
    await openSeasons(page);
    await page.locator('.season-chip[data-season="2"]').focus();
    await expect(page.locator('.season-chip[data-season="2"]')).toHaveClass(/active/);
    await expect(page.locator('.season-chip[data-season="1"]')).not.toHaveClass(/active/);
    await expect(page.locator('.detail-row')).toHaveCount(1);
    await expect(page.locator('.detail-row[data-id="ib-s2e1"]')).toBeVisible();
    await expect(page.locator('#detail-header-poster')).toHaveAttribute('src', /ib-s2\.jpg$/);
  });

  test('ArrowRight moves between season chips and re-filters', async ({ page }) => {
    await openSeasons(page);
    await page.locator('.season-chip[data-season="1"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.season-chip[data-season="2"]')).toBeFocused();
    await expect(page.locator('.detail-row')).toHaveCount(1);
  });

  test('ArrowDown leaves the chip row for the first episode and back up', async ({ page }) => {
    await openSeasons(page);
    await page.locator('.season-chip[data-season="1"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.detail-row').first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.season-chip[data-season="1"]')).toBeFocused();
  });

  test('a seasons-less series shows no chips (legacy single list)', async ({ page }) => {
    await openDetail(page);
    await expect(page.locator('.season-chip')).toHaveCount(0);
    await expect(page.locator('#season-chips')).toBeHidden();
  });
});

test('Escape on browse does not crash or navigate away', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('video onEnter focuses play-pause button', async ({ page }) => {
  await page.locator('.sidebar-tab[data-tab="films"]').click();
  await page.locator(VIDEO_TILE).first().click();
  await expect(page.locator('#screen-video')).toBeVisible();
  await expect(page.locator('#btn-play-pause')).toBeFocused();
});

test.describe('error screen entry', () => {
  test('error onEnter focuses retry button', async ({ page }) => {
    await page.route(BROWSE_URL, route => route.fulfill({ status: 500 }));
    await page.goto('/app/homeview/profile.html');
    await page.locator('#btn-kids').click();
    await expect(page.locator('#screen-error')).toBeVisible();
    await expect(page.locator('#btn-retry')).toBeFocused();
  });
});
