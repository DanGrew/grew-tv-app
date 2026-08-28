const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');

// BUG-532 (FEAT-497) — the TV's Queue is sized for the TV. The shell shipped
// companion-first (docs/QUEUE-UX-SHELL.md's Frame section) and the TV pages
// took the phone's own numbers verbatim: `.qs-hero`/`.qs-tabbar`/`.qs-panel`
// boxed to `max-width: 390px` — an iPhone viewport — inside the 880px `.queue`
// column, with 36/44px transport, a 48px row thumb and 18px type. From the
// sofa that reads as a phone screenshot pasted into the middle of the TV.
//
// TASK-515 left the two surfaces free to size apart: one renderer emits the
// `.qs-*` markup and each surface's own <style> block defines the classes.
// So these numbers come from the TV's OWN screens, not from a scale invented
// here — `.now-playing`/`.np-art` and `.q-*`/`.qtab` in the same queue overlay,
// and `.detail-row`/`.detail-thumb`/`.detail-label` on the detail screen.
//
// The phone is the other half of this: companion-*-queue suites hold the
// 390px-native metrics, and tests/companion-queue-phone-metrics.test.js locks
// the classes the two surfaces share by NAME (`.qs-art`, `.qs-tbtn-*`) so a
// value edited in the wrong <style> block can't silently reshape the phone.

const TV = {
  art: 96,          // .np-art, the TV queue's own now-playing art
  tbtnSm: 44,       // .ctrl-btn, the TV's standard transport button
  tbtnLg: 56,       // the primary, sized to hold the fs-lg glyph .ctrl-btn uses
  thumb: 60,        // .detail-thumb
  act: 40,          // .q-act
  nameFont: '26px', // --fs-md, .detail-label
  subFont: '18px',  // --fs-xs, .detail-duration
  tabFont: '20px'   // .qtab
};

// Query and measure in the SAME evaluate. The shell repaints by replacing its
// markup wholesale on every snapshot the engine pushes, so a node resolved by a
// locator can be detached by the time it is measured a tick later — a detached
// node reports 0×0 with empty computed styles, which reads as a real failure.
// document.querySelector inside the page closes that window.
async function boxOf(page, selector) {
  return page.evaluate(sel => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  }, selector);
}

async function fontOf(page, selector) {
  return page.evaluate(sel => getComputedStyle(document.querySelector(sel)).fontSize, selector);
}

// Story 1 — the shell uses the width the TV's queue column gives it, instead of
// a phone-width strip down the middle of it.
async function expectFullWidthShell(page) {
  const column = await boxOf(page, '.queue');
  expect(column.w).toBeGreaterThan(390);
  expect(await boxOf(page, '.qs-hero')).toMatchObject({ w: column.w });
  expect(await boxOf(page, '.qs-tabbar')).toMatchObject({ w: column.w });
  expect(await boxOf(page, '.qs-panel.active')).toMatchObject({ w: column.w });
}

// Story 2 — hero, transport and tabs at the scale of the TV's other screens.
async function expectTvHeroAndTabs(page) {
  expect(await boxOf(page, '.qs-art')).toEqual({ w: TV.art, h: TV.art });
  expect(await boxOf(page, '.qs-tbtn-sm')).toEqual({ w: TV.tbtnSm, h: TV.tbtnSm });
  expect(await boxOf(page, '.qs-tbtn-lg')).toEqual({ w: TV.tbtnLg, h: TV.tbtnLg });
  expect(await fontOf(page, '.qs-tab')).toBe(TV.tabFont);
}

// Story 2 — and the rows with them.
async function expectTvRows(page) {
  const panel = '.qs-panel.active ';
  expect(await boxOf(page, panel + '.qs-thumb')).toEqual({ w: TV.thumb, h: TV.thumb });
  expect(await boxOf(page, panel + '.qs-act')).toEqual({ w: TV.act, h: TV.act });
  expect(await fontOf(page, panel + '.qs-name')).toBe(TV.nameFont);
  expect(await fontOf(page, panel + '.qs-sub')).toBe(TV.subFont);
}

// Story 4 — every media type, because the fix lands in the two TV pages'
// own <style> blocks: video.html serves films, TV series, home movies and music
// videos, audio.html serves music. A type per page would prove the CSS; a type
// per TYPE proves the shell reaches every one of them at that size.

// TASK-542 — this one opens a TV SERIES, which is its own media type now, so
// it drives the series engine. The shell's own metrics are the same for every
// type; what this proves is that the fifth type reaches them too.
test.describe('the TV series Queue on the TV', () => {
  async function openQueue(page) {
    await installApi(page);
    const backend = await installQueuePlaybackBackend(page, 'series');
    backend.seed('play-source', { source_type: 'series', source_id: 'bluey' });
    backend.seed('queue-item', { item_id: 'bluey-s1e03' });
    await page.goto('/app/homeview/video.html?video=bluey-s1e01&series=bluey&from=detail');
    await expect(page.locator('#video-upnext')).toHaveText('Up next: Hammerbarn');
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  }

  test('fills the queue column instead of a 390px strip', async ({ page }) => {
    await openQueue(page);
    await expectFullWidthShell(page);
  });

  test('renders hero, transport, tabs and rows at TV scale', async ({ page }) => {
    await openQueue(page);
    await expectTvHeroAndTabs(page);
    await expectTvRows(page);
  });
});

test.describe('the home-movie Queue on the TV', () => {
  async function openQueue(page) {
    await installApi(page);
    const backend = await installQueuePlaybackBackend(page, 'home-movie');
    backend.seed('queue-item', { item_id: 'beach-day' });
    await page.goto('/app/homeview/video.html?homeMoviesAll=1&from=browse');
    await expect(page.locator('#video')).toHaveAttribute('src', /millie-walk/);
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  }

  test('fills the queue column instead of a 390px strip', async ({ page }) => {
    await openQueue(page);
    await expectFullWidthShell(page);
  });

  test('renders hero, transport, tabs and rows at TV scale', async ({ page }) => {
    await openQueue(page);
    await expectTvHeroAndTabs(page);
    await expectTvRows(page);
  });
});

test.describe('the music-video Queue on the TV', () => {
  async function openQueue(page) {
    await installApi(page);
    const backend = await installQueuePlaybackBackend(page, 'music-video');
    backend.seed('play-source', { source_type: 'mv-artist', source_id: 'QOTSA' });
    backend.seed('queue-item', { item_id: 'mv-03' });
    await page.goto('/app/homeview/video.html?musicVideoArtist=QOTSA&from=browse');
    await expect(page.locator('#video-upnext')).toHaveText('Up next: Starlight');
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  }

  test('fills the queue column instead of a 390px strip', async ({ page }) => {
    await openQueue(page);
    await expectFullWidthShell(page);
  });

  test('renders hero, transport, tabs and rows at TV scale', async ({ page }) => {
    await openQueue(page);
    await expectTvHeroAndTabs(page);
    await expectTvRows(page);
  });
});

test.describe('the music Queue on the TV', () => {
  async function openQueue(page) {
    await installApi(page);
    await page.route('**/api/browse**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
    }));
    const backend = await installQueuePlaybackBackend(page, 'music');
    backend.seed('play-source', { source_type: 'album', source_id: 'ootb' });
    backend.seed('queue-item', { item_id: 'dancing-queen' });
    await page.goto('/app/homeview/audio.html?album=ootb&track=ootb-01&from=detail-album');
    await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
    await page.keyboard.press('ArrowDown');           // summon the transport (auto-hides)
    await page.locator('#btn-queue').click();
    await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
  }

  test('fills the queue column instead of a 390px strip', async ({ page }) => {
    await openQueue(page);
    await expectFullWidthShell(page);
  });

  test('renders hero, transport, tabs and rows at TV scale', async ({ page }) => {
    await openQueue(page);
    await expectTvHeroAndTabs(page);
    await expectTvRows(page);
  });
});
